export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS: string;
  ADMIN_DEV_BYPASS?: string;
  // Secretos (wrangler secret put)
  LICENSE_SIGNING_KEY: string;
  CODE_PEPPER: string;
  TURNSTILE_SECRET?: string;
}

export function isProduction(env: Env): boolean {
  // Cualquier valor distinto de "development" se trata como producción.
  return env.ENVIRONMENT !== 'development';
}

/** Revisa la configuración mínima. Devuelve el primer problema encontrado. */
export function configProblem(env: Env): string | null {
  if (!env.DB) return 'Falta la base de datos DB.';
  if (!env.LICENSE_SIGNING_KEY) return 'Falta el secreto LICENSE_SIGNING_KEY.';
  if (!env.CODE_PEPPER || env.CODE_PEPPER.length < 16) return 'Falta el secreto CODE_PEPPER (mínimo 16 caracteres).';
  if (isProduction(env) && !env.TURNSTILE_SECRET) return 'Falta el secreto TURNSTILE_SECRET.';
  if (isProduction(env) && (!env.APP_ORIGIN || env.APP_ORIGIN.includes('<'))) return 'Falta configurar APP_ORIGIN.';
  return null;
}
