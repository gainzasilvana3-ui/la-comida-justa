import { APP_VERSION, config } from '../config';
import { getPrefs } from '../db/prefs';

let sent = 0;
const MAX_PER_SESSION = 5;

/**
 * Envía errores técnicos al servidor para poder corregirlos.
 * Solo el mensaje técnico y la pantalla; nunca recetas, listas ni datos personales.
 * Se puede desactivar en Ajustes.
 */
export async function reportError(message: string, place: string): Promise<void> {
  if (sent >= MAX_PER_SESSION || !config.apiBase || !navigator.onLine) return;
  try {
    const prefs = await getPrefs();
    if (prefs.sendErrors === false) return;
    sent++;
    await fetch(`${config.apiBase}/v1/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 500), place: place.slice(0, 100), appVersion: APP_VERSION }),
      keepalive: true,
    });
  } catch {
    // si falla el reporte, no hacemos nada
  }
}

export function installErrorReporting(): void {
  window.addEventListener('error', (e) => void reportError(String(e.message || 'error'), window.location.hash.split('?')[0] || '/'));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    void reportError(reason, window.location.hash.split('?')[0] || '/');
  });
}
