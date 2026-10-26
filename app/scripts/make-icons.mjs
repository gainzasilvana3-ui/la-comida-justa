// Genera los íconos PNG de la PWA a partir de public/favicon.svg usando Chromium (Playwright).
const { chromium } = await import('playwright').catch(() => import(process.env.PLAYWRIGHT_PATH ?? 'playwright'));
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, file, padding = 0, bg = 'transparent') {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - padding * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg}"><div style="padding:${padding}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  writeFileSync(new URL(`../public/${file}`, import.meta.url), await page.screenshot({ omitBackground: bg === 'transparent' }));
}
await render(192, 'pwa-192.png');
await render(512, 'pwa-512.png');
await render(512, 'pwa-maskable-512.png', 56, '#3f6b3c');
await render(180, 'apple-touch-icon.png', 0, '#3f6b3c');
await browser.close();
console.log('Íconos generados.');
