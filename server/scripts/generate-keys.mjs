#!/usr/bin/env node
/**
 * Genera las claves del sistema de licencias.
 *
 *   node server/scripts/generate-keys.mjs           → modo desarrollo: escribe server/.dev.vars y app/.env.local
 *   node server/scripts/generate-keys.mjs --print   → solo muestra valores nuevos para producción
 *
 * La clave PRIVADA firma las autorizaciones y va solo al servidor (secreto).
 * La clave PÚBLICA va a la app (no es secreta).
 * Ninguno de estos archivos se sube al repositorio (.gitignore).
 */
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const print = process.argv.includes('--print');

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
const privateJwk = JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d });
const publicJwk = JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y });
const pepper = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');

if (print) {
  console.log('\n# 1) Secretos del servidor (cargalos con `npx wrangler secret put NOMBRE` desde la carpeta server):');
  console.log(`LICENSE_SIGNING_KEY=${privateJwk}`);
  console.log(`CODE_PEPPER=${pepper}`);
  console.log('\n# 2) Variable pública de la app (Cloudflare Pages → Settings → Environment variables):');
  console.log(`VITE_LICENSE_PUBLIC_KEY=${publicJwk}`);
  console.log('\nGuardá la clave privada y el pepper en un lugar seguro (gestor de contraseñas).');
  console.log('Si los perdés, las autorizaciones vigentes dejan de poder renovarse y los códigos existentes dejan de validar.\n');
  process.exit(0);
}

const devVars = join(root, 'server', '.dev.vars');
const envLocal = join(root, 'app', '.env.local');
if (existsSync(devVars) && !process.argv.includes('--force')) {
  console.log('server/.dev.vars ya existe. Usá --force para regenerar (invalida las activaciones locales).');
  process.exit(0);
}
writeFileSync(devVars, `LICENSE_SIGNING_KEY=${privateJwk}\nCODE_PEPPER=${pepper}\nTURNSTILE_SECRET=\n`);
writeFileSync(
  envLocal,
  `VITE_API_BASE=http://localhost:8787\nVITE_LICENSE_PUBLIC_KEY=${publicJwk}\nVITE_TURNSTILE_SITE_KEY=\n`,
);
console.log('Listo: server/.dev.vars y app/.env.local creados para desarrollo local.');
