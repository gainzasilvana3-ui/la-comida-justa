import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyToken, licenseState } from '@lcj/shared';
import { RECETAS } from '../../catalog/src/recetas';
import { APP, freshIp, makeCodes, newDevice, renewBody, setup, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await setup();
}, 60_000);
afterAll(() => ctx?.dispose());

const post = (path: string, body: unknown, ip = freshIp(), headers: Record<string, string> = {}) =>
  ctx.fetch(path, { method: 'POST', body: JSON.stringify(body), ip, headers });

async function activate(code: string, dev?: Awaited<ReturnType<typeof newDevice>>, ip = freshIp()) {
  const d = dev ?? (await newDevice());
  const res = await post('/v1/activate', { code, publicJwk: d.jwk, turnstileToken: 'ok-turnstile' }, ip);
  return { res, dev: d, data: (await res.json()) as Record<string, unknown> };
}

describe('servicio', () => {
  it('responde salud y encabezados de seguridad', async () => {
    const res = await ctx.fetch('/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ready: true });
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('CORS solo para el origen de la app', async () => {
    const ok = await ctx.fetch('/v1/health', { headers: { Origin: APP } });
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    const bad = await ctx.fetch('/v1/health', { headers: { Origin: 'https://otro.example' } });
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rechaza cuerpos que no son JSON', async () => {
    const res = await ctx.fetch('/v1/activate', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } });
    expect(res.status).toBe(415);
  });
});

describe('panel admin protegido', () => {
  it('sin Access: 401', async () => {
    expect((await ctx.fetch('/admin/api/stats')).status).toBe(401);
    expect((await ctx.fetch('/admin/')).status).toBe(401);
  });

  it('token falso o firmado por otro: 401', async () => {
    const res = await ctx.fetch('/admin/api/stats', { headers: { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiJ9.e30.xxx' } });
    expect(res.status).toBe(401);
  });

  it('mail no autorizado: 403', async () => {
    expect((await ctx.admin('stats', { email: 'otra@example.com' })).status).toBe(403);
  });

  it('mail autorizado: entra', async () => {
    const res = await ctx.admin('stats');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0 });
  });

  it('cambios sin encabezado propio (CSRF): 403', async () => {
    const res = await ctx.fetch('/admin/api/licenses/batch', {
      method: 'POST',
      body: JSON.stringify({ count: 1 }),
      headers: { 'Cf-Access-Jwt-Assertion': await ctx.adminToken() },
    });
    expect(res.status).toBe(403);
    const cross = await ctx.admin('licenses/batch', {
      method: 'POST',
      body: JSON.stringify({ count: 1 }),
      headers: { Origin: 'https://malo.example' },
    });
    expect(cross.status).toBe(403);
  });

  it('valida los límites de la tanda', async () => {
    const res = await ctx.admin('licenses/batch', { method: 'POST', body: JSON.stringify({ count: 501 }) });
    expect(res.status).toBe(400);
  });
});

describe('activación', () => {
  it('activa con un código válido y entrega autorización firmada y código de recuperación', async () => {
    const [code] = await makeCodes(ctx, 1, { batch: 'prueba' });
    expect(code).toMatch(/^LCJ-/);
    const { res, data, dev } = await activate(code!);
    expect(res.status).toBe(200);
    expect(data.recoveryCode).toMatch(/^RCP(-[0-9A-Z]{4}){5}$/);
    const claims = await verifyToken(data.token as string, ctx.signingPublic);
    expect(claims).toMatchObject({ dev: dev.id, grace: 14 });
    expect(licenseState(claims!).kind).toBe('valid');
  });

  it('el código es de un solo uso', async () => {
    const [code] = await makeCodes(ctx);
    expect((await activate(code!)).res.status).toBe(200);
    const again = await activate(code!);
    expect(again.res.status).toBe(409);
    expect(again.data.error).toBe('code_used');
  });

  it('acepta el código escrito con minúsculas y espacios', async () => {
    const [code] = await makeCodes(ctx);
    const typed = ` ${code!.toLowerCase().replace(/-/g, ' ')} `;
    expect((await activate(typed)).res.status).toBe(200);
  });

  it('código inexistente o mal formado', async () => {
    expect((await activate('LCJ-AAAA-BBBB-CCCC-DDDD')).res.status).toBe(404);
    expect((await activate('hola')).res.status).toBe(400);
  });

  it('exige Turnstile en producción', async () => {
    const [code] = await makeCodes(ctx);
    const d = await newDevice();
    expect((await post('/v1/activate', { code, publicJwk: d.jwk })).status).toBe(403);
    expect((await post('/v1/activate', { code, publicJwk: d.jwk, turnstileToken: 'malo' })).status).toBe(403);
    // el código sigue sin usar
    expect((await activate(code!)).res.status).toBe(200);
  });

  it('rechaza claves de dispositivo inválidas', async () => {
    const [code] = await makeCodes(ctx);
    const res = await post('/v1/activate', {
      code,
      publicJwk: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) },
      turnstileToken: 'ok-turnstile',
    });
    expect(res.status).toBe(400);
  });

  it('limita intentos por IP', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let k = 0; k < 11; k++) statuses.push((await activate('LCJ-AAAA-BBBB-CCCC-DDD' + (k % 10), undefined, ip)).res.status);
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('limita intentos sobre un mismo código desde distintas IPs', async () => {
    const [code] = await makeCodes(ctx);
    await activate(code!);
    const statuses: number[] = [];
    for (let k = 0; k < 6; k++) statuses.push((await activate(code!)).res.status);
    expect(statuses.slice(0, 4).every((s) => s === 409)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('renovación', () => {
  it('renueva con la firma del dispositivo y bloquea repeticiones', async () => {
    const [code] = await makeCodes(ctx);
    const { dev } = await activate(code!);
    const ts = Math.floor(Date.now() / 1000);
    const body = await renewBody(dev, ts);
    const ok = await ctx.fetch('/v1/renew', { method: 'POST', body });
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { token: string };
    expect(await verifyToken(data.token, ctx.signingPublic)).toMatchObject({ dev: dev.id });
    expect((await ctx.fetch('/v1/renew', { method: 'POST', body })).status).toBe(409);
    expect((await ctx.fetch('/v1/renew', { method: 'POST', body: await renewBody(dev, ts + 1) })).status).toBe(200);
  });

  it('rechaza firmas de otra clave y relojes desfasados', async () => {
    const [code] = await makeCodes(ctx);
    const { dev } = await activate(code!);
    const intruder = await newDevice();
    const forged = await renewBody({ ...intruder, id: dev.id });
    expect((await ctx.fetch('/v1/renew', { method: 'POST', body: forged })).status).toBe(401);
    const old = await renewBody(dev, Math.floor(Date.now() / 1000) - 3600);
    expect((await ctx.fetch('/v1/renew', { method: 'POST', body: old })).status).toBe(409);
  });

  it('una licencia revocada no renueva ni descarga recetas, y se puede reactivar', async () => {
    const res = await ctx.admin('licenses/batch', { method: 'POST', body: JSON.stringify({ count: 1 }) });
    const { codes } = (await res.json()) as { codes: { code: string; licenseId: string }[] };
    const { dev, data } = await activate(codes[0]!.code);
    const id = codes[0]!.licenseId;
    expect((await ctx.admin(`licenses/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'filtrado' }) })).status).toBe(200);
    const r = await ctx.fetch('/v1/renew', { method: 'POST', body: await renewBody(dev) });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe('revoked');
    const cat = await ctx.fetch('/v1/catalog', { headers: { Authorization: `Bearer ${data.token}` } });
    expect(cat.status).toBe(403);
    await ctx.admin(`licenses/${id}/reactivate`, { method: 'POST', body: '{}' });
    expect((await ctx.fetch('/v1/renew', { method: 'POST', body: await renewBody(dev) })).status).toBe(200);
  });
});

describe('catálogo protegido', () => {
  it('sin autorización no hay recetas', async () => {
    expect((await ctx.fetch('/v1/catalog')).status).toBe(401);
    expect((await ctx.fetch('/v1/catalog', { headers: { Authorization: 'Bearer abc.def.ghijklmnopqrstuvwxyz' } })).status).toBe(401);
  });

  it('se sube, se publica y se descarga con autorización', async () => {
    const [code] = await makeCodes(ctx);
    const { data } = await activate(code!);
    const auth = { Authorization: `Bearer ${data.token}` };
    expect((await ctx.fetch('/v1/catalog', { headers: auth })).status).toBe(404);

    const bad = await ctx.admin('catalog', { method: 'POST', body: JSON.stringify({ catalog: { version: 1, recipes: [] } }) });
    expect(bad.status).toBe(400);

    const up = await ctx.admin('catalog', {
      method: 'POST',
      body: JSON.stringify({ catalog: { version: 1, publishedAt: '', recipes: RECETAS }, notes: 'inicial' }),
    });
    expect(up.status).toBe(200);
    const { version } = (await up.json()) as { version: number };
    expect((await ctx.admin(`catalog/${version}/publish`, { method: 'POST', body: '{}' })).status).toBe(200);

    const res = await ctx.fetch('/v1/catalog', { headers: auth });
    expect(res.status).toBe(200);
    const cat = (await res.json()) as { version: number; recipes: unknown[] };
    expect(cat.version).toBe(version);
    expect(cat.recipes).toHaveLength(RECETAS.length);

    const same = await ctx.fetch(`/v1/catalog?have=${version}`, { headers: auth });
    expect(await same.json()).toEqual({ upToDate: true, version });
  });
});

describe('cambio de dispositivo', () => {
  it('suma un segundo dispositivo, reemplaza el más viejo en el tercero y respeta el límite anual', async () => {
    const [code] = await makeCodes(ctx, 1, { maxDevices: 2 });
    const first = await activate(code!);
    const recoveryCode = first.data.recoveryCode as string;

    const second = await newDevice();
    const r2 = await post('/v1/recover', { recoveryCode, publicJwk: second.jwk, turnstileToken: 'ok-turnstile' });
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ transferred: false });

    const devs: Awaited<ReturnType<typeof newDevice>>[] = [];
    for (let k = 0; k < 3; k++) {
      const d = await newDevice();
      devs.push(d);
      const r = await post('/v1/recover', { recoveryCode, publicJwk: d.jwk, turnstileToken: 'ok-turnstile' });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ transferred: true });
    }
    // El primero quedó afuera: su renovación avisa claramente.
    const old = await ctx.fetch('/v1/renew', { method: 'POST', body: await renewBody(first.dev) });
    expect(old.status).toBe(403);
    expect(((await old.json()) as { error: string }).error).toBe('device_removed');

    // Cuarto cambio en el año: hay que escribir a soporte.
    const extra = await newDevice();
    const limit = await post('/v1/recover', { recoveryCode, publicJwk: extra.jwk, turnstileToken: 'ok-turnstile' });
    expect(limit.status).toBe(409);
    expect(((await limit.json()) as { error: string }).error).toBe('transfer_limit');
  });

  it('código de recuperación inválido', async () => {
    const d = await newDevice();
    const res = await post('/v1/recover', {
      recoveryCode: 'RCP-AAAA-BBBB-CCCC-DDDD-EEEE',
      publicJwk: d.jwk,
      turnstileToken: 'ok-turnstile',
    });
    expect(res.status).toBe(404);
  });

  it('soporte: nuevo código anula los anteriores', async () => {
    const res = await ctx.admin('licenses/batch', { method: 'POST', body: JSON.stringify({ count: 1 }) });
    const { codes } = (await res.json()) as { codes: { code: string; licenseId: string }[] };
    const first = await activate(codes[0]!.code);
    const re = await ctx.admin(`licenses/${codes[0]!.licenseId}/reissue`, { method: 'POST', body: '{}' });
    const { code: newCode } = (await re.json()) as { code: string };
    expect((await activate(codes[0]!.code)).res.status).toBe(404);
    const d = await newDevice();
    const rec = await post('/v1/recover', { recoveryCode: first.data.recoveryCode, publicJwk: d.jwk, turnstileToken: 'ok-turnstile' });
    expect(rec.status).toBe(404);
    expect((await activate(newCode)).res.status).toBe(200);
  });

  it('el detalle de licencia no expone hashes ni ids completos de dispositivo', async () => {
    const res = await ctx.admin('licenses/batch', { method: 'POST', body: JSON.stringify({ count: 1, reference: 'orden 123' }) });
    const { codes } = (await res.json()) as { codes: { code: string; licenseId: string }[] };
    const { dev } = await activate(codes[0]!.code);
    const detail = await ctx.admin(`licenses/${codes[0]!.licenseId}`);
    const text = await detail.text();
    expect(text).not.toContain('code_hash');
    expect(text).not.toContain('recovery_hash');
    expect(text).not.toContain(dev.id);
    expect(JSON.parse(text).license.reference).toBe('orden 123');
    const found = await ctx.admin('licenses/lookup', { method: 'POST', body: JSON.stringify({ code: codes[0]!.code }) });
    expect(await found.json()).toEqual({ id: codes[0]!.licenseId });
  });
});

describe('errores técnicos', () => {
  it('guarda errores sin códigos ni mails', async () => {
    const res = await post('/v1/errors', { message: 'falló con LCJ-AAAA-BBBB-CCCC-DDDD y ana@mail.com', place: 'lista' });
    expect(res.status).toBe(204);
    const list = await ctx.admin('errors');
    const { errors } = (await list.json()) as { errors: { message: string }[] };
    expect(errors[0]!.message).toBe('falló con [código] y [mail]');
  });
});

describe('configuración', () => {
  it('sin secretos, la activación no funciona (no se simula)', async () => {
    const bare = await setup({ LICENSE_SIGNING_KEY: '', TURNSTILE_SECRET: '' });
    try {
      const d = await newDevice();
      const res = await bare.fetch('/v1/activate', {
        method: 'POST',
        body: JSON.stringify({ code: 'LCJ-AAAA-BBBB-CCCC-DDDD', publicJwk: d.jwk }),
      });
      expect(res.status).toBe(503);
      expect(await (await bare.fetch('/v1/health')).json()).toEqual({ ok: true, ready: false });
    } finally {
      await bare.dispose();
    }
  });

  it('el atajo de desarrollo del panel se ignora en producción', async () => {
    const prod = await setup({ ADMIN_DEV_BYPASS: 'true' });
    try {
      expect((await prod.fetch('/admin/api/stats')).status).toBe(401);
    } finally {
      await prod.dispose();
    }
    const dev = await setup({ ADMIN_DEV_BYPASS: 'true', ENVIRONMENT: 'development' });
    try {
      expect((await dev.fetch('/admin/api/stats')).status).toBe(200);
    } finally {
      await dev.dispose();
    }
  }, 60_000);
});
