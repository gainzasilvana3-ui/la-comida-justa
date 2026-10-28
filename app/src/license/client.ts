import {
  ES256,
  importPublicJwk,
  jwkThumbprint,
  licenseState,
  signRenewal,
  verifyToken,
  type LicenseClaims,
  type LicenseStatus,
} from '@lcj/shared';
import { APP_VERSION, config } from '../config';
import { db, requestPersistence, type LicenseRow } from '../db/db';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AccessState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'active'; claims: LicenseClaims; status: Extract<LicenseStatus, { kind: 'valid' | 'grace' }> }
  | { kind: 'expired'; claims: LicenseClaims | null }
  | { kind: 'blocked'; reason: 'revoked' | 'device_removed'; message: string };

let publicKeyPromise: Promise<CryptoKey> | null = null;
function publicKey(): Promise<CryptoKey> {
  if (!publicKeyPromise) publicKeyPromise = importPublicJwk(JSON.parse(config.publicKeyJwk) as JsonWebKey);
  return publicKeyPromise;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', 'No hay conexión con el servidor. Revisá tu internet y probá de nuevo.');
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // respuesta inesperada
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error ?? 'error'), String(data.message ?? 'Ocurrió un error. Probá de nuevo.'));
  }
  return data as T;
}

/** Clave propia del dispositivo. La privada se crea NO exportable. */
async function deviceKeys(): Promise<{ keys: CryptoKeyPair; publicJwk: JsonWebKey; id: string }> {
  const existing = await db.deviceKey.get('device');
  if (existing) return { keys: existing.keys, publicJwk: existing.publicJwk, id: await jwkThumbprint(existing.publicJwk) };
  const pair = await crypto.subtle.generateKey(ES256, false, ['sign', 'verify']);
  const full = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };
  await db.deviceKey.put({ key: 'device', keys: pair, publicJwk });
  return { keys: pair, publicJwk, id: await jwkThumbprint(publicJwk) };
}

/** Lee el estado actual de acceso sin conexión. */
export async function readAccess(): Promise<AccessState> {
  const row = await db.license.get('current');
  if (!row) return { kind: 'none' };
  if (row.blocked) return { kind: 'blocked', reason: row.blocked, message: row.blockedMessage ?? '' };
  const claims = await verifyToken(row.token, await publicKey());
  if (!claims) return { kind: 'expired', claims: null };
  const st = licenseState(claims);
  if (st.kind === 'expired') return { kind: 'expired', claims };
  return { kind: 'active', claims, status: st };
}

interface TokenResponse {
  token: string;
  deviceId: string;
  recoveryCode?: string;
  expiresAt: number;
}

async function storeToken(data: TokenResponse, extra: Partial<LicenseRow> = {}): Promise<void> {
  const claims = await verifyToken(data.token, await publicKey());
  if (!claims) throw new ApiError(0, 'bad_token', 'La respuesta del servidor no es válida. Probá de nuevo.');
  const prev = await db.license.get('current');
  await db.license.put({
    key: 'current',
    token: data.token,
    deviceId: claims.dev,
    recoveryCode: data.recoveryCode ?? prev?.recoveryCode,
    blocked: null,
    lastRenewAt: Date.now(),
    ...extra,
  });
  void requestPersistence();
}

export async function activate(code: string, turnstileToken?: string): Promise<{ recoveryCode: string }> {
  const dev = await deviceKeys();
  const data = await request<TokenResponse>('/v1/activate', {
    method: 'POST',
    body: JSON.stringify({ code, publicJwk: dev.publicJwk, turnstileToken, appVersion: APP_VERSION }),
  });
  await storeToken(data);
  return { recoveryCode: data.recoveryCode ?? '' };
}

/** Primera activación con el mail y el número de pedido de la compra en la tienda. */
export async function claim(email: string, orderNumber: string, turnstileToken?: string): Promise<{ recoveryCode: string }> {
  const dev = await deviceKeys();
  const data = await request<TokenResponse>('/v1/claim', {
    method: 'POST',
    body: JSON.stringify({ email, orderNumber, publicJwk: dev.publicJwk, turnstileToken, appVersion: APP_VERSION }),
  });
  await storeToken(data);
  return { recoveryCode: data.recoveryCode ?? '' };
}

export async function recover(recoveryCode: string, turnstileToken?: string): Promise<{ transferred: boolean }> {
  const dev = await deviceKeys();
  const data = await request<TokenResponse & { transferred: boolean }>('/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ recoveryCode, publicJwk: dev.publicJwk, turnstileToken, appVersion: APP_VERSION }),
  });
  await storeToken(data, { recoveryCode: recoveryCode.toUpperCase().trim() });
  return { transferred: data.transferred };
}

export interface RenewResult {
  ok: boolean;
  catalogVersion?: number;
  latestAppVersion?: string;
  error?: ApiError;
}

/**
 * Renueva la autorización firmando con la clave del dispositivo.
 * Un error de conexión nunca borra nada: se reintenta más tarde.
 */
export async function renew(): Promise<RenewResult> {
  const row = await db.license.get('current');
  if (!row) return { ok: false };
  const dev = await db.deviceKey.get('device');
  if (!dev) return { ok: false };
  const ts = Math.floor(Date.now() / 1000);
  const deviceId = await jwkThumbprint(dev.publicJwk);
  try {
    const data = await request<TokenResponse & { catalogVersion: number; latestAppVersion: string }>('/v1/renew', {
      method: 'POST',
      body: JSON.stringify({ deviceId, ts, signature: await signRenewal(deviceId, ts, dev.keys.privateKey), appVersion: APP_VERSION }),
    });
    await storeToken({ ...data, deviceId }, { latestAppVersion: data.latestAppVersion });
    return { ok: true, catalogVersion: data.catalogVersion, latestAppVersion: data.latestAppVersion };
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'error', 'Error inesperado.');
    if (err.code === 'revoked' || err.code === 'device_removed') {
      await db.license.update('current', { blocked: err.code, blockedMessage: err.message });
    }
    return { ok: false, error: err };
  }
}

/** ¿Conviene renovar ahora? */
export function shouldRenew(state: AccessState, row?: LicenseRow): boolean {
  if (state.kind === 'active') {
    if (state.status.kind === 'grace') return true;
    if (state.status.renewSoon) return true;
    // como mínimo una vez por día, para enterarse de revocaciones y catálogos nuevos
    return !row?.lastRenewAt || Date.now() - row.lastRenewAt > 24 * 3600 * 1000;
  }
  return state.kind === 'expired';
}

export async function currentToken(): Promise<string | null> {
  return (await db.license.get('current'))?.token ?? null;
}

/** Se usa al cambiar de licencia: borra licencia y clave, nunca los datos del usuario. */
export async function forgetLicense(): Promise<void> {
  await db.license.clear();
  await db.deviceKey.clear();
}

export { request as apiRequest };
