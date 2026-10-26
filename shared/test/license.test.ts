import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_PREFIX,
  ES256,
  RECOVERY_PREFIX,
  formatCode,
  jwkThumbprint,
  licenseState,
  normalizeCode,
  randomCode,
  signClaims,
  signRenewal,
  verifyRenewal,
  verifyToken,
  type LicenseClaims,
} from '../src';

const keys = () => crypto.subtle.generateKey(ES256, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;

describe('códigos', () => {
  it('genera códigos con el formato esperado y sin repetir', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => randomCode(ACTIVATION_PREFIX, 16)));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^LCJ(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  });

  it('normaliza lo que tipea la persona', () => {
    const code = randomCode(ACTIVATION_PREFIX, 16);
    const body = normalizeCode(code, ACTIVATION_PREFIX)!;
    expect(formatCode(body, ACTIVATION_PREFIX)).toBe(code);
    expect(normalizeCode(` ${code.toLowerCase().replace(/-/g, ' ')} `, ACTIVATION_PREFIX)).toBe(body);
    expect(normalizeCode('LCJ-OOOO-IIII-LLLL-0000', ACTIVATION_PREFIX)).toBe('0000111111110000');
  });

  it('rechaza largos o caracteres inválidos', () => {
    expect(normalizeCode('LCJ-1234', ACTIVATION_PREFIX)).toBeNull();
    expect(normalizeCode('LCJ-12#4-1234-1234-1234', ACTIVATION_PREFIX)).toBeNull();
    expect(normalizeCode(randomCode(RECOVERY_PREFIX, 20), RECOVERY_PREFIX)).toHaveLength(20);
  });
});

describe('autorización firmada', () => {
  const claims = (now: number): LicenseClaims => ({ lic: 'L1', dev: 'D1', iat: now, exp: now + 30 * 86400, grace: 14, cat: 1 });

  it('verifica una firma válida', async () => {
    const k = await keys();
    const now = Math.floor(Date.now() / 1000);
    const token = await signClaims(claims(now), k.privateKey);
    expect(await verifyToken(token, k.publicKey)).toEqual(claims(now));
  });

  it('rechaza un token alterado o firmado con otra clave', async () => {
    const k = await keys();
    const other = await keys();
    const now = Math.floor(Date.now() / 1000);
    const token = await signClaims(claims(now), k.privateKey);
    const [h, , s] = token.split('.');
    const fakeBody = btoa(JSON.stringify({ ...claims(now), exp: now + 9e9 })).replace(/=+$/, '');
    expect(await verifyToken(`${h}.${fakeBody}.${s}`, k.publicKey)).toBeNull();
    expect(await verifyToken(token, other.publicKey)).toBeNull();
    expect(await verifyToken('basura', k.publicKey)).toBeNull();
  });

  it('aplica la política de vencimiento, renovación y gracia', () => {
    const iat = 1_800_000_000;
    const c = claims(iat);
    expect(licenseState(c, iat * 1000)).toMatchObject({ kind: 'valid', renewSoon: false });
    expect(licenseState(c, (iat + 8 * 86400) * 1000)).toMatchObject({ kind: 'valid', renewSoon: true });
    expect(licenseState(c, (iat + 31 * 86400) * 1000).kind).toBe('grace');
    expect(licenseState(c, (iat + 45 * 86400) * 1000).kind).toBe('expired');
    // reloj atrasado dos días respecto de la emisión
    expect(licenseState(c, (iat - 2 * 86400) * 1000).kind).toBe('expired');
  });

  it('firma de renovación del dispositivo', async () => {
    const dev = await keys();
    const jwk = await crypto.subtle.exportKey('jwk', dev.publicKey);
    const deviceId = await jwkThumbprint(jwk);
    const sig = await signRenewal(deviceId, 123, dev.privateKey);
    expect(await verifyRenewal(deviceId, 123, sig, dev.publicKey)).toBe(true);
    expect(await verifyRenewal(deviceId, 124, sig, dev.publicKey)).toBe(false);
    expect(await verifyRenewal('otro', 123, sig, dev.publicKey)).toBe(false);
  });
});
