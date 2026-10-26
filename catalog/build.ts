/**
 * Genera catalog/catalogo.json a partir de src/recetas.ts.
 * Uso: node catalog/build.ts [version]
 * El JSON resultante se publica desde el panel admin.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECETAS } from './src/recetas.ts';

const version = Number(process.argv[2] ?? 1);
const catalog = { version, publishedAt: new Date().toISOString(), recipes: RECETAS };
const out = fileURLToPath(new URL('./catalogo.json', import.meta.url));
writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Catálogo v${version}: ${RECETAS.length} recetas → ${out}`);
