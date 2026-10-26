/**
 * Formato de códigos y de la autorización firmada que emite el servidor.
 * La firma es ECDSA P-256 (ES256), soportada por todos los navegadores
 * actuales y por Cloudflare Workers. La app solo tiene la clave PÚBLICA:
 * puede verificar una autorización sin internet, pero no fabricarla.
 */

// Alfabeto Crockford base32: sin I, L, O ni U para evitar confusiones al tipear.
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ACTIVATION_PREFIX = 'LCJ';
export const RECOVERY_PREFIX = 'RCP';
/** 16 caracteres × 5 bits = 80 bits de azar. */
export const ACTIVATION_LENGTH = 16;
/** 20 caracteres × 5 bits = 100 bits de azar. */
export const RECOVERY_LENGTH = 20;

/** Genera un código al azar con el generador criptográfico. */
export function randomCode(prefix: string, length: number): string {
  // 256 es múltiplo de 32: tomar los 5 bits bajos no introduce sesgo.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let body = '';
  for (const b of bytes) body += CODE_ALPHABET[b & 31];
  const groups = body.match(/.{1,4}/g) ?? [];
  return [prefix, ...groups].join('-');
}

/**
 * Normaliza lo que tipea la persona: mayúsculas, sin espacios ni guiones,
 * y corrige letras parecidas (O→0, I/L→1). Devuelve el cuerpo sin prefijo.
 */
export function normalizeCode(input: string, prefix: string): string | null {
  let s = input.toUpperCase().replace(/[\s\-_.]/g, '');
  if (s.startsWith(prefix)) s = s.slice(prefix.length);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  const expected = prefix === RECOVERY_PREFIX ? RECOVERY_LENGTH : ACTIVATION_LENGTH;
  if (s.length !== expected) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function formatCode(body: string, prefix: string): string {
  return [prefix, ...(body.match(/.{1,4}/g) ?? [])].join('-');
}

// ---------- base64url ----------

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ES256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** Contenido de la autorización. Solo datos imprescindibles, nada personal. */
export interface LicenseClaims {
  /** id interno de la licencia (no es el código de compra) */
  lic: string;
  /** id del dispositivo (huella de su clave pública) */
  dev: string;
  /** emitido (segundos epoch) */
  iat: number;
  /** vence (segundos epoch) */
  exp: number;
  /** días de gracia sin conexión después de exp */
  grace: number;
  /** versión vigente del catálogo al emitir */
  cat: number;
}

export async function signClaims(claims: LicenseClaims, privateKey: CryptoKey): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'LCJ' })));
  const body = b64urlEncode(enc.encode(JSON.stringify(claims)));
  const input = `${header}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN_ALG, privateKey, enc.encode(input)));
  return `${input}.${b64urlEncode(sig)}`;
}

/** Verifica firma y forma. No mira fechas: eso lo decide `licenseState`. */
export async function verifyToken(token: string, publicKey: CryptoKey): Promise<LicenseClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  try {
    const header = JSON.parse(dec.decode(b64urlDecode(h)));
    if (header.alg !== 'ES256' || header.typ !== 'LCJ') return null;
    const ok = await crypto.subtle.verify(SIGN_ALG, publicKey, b64urlDecode(s), enc.encode(`${h}.${b}`));
    if (!ok) return null;
    const c = JSON.parse(dec.decode(b64urlDecode(b)));
    if (
      typeof c.lic !== 'string' ||
      typeof c.dev !== 'string' ||
      typeof c.iat !== 'number' ||
      typeof c.exp !== 'number' ||
      typeof c.grace !== 'number' ||
      typeof c.cat !== 'number'
    ) {
      return null;
    }
    return c as LicenseClaims;
  } catch {
    return null;
  }
}

export type LicenseStatus =
  | { kind: 'valid'; renewSoon: boolean; expiresAt: number }
  | { kind: 'grace'; graceEndsAt: number }
  | { kind: 'expired' };

/** Política de renovación: intentar renovar desde el día 7; vence a los 30; gracia de 14 días. */
export const TOKEN_LIFETIME_DAYS = 30;
export const RENEW_AFTER_DAYS = 7;
export const GRACE_DAYS = 14;

export function licenseState(claims: LicenseClaims, nowMs: number = Date.now()): LicenseStatus {
  const now = Math.floor(nowMs / 1000);
  // Si el reloj del teléfono está muy atrasado respecto de la emisión, no confiamos.
  if (now < claims.iat - 24 * 3600) return { kind: 'expired' };
  if (now < claims.exp) {
    return { kind: 'valid', renewSoon: now >= claims.iat + RENEW_AFTER_DAYS * 86400, expiresAt: claims.exp * 1000 };
  }
  const graceEnd = claims.exp + claims.grace * 86400;
  if (now < graceEnd) return { kind: 'grace', graceEndsAt: graceEnd * 1000 };
  return { kind: 'expired' };
}

/** Texto canónico que firma el dispositivo al renovar. */
export function renewMessage(deviceId: string, timestamp: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(enc.encode(`lcj-renew|${deviceId}|${timestamp}`));
}

export async function importPublicJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, ES256, true, ['verify']);
}

/** Huella estable de una clave pública EC (RFC 7638), usada como id del dispositivo. */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('Clave de dispositivo inválida.');
  }
  const canonical = `{"crv":"P-256","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(canonical)));
  return b64urlEncode(digest);
}

export async function signRenewal(deviceId: string, timestamp: number, devicePrivateKey: CryptoKey): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN_ALG, devicePrivateKey, renewMessage(deviceId, timestamp)));
  return b64urlEncode(sig);
}

export async function verifyRenewal(
  deviceId: string,
  timestamp: number,
  signature: string,
  devicePublicKey: CryptoKey,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(SIGN_ALG, devicePublicKey, b64urlDecode(signature), renewMessage(deviceId, timestamp));
  } catch {
    return false;
  }
}
