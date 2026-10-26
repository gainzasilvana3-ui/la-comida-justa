import { z } from 'zod';
import {
  ACTIVATION_PREFIX,
  ES256,
  GRACE_DAYS,
  RECOVERY_LENGTH,
  RECOVERY_PREFIX,
  TOKEN_LIFETIME_DAYS,
  jwkThumbprint,
  normalizeCode,
  randomCode,
  signClaims,
  verifyRenewal,
  verifyToken,
  type LicenseClaims,
} from '@lcj/shared';
import type { Env } from './env';
import { configProblem, isProduction } from './env';
import { hmac, signingKey } from './crypto';
import { HttpError, clientIp, json, readJson } from './http';
import { enforce, hit, peek } from './rate-limit';
import { getSettings } from './settings';

const HOUR = 3600;
const DAY = 86400;

const jwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/),
  y: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

const activateSchema = z.object({
  code: z.string().min(1).max(64),
  publicJwk: jwkSchema,
  turnstileToken: z.string().max(4096).optional(),
  appVersion: z.string().max(20).optional(),
});

const recoverSchema = z.object({
  recoveryCode: z.string().min(1).max(80),
  publicJwk: jwkSchema,
  turnstileToken: z.string().max(4096).optional(),
  appVersion: z.string().max(20).optional(),
});

const renewSchema = z.object({
  deviceId: z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/),
  ts: z.number().int().positive(),
  signature: z.string().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/),
  appVersion: z.string().max(20).optional(),
});

const errorSchema = z.object({
  message: z.string().max(2000),
  place: z.string().max(100).optional(),
  appVersion: z.string().max(20).optional(),
});

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_input', 'Datos inválidos.');
  return r.data;
}

function requireConfig(env: Env): void {
  const problem = configProblem(env);
  if (problem) {
    console.error('Configuración incompleta:', problem);
    throw new HttpError(503, 'not_configured', 'El servicio de activación no está disponible. Probá más tarde.');
  }
}

export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<void> {
  if (!env.TURNSTILE_SECRET) {
    if (isProduction(env)) throw new HttpError(503, 'not_configured', 'El servicio de activación no está disponible.');
    return; // en desarrollo se permite sin Turnstile
  }
  if (!token) throw new HttpError(403, 'turnstile_required', 'Completá la verificación antes de activar.');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip !== 'local') form.append('remoteip', ip);
  let ok = false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    ok = data.success === true;
  } catch {
    throw new HttpError(503, 'turnstile_unavailable', 'No pudimos verificar. Probá de nuevo en un momento.');
  }
  if (!ok) throw new HttpError(403, 'turnstile_failed', 'La verificación falló. Recargá la página y probá de nuevo.');
}

export async function issueToken(env: Env, licenseId: string, deviceId: string): Promise<{ token: string; claims: LicenseClaims }> {
  const settings = await getSettings(env);
  const iat = Math.floor(Date.now() / 1000);
  const claims: LicenseClaims = {
    lic: licenseId,
    dev: deviceId,
    iat,
    exp: iat + TOKEN_LIFETIME_DAYS * DAY,
    grace: GRACE_DAYS,
    cat: settings.current_catalog_version,
  };
  return { token: await signClaims(claims, await signingKey(env)), claims };
}

let verifyKeyCache: { src: string; key: Promise<CryptoKey> } | null = null;
function verifyKey(env: Env): Promise<CryptoKey> {
  if (!verifyKeyCache || verifyKeyCache.src !== env.LICENSE_SIGNING_KEY) {
    const { kty, crv, x, y } = JSON.parse(env.LICENSE_SIGNING_KEY) as JsonWebKey;
    verifyKeyCache = {
      src: env.LICENSE_SIGNING_KEY,
      key: crypto.subtle.importKey('jwk', { kty, crv, x, y }, ES256, false, ['verify']),
    };
  }
  return verifyKeyCache.key;
}

interface LicenseRow {
  id: string;
  status: 'active' | 'revoked';
  max_devices: number;
  activated_at: number | null;
}

async function checkDeviceKey(jwk: z.infer<typeof jwkSchema>): Promise<string> {
  try {
    await crypto.subtle.importKey('jwk', jwk, ES256, true, ['verify']);
  } catch {
    throw new HttpError(400, 'invalid_device_key', 'La clave del dispositivo no es válida.');
  }
  return jwkThumbprint(jwk);
}

async function ipLimits(env: Env, req: Request, kind: string): Promise<string> {
  const ip = clientIp(req);
  const ipKey = await hmac(env, 'ip', ip);
  await enforce(env, `${kind}:ip:${ipKey}`, 10, HOUR);
  // Freno global: si hay una ola de códigos inválidos desde muchas IPs, se corta un rato.
  if ((await peek(env, `${kind}:fail:global`, HOUR)) > 1000) {
    throw new HttpError(429, 'rate_limited', 'Hay demasiados intentos en este momento. Probá más tarde.', { retryAfter: HOUR });
  }
  return ip;
}

async function recordFailure(env: Env, kind: string): Promise<void> {
  await hit(env, `${kind}:fail:global`, HOUR);
}

/** POST /v1/activate: primera activación con el código de compra. */
export async function activate(req: Request, env: Env): Promise<Response> {
  requireConfig(env);
  const body = parse(activateSchema, await readJson(req));
  const ip = await ipLimits(env, req, 'act');
  await verifyTurnstile(env, body.turnstileToken, ip);

  const code = normalizeCode(body.code, ACTIVATION_PREFIX);
  if (!code) {
    await recordFailure(env, 'act');
    throw new HttpError(400, 'invalid_code', 'Revisá el código: tiene la forma LCJ-XXXX-XXXX-XXXX-XXXX.');
  }
  const codeHash = await hmac(env, 'act', code);
  await enforce(env, `act:code:${codeHash}`, 5, HOUR);

  const lic = await env.DB.prepare('SELECT id, status, max_devices, activated_at FROM licenses WHERE code_hash = ?1')
    .bind(codeHash)
    .first<LicenseRow>();
  if (!lic) {
    await recordFailure(env, 'act');
    throw new HttpError(404, 'invalid_code', 'El código no es válido. Revisalo y probá de nuevo.');
  }
  if (lic.status === 'revoked') {
    throw new HttpError(403, 'revoked', 'Este código fue dado de baja. Escribinos si creés que es un error.');
  }
  if (lic.activated_at !== null) {
    throw new HttpError(
      409,
      'code_used',
      'Este código ya se activó. Para usar la app en otro dispositivo, ingresá tu código de recuperación.',
    );
  }

  const deviceId = await checkDeviceKey(body.publicJwk);
  const existing = await env.DB.prepare('SELECT license_id FROM devices WHERE id = ?1').bind(deviceId).first<{ license_id: string }>();
  if (existing && existing.license_id !== lic.id) {
    throw new HttpError(409, 'device_conflict', 'Este dispositivo ya tiene otra licencia. Borrá los datos de la app y volvé a intentar.');
  }

  const recoveryCode = randomCode(RECOVERY_PREFIX, RECOVERY_LENGTH);
  const recoveryHash = await hmac(env, 'rec', normalizeCode(recoveryCode, RECOVERY_PREFIX)!);
  const now = Math.floor(Date.now() / 1000);
  const upd = await env.DB.prepare(
    'UPDATE licenses SET activated_at = ?1, recovery_hash = ?2 WHERE id = ?3 AND activated_at IS NULL AND status = ?4',
  )
    .bind(now, recoveryHash, lic.id, 'active')
    .run();
  if (upd.meta.changes !== 1) {
    throw new HttpError(409, 'code_used', 'Este código ya se activó.');
  }
  await env.DB.prepare(
    `INSERT INTO devices (id, license_id, public_jwk, status, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, 'active', ?4, ?4)
     ON CONFLICT(id) DO UPDATE SET status = 'active', removed_at = NULL, last_seen_at = ?4`,
  )
    .bind(deviceId, lic.id, JSON.stringify(body.publicJwk), now)
    .run();

  const { token, claims } = await issueToken(env, lic.id, deviceId);
  return json({ token, recoveryCode, deviceId, maxDevices: lic.max_devices, expiresAt: claims.exp });
}

/** POST /v1/recover: nuevo dispositivo con el código de recuperación. */
export async function recover(req: Request, env: Env): Promise<Response> {
  requireConfig(env);
  const body = parse(recoverSchema, await readJson(req));
  const ip = await ipLimits(env, req, 'rec');
  await verifyTurnstile(env, body.turnstileToken, ip);

  const code = normalizeCode(body.recoveryCode, RECOVERY_PREFIX);
  if (!code) {
    await recordFailure(env, 'rec');
    throw new HttpError(400, 'invalid_recovery', 'Revisá el código de recuperación: tiene la forma RCP-XXXX-XXXX-XXXX-XXXX-XXXX.');
  }
  const recHash = await hmac(env, 'rec', code);
  await enforce(env, `rec:code:${recHash}`, 5, HOUR);
  const lic = await env.DB.prepare('SELECT id, status, max_devices, activated_at FROM licenses WHERE recovery_hash = ?1')
    .bind(recHash)
    .first<LicenseRow>();
  if (!lic) {
    await recordFailure(env, 'rec');
    throw new HttpError(404, 'invalid_recovery', 'El código de recuperación no es válido.');
  }
  if (lic.status === 'revoked') {
    throw new HttpError(403, 'revoked', 'Esta licencia fue dada de baja. Escribinos si creés que es un error.');
  }

  const deviceId = await checkDeviceKey(body.publicJwk);
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare('SELECT license_id, status FROM devices WHERE id = ?1')
    .bind(deviceId)
    .first<{ license_id: string; status: string }>();
  if (existing && existing.license_id !== lic.id) {
    throw new HttpError(409, 'device_conflict', 'Este dispositivo ya tiene otra licencia.');
  }
  if (existing?.status === 'active') {
    const { token, claims } = await issueToken(env, lic.id, deviceId);
    return json({ token, deviceId, transferred: false, expiresAt: claims.exp });
  }

  const { results: active } = await env.DB.prepare(
    "SELECT id FROM devices WHERE license_id = ?1 AND status = 'active' ORDER BY COALESCE(last_seen_at, created_at) ASC",
  )
    .bind(lic.id)
    .all<{ id: string }>();

  let transferred = false;
  const stmts: D1PreparedStatement[] = [];
  if (active.length >= lic.max_devices) {
    const settings = await getSettings(env);
    const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM transfers WHERE license_id = ?1 AND at > ?2')
      .bind(lic.id, now - 365 * DAY)
      .first<{ n: number }>();
    if ((used?.n ?? 0) >= settings.transfers_per_year) {
      throw new HttpError(
        409,
        'transfer_limit',
        'Llegaste al límite de cambios de dispositivo de este año. Escribinos y te ayudamos a pasar la app al dispositivo nuevo.',
      );
    }
    // Se libera el dispositivo usado hace más tiempo.
    const toRemove = active.slice(0, active.length - lic.max_devices + 1);
    for (const d of toRemove) {
      stmts.push(env.DB.prepare("UPDATE devices SET status = 'removed', removed_at = ?1 WHERE id = ?2").bind(now, d.id));
    }
    stmts.push(env.DB.prepare('INSERT INTO transfers (license_id, at) VALUES (?1, ?2)').bind(lic.id, now));
    transferred = true;
  }
  stmts.push(
    env.DB.prepare(
      `INSERT INTO devices (id, license_id, public_jwk, status, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, 'active', ?4, ?4)
       ON CONFLICT(id) DO UPDATE SET status = 'active', removed_at = NULL, last_seen_at = ?4`,
    ).bind(deviceId, lic.id, JSON.stringify(body.publicJwk), now),
  );
  if (lic.activated_at === null) {
    stmts.push(env.DB.prepare('UPDATE licenses SET activated_at = ?1 WHERE id = ?2').bind(now, lic.id));
  }
  await env.DB.batch(stmts);

  const { token, claims } = await issueToken(env, lic.id, deviceId);
  return json({ token, deviceId, transferred, expiresAt: claims.exp });
}

/** POST /v1/renew: renovación periódica firmada por la clave del dispositivo. */
export async function renew(req: Request, env: Env): Promise<Response> {
  requireConfig(env);
  const body = parse(renewSchema, await readJson(req));
  const ipKey = await hmac(env, 'ip', clientIp(req));
  await enforce(env, `renew:ip:${ipKey}`, 120, HOUR);
  await enforce(env, `renew:dev:${body.deviceId}`, 30, HOUR);

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - body.ts) > 300) {
    throw new HttpError(409, 'clock_skew', 'La fecha y hora del teléfono no coinciden. Activá la hora automática y probá de nuevo.');
  }
  const dev = await env.DB.prepare(
    `SELECT d.id, d.public_jwk, d.status, d.last_renew_ts, l.id AS license_id, l.status AS license_status
     FROM devices d JOIN licenses l ON l.id = d.license_id WHERE d.id = ?1`,
  )
    .bind(body.deviceId)
    .first<{ id: string; public_jwk: string; status: string; last_renew_ts: number; license_id: string; license_status: string }>();
  if (!dev) throw new HttpError(404, 'device_unknown', 'No encontramos este dispositivo. Volvé a activar la app.');

  const pub = await crypto.subtle.importKey('jwk', JSON.parse(dev.public_jwk) as JsonWebKey, ES256, false, ['verify']);
  if (!(await verifyRenewal(dev.id, body.ts, body.signature, pub))) {
    throw new HttpError(401, 'bad_signature', 'No pudimos verificar este dispositivo.');
  }
  if (dev.license_status === 'revoked') {
    throw new HttpError(403, 'revoked', 'Esta licencia fue dada de baja. Tus recetas y listas siguen guardadas en el teléfono.');
  }
  if (dev.status !== 'active') {
    throw new HttpError(
      403,
      'device_removed',
      'Esta licencia se pasó a otro dispositivo. Si querés volver a usarla acá, ingresá tu código de recuperación.',
    );
  }
  const upd = await env.DB.prepare(
    'UPDATE devices SET last_renew_ts = ?1, last_seen_at = ?2 WHERE id = ?3 AND last_renew_ts < ?1',
  )
    .bind(body.ts, now, dev.id)
    .run();
  if (upd.meta.changes !== 1) throw new HttpError(409, 'replay', 'Solicitud repetida. Probá de nuevo.');

  const settings = await getSettings(env);
  const { token, claims } = await issueToken(env, dev.license_id, dev.id);
  return json({
    token,
    expiresAt: claims.exp,
    catalogVersion: settings.current_catalog_version,
    latestAppVersion: settings.latest_app_version,
  });
}

/** Valida el token de una solicitud y que la licencia y el dispositivo sigan activos. */
export async function authorize(req: Request, env: Env): Promise<LicenseClaims> {
  const auth = req.headers.get('Authorization') ?? '';
  const m = /^Bearer ([A-Za-z0-9_.-]{20,2000})$/.exec(auth);
  if (!m) throw new HttpError(401, 'unauthorized', 'Falta la autorización.');
  const claims = await verifyToken(m[1]!, await verifyKey(env));
  if (!claims) throw new HttpError(401, 'unauthorized', 'Autorización inválida.');
  const now = Math.floor(Date.now() / 1000);
  if (now > claims.exp + claims.grace * DAY) throw new HttpError(401, 'expired', 'La autorización venció. Conectate para renovarla.');
  const row = await env.DB.prepare(
    `SELECT l.status AS ls, d.status AS ds FROM devices d JOIN licenses l ON l.id = d.license_id
     WHERE d.id = ?1 AND l.id = ?2`,
  )
    .bind(claims.dev, claims.lic)
    .first<{ ls: string; ds: string }>();
  if (!row) throw new HttpError(401, 'unauthorized', 'Autorización inválida.');
  if (row.ls !== 'active') throw new HttpError(403, 'revoked', 'Esta licencia fue dada de baja.');
  if (row.ds !== 'active') throw new HttpError(403, 'device_removed', 'Esta licencia se pasó a otro dispositivo.');
  return claims;
}

/** GET /v1/catalog: catálogo vigente, solo con autorización válida. */
export async function catalog(req: Request, env: Env): Promise<Response> {
  requireConfig(env);
  const claims = await authorize(req, env);
  await enforce(env, `cat:lic:${claims.lic}`, 60, HOUR);
  const settings = await getSettings(env);
  const current = settings.current_catalog_version;
  if (!current) throw new HttpError(404, 'no_catalog', 'Todavía no hay recetas publicadas.');
  const have = Number(new URL(req.url).searchParams.get('have') ?? '0');
  if (have === current) return json({ upToDate: true, version: current });
  const row = await env.DB.prepare('SELECT data FROM catalog_versions WHERE version = ?1').bind(current).first<{ data: string }>();
  if (!row) throw new HttpError(404, 'no_catalog', 'Todavía no hay recetas publicadas.');
  return new Response(row.data, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Saca de un mensaje de error cualquier cosa parecida a un código o un mail. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[mail]')
    .replace(/\b(LCJ|RCP)(?:[\s-]?[0-9A-Z]{4}){4,5}\b/gi, '[código]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]')
    .slice(0, 500);
}

/** POST /v1/errors: errores técnicos de la app, sin datos personales. */
export async function reportError(req: Request, env: Env): Promise<Response> {
  const body = parse(errorSchema, await readJson(req, 8 * 1024));
  const ipKey = await hmac(env, 'ip', clientIp(req));
  await enforce(env, `err:ip:${ipKey}`, 20, HOUR);
  await env.DB.prepare('INSERT INTO error_reports (at, app_version, place, message) VALUES (?1, ?2, ?3, ?4)')
    .bind(Math.floor(Date.now() / 1000), body.appVersion ?? null, body.place ? scrub(body.place).slice(0, 100) : null, scrub(body.message))
    .run();
  return new Response(null, { status: 204 });
}
