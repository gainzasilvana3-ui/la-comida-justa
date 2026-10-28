import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshIp, newDevice, renewBody, setup, type TestCtx } from './helpers';

const SECRET = 'clave-de-firma-de-prueba';
const APP_PRODUCT = '317d1783-4b96-4b21-befb-ba389c13627b';
const EBOOK = '9370251d-95b9-40e9-8bd4-b04ed633f9ee';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup({ IMPULTIENDA_WEBHOOK_SECRET: SECRET, APP_PRODUCT_IDS: `otro-producto, ${APP_PRODUCT}` });
}, 60_000);
afterAll(() => ctx?.dispose());

let orderCounter = 5000;
function order(extra: Record<string, unknown> = {}, items = [{ product_id: EBOOK, type: 'main' }, { product_id: APP_PRODUCT, type: 'upsell' }]) {
  const n = orderCounter++;
  return {
    id: crypto.randomUUID(),
    event: 'order.approved',
    created_at: new Date().toISOString(),
    data: {
      order_id: crypto.randomUUID(),
      order_number: n,
      status: 'approved',
      customer: { email: `Compradora${n}@Mail.com`, name: 'Ana' },
      items: items.map((i) => ({ name: 'x', price: 1, quantity: 1, ...i })),
      is_post_purchase: false,
      ...extra,
    },
  };
}

function send(payload: unknown, opts: { secret?: string; ts?: number; event?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', opts.secret ?? SECRET).update(`${ts}.${body}`).digest('hex');
  return ctx.fetch('/webhooks/impultienda', {
    method: 'POST',
    body,
    headers: { 'X-Impultienda-Timestamp': ts, 'X-Impultienda-Signature': sig, 'X-Impultienda-Event': opts.event ?? 'order.approved' },
  });
}

async function claim(email: string, orderNumber: string, dev?: Awaited<ReturnType<typeof newDevice>>) {
  const d = dev ?? (await newDevice());
  const res = await ctx.fetch('/v1/claim', {
    method: 'POST',
    body: JSON.stringify({ email, orderNumber, publicJwk: d.jwk, turnstileToken: 'ok-turnstile' }),
    ip: freshIp(),
  });
  return { res, dev: d, data: (await res.json()) as Record<string, unknown> };
}

describe('aviso de Impultienda', () => {
  it('rechaza firma inválida, timestamp viejo y GET', async () => {
    expect((await send(order(), { secret: 'otra-clave' })).status).toBe(401);
    expect((await send(order(), { ts: Math.floor(Date.now() / 1000) - 600 })).status).toBe(401);
    expect((await ctx.fetch('/webhooks/impultienda')).status).toBe(405);
  });

  it('una venta sin la app no crea nada', async () => {
    const res = await send(order({}, [{ product_id: EBOOK, type: 'main' }]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, reason: 'product_not_mapped' });
  });

  it('los avisos de prueba no guardan nada', async () => {
    const p = order({ test: true });
    expect(await (await send(p)).json()).toEqual({ ok: true, test: true });
    const p2 = order();
    p2.data.order_id = `TEST-${p2.data.order_id}`;
    expect(await (await send(p2)).json()).toEqual({ ok: true, test: true });
    expect((await claim(p.data.customer.email, String(p.data.order_number))).res.status).toBe(404);
  });

  it('venta con la app: crea la licencia una sola vez y se activa con mail y pedido', async () => {
    const p = order();
    expect(await (await send(p)).json()).toEqual({ ok: true, created: true });
    // reintento del mismo aviso: no duplica
    expect(await (await send(p)).json()).toEqual({ ok: true, created: false });

    // otro mail o pedido: no entra
    expect((await claim('otra@mail.com', String(p.data.order_number))).res.status).toBe(404);
    expect((await claim(p.data.customer.email, '1')).res.status).toBe(404);

    // mayúsculas, espacios y "#" no importan
    const ok = await claim(`  ${p.data.customer.email.toLowerCase()} `, `#${p.data.order_number}`);
    expect(ok.res.status).toBe(200);
    expect(String(ok.data.recoveryCode)).toMatch(/^RCP-/);
    expect(ok.data.maxDevices).toBe(2);

    // segunda vez: ya activada, se usa el código de recuperación
    const again = await claim(p.data.customer.email, String(p.data.order_number));
    expect(again.res.status).toBe(409);
    expect(again.data.error).toBe('code_used');
    const rec = await ctx.fetch('/v1/recover', {
      method: 'POST',
      body: JSON.stringify({ recoveryCode: ok.data.recoveryCode, publicJwk: (await newDevice()).jwk, turnstileToken: 'ok-turnstile' }),
      ip: freshIp(),
    });
    expect(rec.status).toBe(200);

    // queda en el panel con el número de pedido
    const list = (await (await ctx.admin(`licenses?q=${p.data.order_number}`)).json()) as { licenses: { reference: string; batch: string }[] };
    expect(list.licenses[0]).toMatchObject({ reference: `Pedido ${p.data.order_number}`, batch: 'impultienda' });
  });

  it('pide Turnstile para activar', async () => {
    const res = await ctx.fetch('/v1/claim', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.com', orderNumber: '1', publicJwk: (await newDevice()).jwk }),
      ip: freshIp(),
    });
    expect(res.status).toBe(403);
  });

  it('reembolso y contracargo revocan la licencia', async () => {
    for (const event of ['order.refunded', 'order.chargeback']) {
      const p = order();
      await send(p);
      const act = await claim(p.data.customer.email, String(p.data.order_number));
      expect(act.res.status).toBe(200);

      const r = await send({ ...p, id: crypto.randomUUID(), event }, { event });
      expect(await r.json()).toEqual({ ok: true, revoked: true });

      const renew = await ctx.fetch('/v1/renew', { method: 'POST', body: await renewBody(act.dev), ip: freshIp() });
      expect(renew.status).toBe(403);
      expect(((await renew.json()) as { error: string }).error).toBe('revoked');
    }
  });

  it('sin configurar responde 503 para que Impultienda reintente', async () => {
    const bare = await setup();
    try {
      const body = JSON.stringify(order());
      const res = await bare.fetch('/webhooks/impultienda', { method: 'POST', body });
      expect(res.status).toBe(503);
    } finally {
      await bare.dispose();
    }
  }, 60_000);
});
