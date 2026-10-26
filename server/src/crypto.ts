import { ES256, b64urlEncode } from '@lcj/shared';
import type { Env } from './env';

const enc = new TextEncoder();
const hmacKeys = new Map<string, Promise<CryptoKey>>();
const signingKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(pepper: string): Promise<CryptoKey> {
  let k = hmacKeys.get(pepper);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hmacKeys.set(pepper, k);
  }
  return k;
}

/** HMAC con el secreto del servidor: así una copia de la base no revela códigos ni IPs. */
export async function hmac(env: Env, purpose: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.CODE_PEPPER), enc.encode(`${purpose}:${value}`));
  return b64urlEncode(new Uint8Array(sig));
}

export function signingKey(env: Env): Promise<CryptoKey> {
  let k = signingKeys.get(env.LICENSE_SIGNING_KEY);
  if (!k) {
    k = (async () => {
      const jwk = JSON.parse(env.LICENSE_SIGNING_KEY) as JsonWebKey;
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) throw new Error('LICENSE_SIGNING_KEY inválida.');
      return crypto.subtle.importKey('jwk', jwk, ES256, false, ['sign']);
    })();
    signingKeys.set(env.LICENSE_SIGNING_KEY, k);
  }
  return k;
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Comparación en tiempo constante de dos strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
