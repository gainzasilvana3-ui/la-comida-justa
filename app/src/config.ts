// Configuración pública de la app (variables VITE_*). Nada de esto es secreto.
export const APP_VERSION = '1.1.0';

export const config = {
  apiBase: (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, ''),
  publicKeyJwk: import.meta.env.VITE_LICENSE_PUBLIC_KEY ?? '',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',
  supportContact: import.meta.env.VITE_SUPPORT_CONTACT ?? '',
};

export function configProblem(): string | null {
  if (!config.apiBase) return 'Falta configurar la dirección del servidor de licencias (VITE_API_BASE).';
  if (!config.publicKeyJwk) return 'Falta configurar la clave pública de licencias (VITE_LICENSE_PUBLIC_KEY).';
  return null;
}
