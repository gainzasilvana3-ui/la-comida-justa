import type { Env } from './env';
import { HttpError } from './http';

/**
 * Límite de intentos por ventana fija, guardado en D1.
 * La clave ya viene hasheada cuando contiene datos sensibles (IP, código).
 */
export async function hit(env: Env, key: string, windowSeconds: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start < ?2 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start < ?2 THEN ?2 ELSE window_start END
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export async function enforce(env: Env, key: string, limit: number, windowSeconds: number): Promise<void> {
  const count = await hit(env, key, windowSeconds);
  if (count > limit) {
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = windowSeconds - (now % windowSeconds);
    throw new HttpError(429, 'rate_limited', 'Demasiados intentos. Esperá un rato y volvé a probar.', { retryAfter });
  }
}

/** Mira el contador sin sumar. */
export async function peek(env: Env, key: string, windowSeconds: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?1')
    .bind(key)
    .first<{ count: number; window_start: number }>();
  if (!row || row.window_start < windowStart) return 0;
  return row.count;
}

export async function cleanup(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - 2 * 86400),
    env.DB.prepare('DELETE FROM error_reports WHERE at < ?1').bind(now - 30 * 86400),
  ]);
}
