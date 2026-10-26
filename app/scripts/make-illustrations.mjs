// Genera las ilustraciones de platos (SVG) que se muestran cuando una receta no tiene foto.
// Uso: node scripts/make-illustrations.mjs  (escribe en src/assets/ilustraciones/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../src/assets/ilustraciones');
mkdirSync(out, { recursive: true });

// Generador pseudoaleatorio fijo: las ilustraciones salen siempre iguales.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const dots = (r, n, cx, cy, rad, size, color, opacity = 1) => {
  let s = '';
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * rad;
    s += `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" r="${(size * (0.6 + r() * 0.6)).toFixed(1)}" fill="${color}" opacity="${opacity}"/>`;
  }
  return s;
};

/** Fondo de mantel con lunares suaves. */
const table = (w, h, color, dot) => {
  let s = `<rect width="${w}" height="${h}" fill="${color}"/>`;
  for (let y = 12; y < h; y += 28) for (let x = (y / 28) % 2 ? 26 : 12; x < w; x += 28) s += `<circle cx="${x}" cy="${y}" r="2.2" fill="${dot}"/>`;
  return s;
};

const plate = (cx, cy, r) =>
  `<ellipse cx="${cx + 6}" cy="${cy + 10}" rx="${r}" ry="${r}" fill="#000" opacity=".12"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fffdf8"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="#efe6d6" stroke-width="3"/>`;

const bowl = (cx, cy, r, broth) =>
  `<ellipse cx="${cx + 6}" cy="${cy + 10}" rx="${r}" ry="${r}" fill="#000" opacity=".14"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#c2643c"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="#e98a5e"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="${broth}"/>`;

const napkin = (x, y, rot, color) =>
  `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 55}" y="${y - 80}" width="110" height="160" rx="6" fill="${color}"/>` +
  `<path d="M${x - 55} ${y - 40}h110M${x - 55} ${y + 40}h110M${x - 20} ${y - 80}v160M${x + 20} ${y - 80}v160" stroke="#fff" stroke-width="5" opacity=".35"/></g>`;

const fork = (x, y, rot) =>
  `<g transform="rotate(${rot} ${x} ${y})" fill="#b9b2a6"><rect x="${x - 4}" y="${y - 20}" width="8" height="110" rx="4"/>` +
  `<rect x="${x - 13}" y="${y - 70}" width="26" height="26" rx="6"/>` +
  [-11, -4, 3, 10].map((dx) => `<rect x="${x + dx - 1}" y="${y - 105}" width="3.5" height="40" rx="1.7"/>`).join('') +
  `</g>`;

const leaf = (x, y, rot, size, color = '#5f8b3a') =>
  `<path transform="rotate(${rot} ${x} ${y})" d="M${x} ${y}q${size * 0.6} ${-size * 0.5} ${size * 1.4} 0q${-size * 0.8} ${size * 0.5} ${-size * 1.4} 0z" fill="${color}"/>`;

// ---------- platos ----------

function milanesa(cx, cy) {
  const r = rng(11);
  return (
    `<path d="M${cx - 78} ${cy - 18}c8-40 62-58 104-44 34 11 46 44 30 70-18 30-74 42-108 30-24-9-31-32-26-56z" fill="#c97e2c"/>` +
    `<path d="M${cx - 72} ${cy - 18}c8-34 58-50 96-38 30 10 40 38 26 60-16 26-66 36-96 26-21-8-30-28-26-48z" fill="#dfa04a"/>` +
    dots(r, 70, cx - 12, cy - 8, 60, 2.2, '#b5691f', 0.8) +
    dots(r, 30, cx - 12, cy - 8, 55, 1.8, '#f3c77a', 0.9) +
    // puré
    `<path d="M${cx + 8} ${cy + 46}c-4-22 18-34 36-28 8-14 34-12 40 4 18 2 24 22 12 34-6 16-30 20-44 12-16 8-40 0-44-22z" fill="#f4e2a6"/>` +
    `<path d="M${cx + 30} ${cy + 52}c8-10 24-10 32 0M${cx + 40} ${cy + 66}c6-6 16-6 22 0" stroke="#dcc078" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    dots(r, 8, cx + 48, cy + 50, 26, 2.5, '#5f8b3a') +
    // limón
    `<path d="M${cx - 64} ${cy + 40}a32 32 0 0 0 52 26z" fill="#f2cf3c"/>` +
    `<path d="M${cx - 58} ${cy + 46}a24 24 0 0 0 38 19z" fill="#f8e47e"/>`
  );
}

function pollo(cx, cy) {
  const r = rng(23);
  const drum = (x, y, rot) =>
    `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x + 30}" y="${y - 7}" width="34" height="14" rx="7" fill="#f6efe2"/>` +
    `<circle cx="${x + 66}" cy="${y - 7}" r="9" fill="#f6efe2"/><circle cx="${x + 66}" cy="${y + 7}" r="9" fill="#f6efe2"/>` +
    `<ellipse cx="${x}" cy="${y}" rx="42" ry="28" fill="#a85a22"/><ellipse cx="${x - 3}" cy="${y - 3}" rx="36" ry="22" fill="#c8742f"/>` +
    `<ellipse cx="${x - 12}" cy="${y - 9}" rx="12" ry="6" fill="#e39a52" opacity=".8"/></g>`;
  const papa = (x, y, rot) =>
    `<rect transform="rotate(${rot} ${x} ${y})" x="${x - 17}" y="${y - 14}" width="34" height="28" rx="10" fill="#e8b04a"/>` +
    `<rect transform="rotate(${rot} ${x} ${y})" x="${x - 13}" y="${y - 11}" width="24" height="18" rx="7" fill="#f6d27a"/>`;
  return (
    drum(cx - 30, cy - 30, -20) +
    drum(cx - 10, cy + 22, 15) +
    papa(cx + 52, cy - 40, 12) +
    papa(cx + 66, cy, -18) +
    papa(cx + 44, cy + 44, 30) +
    papa(cx - 62, cy + 52, -8) +
    leaf(cx + 20, cy - 66, 20, 18) +
    leaf(cx + 76, cy + 34, -40, 16) +
    dots(r, 24, cx, cy, 70, 1.6, '#7a3f14', 0.7)
  );
}

function lentejas(cx, cy) {
  const r = rng(37);
  let carrots = '';
  for (let k = 0; k < 9; k++) {
    const a = r() * Math.PI * 2;
    const d = 14 + r() * 52;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    carrots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="#ee7f2d"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#f7a65e"/>`;
  }
  return (
    dots(r, 160, cx, cy, 70, 3.2, '#6e3a1e', 0.9) +
    dots(r, 60, cx, cy, 70, 2.4, '#b06a3a', 0.9) +
    carrots +
    dots(r, 10, cx, cy, 60, 5, '#f2d36b') +
    dots(r, 16, cx, cy, 60, 2.8, '#4f7d2e')
  );
}

function fideos(cx, cy) {
  const r = rng(53);
  let s = '';
  for (let k = 0; k < 26; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * 40;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const rr = 28 + r() * 34;
    const a1 = r() * 6.28;
    const a2 = a1 + 1.8 + r() * 1.6;
    s += `<path d="M${(x + Math.cos(a1) * rr).toFixed(1)} ${(y + Math.sin(a1) * rr).toFixed(1)}A${rr.toFixed(1)} ${rr.toFixed(1)} 0 0 1 ${(x + Math.cos(a2) * rr).toFixed(1)} ${(y + Math.sin(a2) * rr).toFixed(1)}" stroke="${k % 3 ? '#f2cf72' : '#e6b94e'}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  }
  return (
    s +
    `<path d="M${cx - 34} ${cy - 6}c2-26 40-34 58-18 20-4 32 18 20 34-4 22-36 28-52 16-22 4-34-14-26-32z" fill="#c8372a"/>` +
    `<path d="M${cx - 26} ${cy - 6}c4-18 32-24 46-12 14-2 22 14 12 24-4 14-26 18-38 10-16 2-24-10-20-22z" fill="#de5136"/>` +
    dots(r, 12, cx - 2, cy + 4, 30, 3, '#a72a1f', 0.7) +
    leaf(cx - 6, cy - 14, -30, 20, '#3f7d2a') +
    leaf(cx + 8, cy - 4, 40, 18, '#4f9233') +
    dots(r, 26, cx, cy, 72, 1.8, '#fff6d8')
  );
}

function tarta(cx, cy) {
  const r = rng(71);
  let scallop = '';
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    scallop += `<circle cx="${(cx + Math.cos(a) * 86).toFixed(1)}" cy="${(cy + Math.sin(a) * 86).toFixed(1)}" r="11" fill="#d9963f"/>`;
  }
  return (
    scallop +
    `<circle cx="${cx}" cy="${cy}" r="86" fill="#e3a54e"/>` +
    `<circle cx="${cx}" cy="${cy}" r="74" fill="#6f9a3b"/>` +
    dots(r, 50, cx, cy, 66, 7, '#8db54f', 0.9) +
    dots(r, 26, cx, cy, 62, 6, '#fff3cf') +
    dots(r, 14, cx, cy, 62, 4, '#f2c94c') +
    // porción cortada
    `<path d="M${cx} ${cy}L${cx + 98} ${cy - 26}A100 100 0 0 1 ${cx + 92} ${cy + 40}z" fill="#fffdf8"/>` +
    `<path d="M${cx + 14} ${cy + 6}L${cx + 112} ${cy - 14}A100 100 0 0 1 ${cx + 106} ${cy + 48}z" fill="#6f9a3b" stroke="#d9963f" stroke-width="9" stroke-linejoin="round"/>`
  );
}

function verduras(cx, cy) {
  const r = rng(89);
  let s = '';
  for (let k = 0; k < 34; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 70;
    const x = (cx + Math.cos(a) * d).toFixed(1);
    const y = (cy + Math.sin(a) * d).toFixed(1);
    const rot = Math.round(r() * 180);
    const kind = k % 5;
    if (kind === 0) s += `<rect transform="rotate(${rot} ${x} ${y})" x="${x - 22}" y="${y - 5}" width="44" height="10" rx="5" fill="#d8402a"/>`;
    else if (kind === 1) s += `<circle cx="${x}" cy="${y}" r="12" fill="#6aa03a"/><circle cx="${x}" cy="${y}" r="8" fill="#d9eaa0"/>`;
    else if (kind === 2) s += `<rect transform="rotate(${rot} ${x} ${y})" x="${x - 18}" y="${y - 4}" width="36" height="8" rx="4" fill="#f08a2c"/>`;
    else if (kind === 3) s += `<path transform="rotate(${rot} ${x} ${y})" d="M${x - 16} ${y}a16 16 0 0 1 32 0" stroke="#9b4f8f" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    else s += `<rect transform="rotate(${rot} ${x} ${y})" x="${x - 18}" y="${y - 5}" width="36" height="10" rx="5" fill="#f2c230"/>`;
  }
  return s + dots(r, 30, cx, cy, 72, 1.8, '#3f6b2a') + dots(r, 18, cx, cy, 70, 1.6, '#fff', 0.8);
}

function sopa(cx, cy) {
  const r = rng(97);
  let cubes = '';
  const colors = ['#ee7f2d', '#f6d27a', '#7fb24a', '#ee7f2d', '#f4e7c8'];
  for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2;
    const d = 8 + Math.sqrt(r()) * 56;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    cubes += `<rect transform="rotate(${Math.round(r() * 90)} ${x.toFixed(1)} ${y.toFixed(1)})" x="${(x - 8).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="16" height="16" rx="4" fill="${colors[k % 5]}"/>`;
  }
  return (
    `<path d="M${cx - 40} ${cy - 30}q20-16 40 0t40 0" stroke="#fff3c4" stroke-width="5" fill="none" opacity=".7" stroke-linecap="round"/>` +
    cubes +
    dots(r, 20, cx, cy, 62, 2.6, '#4f7d2e') +
    dots(r, 14, cx, cy, 60, 3.5, '#fbe9a8', 0.8)
  );
}

// ---------- composición ----------

const CATEGORIES = {
  carnes: { bg: '#f3dcbf', dot: '#ead0ad', napkin: '#5f8b5a', dish: (cx, cy) => plate(cx, cy, 112) + milanesa(cx, cy) },
  pollo: { bg: '#f7e0cc', dot: '#efd2b9', napkin: '#c2643c', dish: (cx, cy) => plate(cx, cy, 112) + pollo(cx, cy) },
  legumbres: { bg: '#e9e2cf', dot: '#ddd4bd', napkin: '#d9a441', dish: (cx, cy) => bowl(cx, cy, 108, '#8a4a28') + lentejas(cx, cy) },
  pastas_y_arroces: { bg: '#f6e4da', dot: '#ecd5c8', napkin: '#5f8b5a', dish: (cx, cy) => plate(cx, cy, 112) + fideos(cx, cy) },
  tartas_y_masas: { bg: '#efe6cf', dot: '#e3d8bb', napkin: '#c2643c', dish: (cx, cy) => plate(cx, cy, 112) + tarta(cx - 8, cy) },
  verduras: { bg: '#e3eedc', dot: '#d3e3c9', napkin: '#d9a441', dish: (cx, cy) => plate(cx, cy, 112) + verduras(cx, cy) },
  sopas_y_guisos: { bg: '#f1e6d2', dot: '#e6d8bf', napkin: '#5f8b5a', dish: (cx, cy) => bowl(cx, cy, 108, '#efa53f') + sopa(cx, cy) },
};

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${body}</svg>\n`;

for (const [name, c] of Object.entries(CATEGORIES)) {
  const body = table(400, 300, c.bg, c.dot) + napkin(338, 210, 14, c.napkin) + fork(340, 190, 14) + c.dish(190, 150);
  writeFileSync(join(out, `${name}.svg`), svg(400, 300, body));
}

// Imagen grande del inicio: una mesa con varios platos.
{
  const C = CATEGORIES;
  const body =
    table(800, 360, '#f3dcbf', '#ead0ad') +
    napkin(540, 250, 62, '#c2643c') +
    fork(560, 250, 62) +
    C.pastas_y_arroces.dish(120, 110) +
    C.carnes.dish(400, 190) +
    C.verduras.dish(690, 110);
  writeFileSync(join(out, 'mesa.svg'), svg(800, 360, body));
}

console.log('Ilustraciones generadas en', out);
