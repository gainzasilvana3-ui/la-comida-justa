import { z } from 'zod';
import { ACTIVATION_LENGTH, ACTIVATION_PREFIX, normalizeCode, randomCode } from '@lcj/shared';
import type { Env } from './env';
import { claimHash, hmac, newId, safeEqual } from './crypto';
import { HttpError, json } from './http';
import { getSettings } from './settings';

// Aviso de ventas de Impultienda (https://impultienda.ar/docs/webhooks).
// Cada venta que incluye la app crea una licencia que el comprador activa con su mail y número de pedido.

const MAX_BODY = 64 * 1024;
const MAX_SKEW = 300;
const enc = new TextEncoder();

const payloadSchema = z.object({
  id: z.string().max(100),
  event: z.string().max(60),
  test: z.boolean().optional(),
  data: z.object({
    order_id: z.string().min(1).max(100),
    order_number: z.union([z.number(), z.string()]),
    status: z.string().max(40).optional(),
    test: z.boolean().optional(),
    customer: z.object({ email: z.string().max(320) }).partial().optional(),
    items: z.array(z.object({ product_id: z.string().max(100), type: z.string().max(20).optional() }).passthrough()).default([]),
    is_post_purchase: z.boolean().optional(),
  }),
});

async function verifySignature(secret: string, timestamp: string, body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(hex, signature.toLowerCase());
}

function productIds(env: Env): Set<string> {
  return new Set(
    (env.APP_PRODUCT_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** POST /webhooks/impultienda */
export async function impultiendaWebhook(req: Request, env: Env): Promise<Response> {
  // Sin configurar se responde 503: Impultienda reintenta y no se pierde la venta mientras se arregla.
  if (!env.IMPULTIENDA_WEBHOOK_SECRET || productIds(env).size === 0) {
    console.error('Aviso de Impultienda recibido sin IMPULTIENDA_WEBHOOK_SECRET o APP_PRODUCT_IDS.');
    throw new HttpError(503, 'not_configured', 'Webhook sin configurar.');
  }
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > MAX_BODY) throw new HttpError(413, 'too_large', 'Demasiado grande.');
  const body = await req.text();
  if (body.length > MAX_BODY) throw new HttpError(413, 'too_large', 'Demasiado grande.');

  const timestamp = req.headers.get('X-Impultienda-Timestamp') ?? '';
  const signature = req.headers.get('X-Impultienda-Signature') ?? '';
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW) {
    throw new HttpError(401, 'stale_timestamp', 'Aviso vencido.');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(signature) || !(await verifySignature(env.IMPULTIENDA_WEBHOOK_SECRET, timestamp, body, signature))) {
    throw new HttpError(401, 'bad_signature', 'Firma inválida.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON inválido.');
  }
  const parsed = payloadSchema.safeParse(raw);
  // Un aviso firmado que no entendemos se da por recibido: reintentarlo no lo arregla.
  if (!parsed.success) return json({ ok: false, reason: 'unexpected_payload' });
  const { event, data } = parsed.data;

  const ids = productIds(env);
  if (!data.items.some((i) => ids.has(i.product_id))) return json({ ok: false, reason: 'product_not_mapped' });
  if (parsed.data.test || data.test || data.order_id.startsWith('TEST-')) return json({ ok: true, test: true });

  const now = Math.floor(Date.now() / 1000);
  const orderNumber = String(data.order_number);

  if (event === 'order.approved') {
    const claim = await claimHash(env, data.customer?.email ?? '', orderNumber);
    if (!claim) return json({ ok: false, reason: 'missing_customer' });
    const settings = await getSettings(env);
    // El código de compra no se muestra a nadie: el comprador entra con mail + pedido. Si hace falta uno,
    // el panel lo genera con "Generar código nuevo".
    const code = randomCode(ACTIVATION_PREFIX, ACTIVATION_LENGTH);
    const codeHash = await hmac(env, 'act', normalizeCode(code, ACTIVATION_PREFIX)!);
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO licenses (id, code_hash, status, max_devices, batch, reference, created_at, order_id, claim_hash)
       VALUES (?1, ?2, 'active', ?3, 'impultienda', ?4, ?5, ?6, ?7)`,
    )
      .bind(newId(), codeHash, settings.default_max_devices, `Pedido ${orderNumber}`, now, data.order_id, claim)
      .run();
    if (res.meta.changes === 1) {
      await env.DB.prepare('INSERT INTO audit_log (at, admin, action, detail) VALUES (?1, ?2, ?3, ?4)')
        .bind(now, 'impultienda', 'venta_impultienda', JSON.stringify({ order: orderNumber, postPurchase: data.is_post_purchase ?? false }))
        .run();
    }
    return json({ ok: true, created: res.meta.changes === 1 });
  }

  if (event === 'order.refunded' || event === 'order.chargeback') {
    const reason = event === 'order.refunded' ? 'Reembolso' : 'Contracargo';
    const res = await env.DB.prepare(
      "UPDATE licenses SET status = 'revoked', revoked_at = ?1, revoke_reason = ?2 WHERE order_id = ?3 AND status = 'active'",
    )
      .bind(now, `${reason} en Impultienda (pedido ${orderNumber})`, data.order_id)
      .run();
    if (res.meta.changes === 1) {
      await env.DB.prepare('INSERT INTO audit_log (at, admin, action, detail) VALUES (?1, ?2, ?3, ?4)')
        .bind(now, 'impultienda', 'revocar', JSON.stringify({ order: orderNumber, reason }))
        .run();
    }
    return json({ ok: true, revoked: res.meta.changes === 1 });
  }

  return json({ ok: false, reason: 'event_ignored' });
}
