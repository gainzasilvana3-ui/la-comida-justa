#!/usr/bin/env node
/**
 * Publica todo en Cloudflare de una vez: base D1, servidor de licencias, Turnstile,
 * protección del panel con Access y la app en Pages. Se puede correr varias veces:
 * lo que ya existe se reutiliza.
 *
 *   CLOUDFLARE_API_TOKEN=... ADMIN_EMAIL=tu@mail.com node scripts/publicar-cloudflare.mjs
 *
 * Variables opcionales:
 *   SUPPORT_CONTACT   contacto que muestra la app (mail o WhatsApp)
 *   PAGES_PROJECT     nombre del proyecto de Pages (por defecto "la-comida-justa")
 *   STATE_FILE        dónde guardar los datos públicos de la publicación (por defecto .publicacion.json)
 *
 * Los secretos (clave privada y pepper) se generan acá, se cargan como secretos del
 * Worker y NO se guardan en ningún archivo. Cloudflare los conserva.
 */
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto, randomInt } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'server');
const tomlPath = join(serverDir, 'wrangler.toml');
const WORKER = 'lcj-licencias';
const DB_NAME = 'lcj-licencias';

const token = process.env.CLOUDFLARE_API_TOKEN;
const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const supportContact = process.env.SUPPORT_CONTACT ?? '';
const pagesProject = process.env.PAGES_PROJECT ?? 'la-comida-justa';
const statePath = process.env.STATE_FILE ?? join(root, '.publicacion.json');

if (!token) fail('Falta CLOUDFLARE_API_TOKEN.');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) fail('Falta ADMIN_EMAIL (el mail que va a entrar al panel).');

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
const pending = [];

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
const step = (msg) => console.log(`\n→ ${msg}`);

/** Llama a la API de Cloudflare con curl (respeta el proxy del entorno). */
function api(method, path, body) {
  const args = ['-sS', '-X', method, `https://api.cloudflare.com/client/v4${path}`, '-H', `Authorization: Bearer ${token}`];
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body));
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  let data;
  try {
    data = JSON.parse(out);
  } catch {
    throw new Error(`Respuesta inesperada de Cloudflare en ${path}: ${out.slice(0, 200)}`);
  }
  return data;
}
function ok(method, path, body) {
  const d = api(method, path, body);
  if (!d.success) throw new Error(`${method} ${path}: ${JSON.stringify(d.errors)}`);
  return d.result;
}

function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: serverDir,
    encoding: 'utf8',
    stdio: opts.capture ? ['pipe', 'pipe', 'inherit'] : 'inherit',
    input: opts.input,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: state.accountId, CI: 'true' },
  });
}

function setTomlTop(key, value) {
  // Solo la parte de arriba (antes de [env.dev]) es producción.
  const text = readFileSync(tomlPath, 'utf8');
  const cut = text.indexOf('[env.dev]');
  let top = text.slice(0, cut);
  const rest = text.slice(cut);
  const line = `${key} = ${typeof value === 'string' ? JSON.stringify(value) : value}`;
  const re = new RegExp(`^${key} = .*$`, 'm');
  if (!re.test(top)) throw new Error(`No encontré ${key} en wrangler.toml`);
  top = top.replace(re, line);
  writeFileSync(tomlPath, top + rest);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
async function hmac(pepper, purpose, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${purpose}:${value}`)));
}
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------

step('Verificando el token');
const verify = api('GET', '/user/tokens/verify');
if (!verify.success) fail(`El token no es válido: ${JSON.stringify(verify.errors)}`);
const accounts = ok('GET', '/accounts');
if (!accounts.length) fail('El token no tiene acceso a ninguna cuenta.');
if (accounts.length > 1 && !state.accountId) fail(`El token ve ${accounts.length} cuentas. Poné "accountId" en ${statePath}.`);
state.accountId ??= accounts[0].id;
const A = `/accounts/${state.accountId}`;
save();
console.log(`  Cuenta: ${accounts.find((a) => a.id === state.accountId)?.name ?? state.accountId}`);

step('Base de datos D1');
let db = ok('GET', `${A}/d1/database?name=${DB_NAME}`).find((d) => d.name === DB_NAME);
if (!db) db = ok('POST', `${A}/d1/database`, { name: DB_NAME });
state.databaseId = db.uuid;
setTomlTop('database_id', db.uuid);
save();
console.log(`  ${DB_NAME}: ${db.uuid}`);

step('Dirección del servidor (workers.dev)');
let sub = api('GET', `${A}/workers/subdomain`);
let subdomain = sub.success ? sub.result?.subdomain : null;
if (!subdomain) {
  for (const candidate of ['comidajusta', `comidajusta-${randomInt(1000, 9999)}`, `lcj-${randomInt(10000, 99999)}`]) {
    const r = api('PUT', `${A}/workers/subdomain`, { subdomain: candidate });
    if (r.success) {
      subdomain = r.result.subdomain;
      break;
    }
  }
  if (!subdomain) fail('No pude crear el subdominio workers.dev de la cuenta.');
}
state.workerHost = `${WORKER}.${subdomain}.workers.dev`;
state.apiBase = `https://${state.workerHost}`;
setTomlTop('workers_dev', true);
save();
console.log(`  ${state.apiBase}`);

step('Proyecto de Pages para la app');
let project = api('GET', `${A}/pages/projects/${pagesProject}`);
if (!project.success) project = { result: ok('POST', `${A}/pages/projects`, { name: pagesProject, production_branch: 'main' }) };
state.appHost = project.result.subdomain;
state.appOrigin = `https://${state.appHost}`;
setTomlTop('APP_ORIGIN', state.appOrigin);
setTomlTop('ADMIN_EMAILS', adminEmail);
save();
console.log(`  ${state.appOrigin}`);

step('Turnstile');
const widgets = ok('GET', `${A}/challenges/widgets`);
let widget = widgets.find((w) => w.name === 'La comida justa');
if (!widget) widget = ok('POST', `${A}/challenges/widgets`, { name: 'La comida justa', domains: [state.appHost], mode: 'managed' });
else if (!widget.domains?.includes(state.appHost)) {
  widget = ok('PUT', `${A}/challenges/widgets/${widget.sitekey}`, { name: widget.name, domains: [...(widget.domains ?? []), state.appHost], mode: widget.mode ?? 'managed' });
}
let turnstileSecret = widget.secret;
if (!turnstileSecret) turnstileSecret = ok('GET', `${A}/challenges/widgets/${widget.sitekey}`).secret;
state.turnstileSiteKey = widget.sitekey;
save();
console.log(`  site key: ${widget.sitekey}`);

step('Protección del panel (Cloudflare Access)');
const org = api('GET', `${A}/access/organizations`);
if (!org.success || !org.result?.auth_domain) {
  pending.push(
    'Activar Zero Trust (plan Free) en el panel de Cloudflare y volver a correr este script. Hasta entonces el panel /admin/ no deja entrar a nadie (el resto funciona).',
  );
  console.log('  Zero Trust todavía no está activado en la cuenta: lo salteo por ahora.');
} else {
  state.accessTeamDomain = org.result.auth_domain;
  const idps = ok('GET', `${A}/access/identity_providers`);
  let otp = idps.find((i) => i.type === 'onetimepin');
  if (!otp) otp = ok('POST', `${A}/access/identity_providers`, { name: 'Código por mail', type: 'onetimepin', config: {} });
  const policies = ok('GET', `${A}/access/policies`);
  let policy = policies.find((p) => p.name === 'Administradores La comida justa');
  const policyBody = { name: 'Administradores La comida justa', decision: 'allow', include: [{ email: { email: adminEmail } }] };
  policy = policy ? ok('PUT', `${A}/access/policies/${policy.id}`, policyBody) : ok('POST', `${A}/access/policies`, policyBody);
  const apps = ok('GET', `${A}/access/apps`);
  const appBody = {
    name: 'Panel La comida justa',
    type: 'self_hosted',
    domain: `${state.workerHost}/admin`,
    session_duration: '24h',
    allowed_idps: [otp.id],
    auto_redirect_to_identity: true,
    policies: [{ id: policy.id, precedence: 1 }],
  };
  const existing = apps.find((a) => a.name === appBody.name);
  const app = existing ? ok('PUT', `${A}/access/apps/${existing.id}`, appBody) : ok('POST', `${A}/access/apps`, appBody);
  state.accessAud = app.aud;
  setTomlTop('ACCESS_TEAM_DOMAIN', state.accessTeamDomain);
  setTomlTop('ACCESS_AUD', state.accessAud);
  save();
  console.log(`  ${state.accessTeamDomain} · panel protegido para ${adminEmail}`);
}

step('Tablas de la base');
wrangler(['d1', 'migrations', 'apply', DB_NAME, '--remote']);

step('Publicando el servidor');
wrangler(['deploy']);

step('Secretos del servidor');
const secretNames = (api('GET', `${A}/workers/scripts/${WORKER}/secrets`).result ?? []).map((s) => s.name);
let newPepper = null;
const secrets = { TURNSTILE_SECRET: turnstileSecret };
if (secretNames.includes('LICENSE_SIGNING_KEY') && secretNames.includes('CODE_PEPPER')) {
  if (!state.publicKey) fail('El servidor ya tiene claves pero no encuentro la clave pública en el archivo de estado. No las reemplazo para no invalidar códigos vendidos.');
  console.log('  Las claves ya existen: las conservo.');
} else {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  secrets.LICENSE_SIGNING_KEY = JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d });
  newPepper = b64url(crypto.getRandomValues(new Uint8Array(32)));
  secrets.CODE_PEPPER = newPepper;
  state.publicKey = JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y });
  console.log('  Claves nuevas generadas.');
}
const tmp = mkdtempSync(join(tmpdir(), 'lcj-'));
try {
  const f = join(tmp, 's.json');
  writeFileSync(f, JSON.stringify(secrets), { mode: 0o600 });
  wrangler(['secret', 'bulk', f]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
save();

step('Catálogo de recetas');
const cur = JSON.parse(wrangler(['d1', 'execute', DB_NAME, '--remote', '--json', '--command', "SELECT value FROM settings WHERE key = 'current_catalog_version'"], { capture: true }));
if (Number(cur[0]?.results?.[0]?.value ?? 0) === 0) {
  const catalog = JSON.parse(readFileSync(join(root, 'catalog', 'catalogo.json'), 'utf8'));
  const data = JSON.stringify({ ...catalog, version: 1, publishedAt: new Date().toISOString() });
  const now = Math.floor(Date.now() / 1000);
  const sql = [
    `INSERT OR IGNORE INTO catalog_versions (version, data, recipes, notes, created_at, created_by) VALUES (1, ${sqlStr(data)}, ${catalog.recipes.length}, 'Catálogo inicial', ${now}, 'publicacion');`,
    "UPDATE settings SET value = '1' WHERE key = 'current_catalog_version';",
  ].join('\n');
  const t = mkdtempSync(join(tmpdir(), 'lcj-'));
  writeFileSync(join(t, 'c.sql'), sql);
  wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', join(t, 'c.sql')]);
  rmSync(t, { recursive: true, force: true });
  console.log(`  Publicadas ${catalog.recipes.length} recetas.`);
} else console.log('  Ya hay un catálogo publicado: no lo toco.');

if (newPepper) {
  step('Código de prueba');
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const body = Array.from({ length: 16 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
  const code = ['LCJ', ...body.match(/.{4}/g)].join('-');
  const hash = await hmac(newPepper, 'act', body);
  wrangler(['d1', 'execute', DB_NAME, '--remote', '--command',
    `INSERT INTO licenses (id, code_hash, status, max_devices, batch, created_at) VALUES ('${crypto.randomUUID()}', '${hash}', 'active', 2, 'pruebas', ${Math.floor(Date.now() / 1000)})`]);
  state.testCode = code;
  save();
  console.log(`  ${code} (tanda "pruebas": revocalo cuando termines de probar)`);
}

step('Compilando y publicando la app');
execFileSync('npm', ['run', 'build', '-w', 'app'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_API_BASE: state.apiBase,
    VITE_LICENSE_PUBLIC_KEY: state.publicKey,
    VITE_TURNSTILE_SITE_KEY: state.turnstileSiteKey,
    VITE_SUPPORT_CONTACT: supportContact,
  },
});
wrangler(['pages', 'deploy', join(root, 'app', 'dist'), '--project-name', pagesProject, '--branch', 'main', '--commit-dirty=true']);

step('Comprobando');
const health = execFileSync('curl', ['-sS', `${state.apiBase}/v1/health`], { encoding: 'utf8' });
console.log(`  /v1/health → ${health}`);
if (!health.includes('"ready":true')) pending.push('El servidor dice que le falta configuración: revisar /v1/health.');

console.log(`\n✓ Listo.\n  App:   ${state.appOrigin}\n  Panel: ${state.apiBase}/admin/`);
if (pending.length) console.log(`\nPendiente:\n${pending.map((p) => `  • ${p}`).join('\n')}`);
