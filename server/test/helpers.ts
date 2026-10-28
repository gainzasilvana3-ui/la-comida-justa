import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { ES256, importPublicJwk, jwkThumbprint, signRenewal } from '@lcj/shared';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

let bundled: string | null = null;
async function workerCode(): Promise<string> {
  if (!bundled) {
    const out = await build({
      entryPoints: [here('../src/index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['module', 'main'],
      write: false,
      logLevel: 'silent',
    });
    bundled = out.outputFiles[0]!.text;
  }
  return bundled;
}

export const TEAM = 'team.example';
export const AUD = 'aud-test';
export const ADMIN = 'silvana@example.com';
export const APP = 'https://app.example';

export interface TestCtx {
  mf: Miniflare;
  signingPublic: CryptoKey;
  fetch: (path: string, init?: RequestInit & { ip?: string }) => Promise<Response>;
  adminToken: (email?: string) => Promise<string>;
  admin: (path: string, init?: RequestInit & { email?: string }) => Promise<Response>;
  dispose: () => Promise<void>;
}

export async function setup(bindings: Record<string, string> = {}): Promise<TestCtx> {
  const signing = (await crypto.subtle.generateKey(ES256, true, ['sign', 'verify'])) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey('jwk', signing.privateKey);
  const access = await generateKeyPair('RS256', { extractable: true });
  const accessJwk = { ...(await exportJWK(access.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

  const mf = new Miniflare({
    modules: true,
    script: await workerCode(),
    compatibilityDate: '2026-08-01',
    d1Databases: { DB: 'test-db' },
    bindings: {
      ENVIRONMENT: 'production',
      APP_ORIGIN: APP,
      ACCESS_TEAM_DOMAIN: TEAM,
      ACCESS_AUD: AUD,
      ADMIN_EMAILS: ADMIN,
      LICENSE_SIGNING_KEY: JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d }),
      CODE_PEPPER: 'pepper-de-prueba-suficientemente-largo',
      TURNSTILE_SECRET: 'secreto-turnstile',
      ...bindings,
    },
    outboundService: async (req) => {
      const url = new URL(req.url);
      if (url.hostname === 'challenges.cloudflare.com') {
        const form = await req.formData();
        return Response.json({ success: form.get('response') === 'ok-turnstile' && form.get('secret') === 'secreto-turnstile' });
      }
      if (url.hostname === TEAM && url.pathname === '/cdn-cgi/access/certs') {
        return Response.json({ keys: [accessJwk] });
      }
      return new Response('bloqueado en pruebas', { status: 599 });
    },
  });

  const db = await mf.getD1Database('DB');
  for (const file of readdirSync(here('../migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(here(`../migrations/${file}`), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await db.prepare(stmt).run();
    }
  }

  const adminToken = (email = ADMIN) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(access.privateKey);

  const fetch = async (path: string, init: RequestInit & { ip?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set('CF-Connecting-IP', init.ip ?? '203.0.113.1');
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return mf.dispatchFetch(`https://api.example${path}`, { ...init, headers } as never) as unknown as Response;
  };

  const admin = async (path: string, init: RequestInit & { email?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Cf-Access-Jwt-Assertion', await adminToken(init.email));
    headers.set('X-LCJ-Admin', '1');
    return fetch(`/admin/api/${path}`, { ...init, headers });
  };

  const { kty, crv, x, y } = priv;
  return {
    mf,
    signingPublic: await importPublicJwk({ kty, crv, x, y }),
    fetch,
    adminToken,
    admin,
    dispose: () => mf.dispose(),
  };
}

export interface Device {
  keys: CryptoKeyPair;
  jwk: JsonWebKey;
  id: string;
}

export async function newDevice(): Promise<Device> {
  const keys = (await crypto.subtle.generateKey(ES256, true, ['sign', 'verify'])) as CryptoKeyPair;
  const full = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const jwk = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };
  return { keys, jwk, id: await jwkThumbprint(jwk) };
}

export async function renewBody(dev: Device, ts = Math.floor(Date.now() / 1000)) {
  return JSON.stringify({ deviceId: dev.id, ts, signature: await signRenewal(dev.id, ts, dev.keys.privateKey) });
}

export async function makeCodes(ctx: TestCtx, count = 1, extra: Record<string, unknown> = {}): Promise<string[]> {
  const res = await ctx.admin('licenses/batch', { method: 'POST', body: JSON.stringify({ count, ...extra }) });
  if (res.status !== 200) throw new Error(`batch ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { codes: { code: string }[] };
  return data.codes.map((c) => c.code);
}

let ipCounter = 10;
export const freshIp = () => `198.51.100.${ipCounter++ % 250}`;
