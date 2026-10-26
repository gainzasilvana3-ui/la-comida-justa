import { z } from 'zod';
import { ACTIVATION_LENGTH, ACTIVATION_PREFIX, catalogSchema, firstError, normalizeCode, randomCode } from '@lcj/shared';
import type { Env } from './env';
import { hmac, newId } from './crypto';
import { HttpError, json, readJson } from './http';
import { getSettings, setSetting } from './settings';

const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

async function audit(env: Env, admin: string, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_log (at, admin, action, detail) VALUES (?1, ?2, ?3, ?4)')
    .bind(now(), admin, action, JSON.stringify(detail))
    .run();
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_input', firstError(r.error));
  return r.data;
}

const label = z.string().trim().max(60).regex(/^[\p{L}\p{N} _.#/-]*$/u, 'Usá solo letras, números, espacios y - _ . # /');

const batchSchema = z.object({
  count: z.number().int().min(1, 'Mínimo 1 código.').max(500, 'Máximo 500 códigos por tanda.'),
  batch: label.optional(),
  reference: label.optional(),
  maxDevices: z.number().int().min(1).max(5).optional(),
});

const patchSchema = z.object({
  maxDevices: z.number().int().min(1).max(5).optional(),
  reference: label.nullable().optional(),
});

const settingsSchema = z.object({
  default_max_devices: z.number().int().min(1).max(5).optional(),
  transfers_per_year: z.number().int().min(0).max(20).optional(),
  latest_app_version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Versión con formato 1.2.3')
    .optional(),
});

interface LicenseListRow {
  id: string;
  status: string;
  max_devices: number;
  batch: string | null;
  reference: string | null;
  created_at: number;
  activated_at: number | null;
  revoked_at: number | null;
  revoke_reason: string | null;
  active_devices: number;
}

async function createCode(env: Env): Promise<{ code: string; hash: string }> {
  const code = randomCode(ACTIVATION_PREFIX, ACTIVATION_LENGTH);
  return { code, hash: await hmac(env, 'act', normalizeCode(code, ACTIVATION_PREFIX)!) };
}

export async function handleAdmin(req: Request, env: Env, admin: string, path: string): Promise<Response> {
  const method = req.method;
  const url = new URL(req.url);

  if (path === 'me' && method === 'GET') return json({ email: admin });

  if (path === 'stats' && method === 'GET') {
    const row = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM licenses) AS total,
         (SELECT COUNT(*) FROM licenses WHERE activated_at IS NOT NULL AND status = 'active') AS activated,
         (SELECT COUNT(*) FROM licenses WHERE activated_at IS NULL AND status = 'active') AS unused,
         (SELECT COUNT(*) FROM licenses WHERE status = 'revoked') AS revoked,
         (SELECT COUNT(*) FROM devices WHERE status = 'active') AS devices,
         (SELECT COUNT(*) FROM error_reports WHERE at > ?1) AS errors7d`,
    )
      .bind(now() - 7 * DAY)
      .first();
    return json({ ...row, settings: await getSettings(env) });
  }

  if (path === 'licenses' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
    const status = url.searchParams.get('status') ?? '';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q) {
      where.push(`(l.id LIKE ?${args.length + 1} OR l.batch LIKE ?${args.length + 1} OR l.reference LIKE ?${args.length + 1})`);
      args.push(`%${q.replace(/[%_]/g, '')}%`);
    }
    if (status === 'active' || status === 'revoked') {
      where.push(`l.status = ?${args.length + 1}`);
      args.push(status);
    } else if (status === 'unused') {
      where.push("l.activated_at IS NULL AND l.status = 'active'");
    }
    const sql = `SELECT l.id, l.status, l.max_devices, l.batch, l.reference, l.created_at, l.activated_at, l.revoked_at, l.revoke_reason,
        (SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status = 'active') AS active_devices
      FROM licenses l ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC, l.id LIMIT ${limit} OFFSET ${offset}`;
    const { results } = await env.DB.prepare(sql)
      .bind(...args)
      .all<LicenseListRow>();
    return json({ licenses: results, limit, offset });
  }

  if (path === 'licenses/lookup' && method === 'POST') {
    const body = parse(z.object({ code: z.string().max(80) }), await readJson(req));
    const act = normalizeCode(body.code, ACTIVATION_PREFIX);
    const rec = normalizeCode(body.code, 'RCP');
    let row: { id: string } | null = null;
    if (act) row = await env.DB.prepare('SELECT id FROM licenses WHERE code_hash = ?1').bind(await hmac(env, 'act', act)).first();
    if (!row && rec) row = await env.DB.prepare('SELECT id FROM licenses WHERE recovery_hash = ?1').bind(await hmac(env, 'rec', rec)).first();
    if (!row) throw new HttpError(404, 'not_found', 'No hay ninguna licencia con ese código.');
    return json({ id: row.id });
  }

  if (path === 'licenses/batch' && method === 'POST') {
    const body = parse(batchSchema, await readJson(req));
    const settings = await getSettings(env);
    const maxDevices = body.maxDevices ?? settings.default_max_devices;
    const created = now();
    const out: { licenseId: string; code: string }[] = [];
    const stmts: D1PreparedStatement[] = [];
    for (let k = 0; k < body.count; k++) {
      const id = newId();
      const { code, hash } = await createCode(env);
      out.push({ licenseId: id, code });
      stmts.push(
        env.DB.prepare(
          'INSERT INTO licenses (id, code_hash, status, max_devices, batch, reference, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
        ).bind(id, hash, 'active', maxDevices, body.batch || null, body.reference || null, created),
      );
    }
    for (let k = 0; k < stmts.length; k += 50) await env.DB.batch(stmts.slice(k, k + 50));
    await audit(env, admin, 'generar_codigos', { count: body.count, batch: body.batch ?? null });
    return json({ codes: out, maxDevices });
  }

  const licMatch = /^licenses\/([0-9a-f-]{36})(?:\/([a-z-]+))?$/.exec(path);
  if (licMatch) {
    const id = licMatch[1]!;
    const action = licMatch[2];
    const lic = await env.DB.prepare('SELECT * FROM licenses WHERE id = ?1').bind(id).first<Record<string, unknown>>();
    if (!lic) throw new HttpError(404, 'not_found', 'Licencia inexistente.');

    if (!action && method === 'GET') {
      const { results: devices } = await env.DB.prepare(
        'SELECT substr(id, 1, 8) AS short_id, status, created_at, last_seen_at, removed_at FROM devices WHERE license_id = ?1 ORDER BY created_at',
      )
        .bind(id)
        .all();
      const transfers = await env.DB.prepare('SELECT COUNT(*) AS n FROM transfers WHERE license_id = ?1 AND at > ?2')
        .bind(id, now() - 365 * DAY)
        .first<{ n: number }>();
      // Nunca se devuelven los hashes.
      const { code_hash: _c, recovery_hash: rh, ...safe } = lic;
      return json({ license: { ...safe, has_recovery: Boolean(rh) }, devices, transfersLastYear: transfers?.n ?? 0 });
    }

    if (!action && method === 'PATCH') {
      const body = parse(patchSchema, await readJson(req));
      if (body.maxDevices !== undefined) {
        await env.DB.prepare('UPDATE licenses SET max_devices = ?1 WHERE id = ?2').bind(body.maxDevices, id).run();
      }
      if (body.reference !== undefined) {
        await env.DB.prepare('UPDATE licenses SET reference = ?1 WHERE id = ?2').bind(body.reference || null, id).run();
      }
      await audit(env, admin, 'editar_licencia', { id, ...body });
      return json({ ok: true });
    }

    if (action === 'revoke' && method === 'POST') {
      const body = parse(z.object({ reason: z.string().trim().max(200).optional() }), await readJson(req));
      await env.DB.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ?1, revoke_reason = ?2 WHERE id = ?3")
        .bind(now(), body.reason || null, id)
        .run();
      await audit(env, admin, 'revocar', { id, reason: body.reason ?? null });
      return json({ ok: true });
    }

    if (action === 'reactivate' && method === 'POST') {
      await env.DB.prepare("UPDATE licenses SET status = 'active', revoked_at = NULL, revoke_reason = NULL WHERE id = ?1").bind(id).run();
      await audit(env, admin, 'reactivar', { id });
      return json({ ok: true });
    }

    if (action === 'reset-devices' && method === 'POST') {
      // El comprador vuelve a entrar con su código de recuperación, sin gastar cambios del año.
      await env.DB.batch([
        env.DB.prepare("UPDATE devices SET status = 'removed', removed_at = ?1 WHERE license_id = ?2 AND status = 'active'").bind(now(), id),
        env.DB.prepare('DELETE FROM transfers WHERE license_id = ?1').bind(id),
      ]);
      await audit(env, admin, 'liberar_dispositivos', { id });
      return json({ ok: true });
    }

    if (action === 'reissue' && method === 'POST') {
      // Para quien perdió ambos códigos: nuevo código de activación; el anterior y el de recuperación dejan de servir.
      const { code, hash } = await createCode(env);
      await env.DB.batch([
        env.DB.prepare('UPDATE licenses SET code_hash = ?1, recovery_hash = NULL, activated_at = NULL WHERE id = ?2').bind(hash, id),
        env.DB.prepare("UPDATE devices SET status = 'removed', removed_at = ?1 WHERE license_id = ?2 AND status = 'active'").bind(now(), id),
        env.DB.prepare('DELETE FROM transfers WHERE license_id = ?1').bind(id),
      ]);
      await audit(env, admin, 'nuevo_codigo', { id });
      return json({ licenseId: id, code });
    }
  }

  if (path === 'settings' && method === 'GET') return json(await getSettings(env));

  if (path === 'settings' && method === 'PUT') {
    const body = parse(settingsSchema, await readJson(req));
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) await setSetting(env, k as keyof typeof body, v);
    }
    await audit(env, admin, 'ajustes', body);
    return json(await getSettings(env));
  }

  if (path === 'catalog' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT version, recipes, notes, created_at, created_by FROM catalog_versions ORDER BY version DESC LIMIT 50',
    ).all();
    const settings = await getSettings(env);
    return json({ versions: results, current: settings.current_catalog_version });
  }

  if (path === 'catalog' && method === 'POST') {
    const body = (await readJson(req, 4 * 1024 * 1024)) as { catalog?: unknown; notes?: unknown };
    const parsed = catalogSchema.safeParse(body.catalog);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(400, 'invalid_catalog', `Catálogo inválido: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
    }
    const recipes = parsed.data.recipes;
    if (new Set(recipes.map((r) => r.id)).size !== recipes.length) {
      throw new HttpError(400, 'invalid_catalog', 'Catálogo inválido: hay recetas con el mismo id.');
    }
    if (recipes.some((r) => r.source !== 'catalogo')) {
      throw new HttpError(400, 'invalid_catalog', 'Catálogo inválido: todas las recetas deben tener source "catalogo".');
    }
    const last = await env.DB.prepare('SELECT MAX(version) AS v FROM catalog_versions').first<{ v: number | null }>();
    const version = (last?.v ?? 0) + 1;
    const data = JSON.stringify({ ...parsed.data, version, publishedAt: new Date().toISOString() });
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 200) : null;
    await env.DB.prepare('INSERT INTO catalog_versions (version, data, recipes, notes, created_at, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(version, data, recipes.length, notes, now(), admin)
      .run();
    await audit(env, admin, 'subir_catalogo', { version, recipes: recipes.length });
    return json({ version, recipes: recipes.length });
  }

  const pubMatch = /^catalog\/(\d+)\/publish$/.exec(path);
  if (pubMatch && method === 'POST') {
    const version = Number(pubMatch[1]);
    const exists = await env.DB.prepare('SELECT version FROM catalog_versions WHERE version = ?1').bind(version).first();
    if (!exists) throw new HttpError(404, 'not_found', 'Esa versión no existe.');
    await setSetting(env, 'current_catalog_version', version);
    await audit(env, admin, 'publicar_catalogo', { version });
    return json({ current: version });
  }

  if (path === 'errors' && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT id, at, app_version, place, message FROM error_reports ORDER BY at DESC LIMIT 200',
    ).all();
    return json({ errors: results });
  }

  if (path === 'audit' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT at, admin, action, detail FROM audit_log ORDER BY id DESC LIMIT 200').all();
    return json({ audit: results });
  }

  throw new HttpError(404, 'not_found', 'No encontrado.');
}
