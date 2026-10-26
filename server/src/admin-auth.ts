import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';
import { isProduction } from './env';
import { HttpError } from './http';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/**
 * El panel está detrás de Cloudflare Access (login con código por mail).
 * Además de Access, el Worker verifica el JWT firmado por Access y que el
 * mail esté en ADMIN_EMAILS. No hay contraseñas ni claves en el código.
 */
export async function requireAdmin(req: Request, env: Env): Promise<string> {
  if (!isProduction(env) && env.ADMIN_DEV_BYPASS === 'true') return 'dev@local';

  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'admin_unauthorized', 'Acceso no autorizado.');
  if (!env.ACCESS_TEAM_DOMAIN || env.ACCESS_TEAM_DOMAIN.includes('<') || !env.ACCESS_AUD || env.ACCESS_AUD.includes('<')) {
    throw new HttpError(503, 'not_configured', 'El panel no está configurado.');
  }
  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
    });
    email = payload.email;
  } catch {
    throw new HttpError(401, 'admin_unauthorized', 'Acceso no autorizado.');
  }
  const allowed = env.ADMIN_EMAILS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (typeof email !== 'string' || !allowed.includes(email.toLowerCase())) {
    throw new HttpError(403, 'admin_forbidden', 'Tu cuenta no tiene permiso para el panel.');
  }
  return email.toLowerCase();
}

/**
 * Protección contra CSRF para cambios: Access usa cookies, así que además
 * exigimos un encabezado propio y que la solicitud venga del mismo sitio.
 */
export function requireSameOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.headers.get('X-LCJ-Admin') !== '1') {
    throw new HttpError(403, 'csrf', 'Solicitud rechazada.');
  }
  const site = req.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') throw new HttpError(403, 'csrf', 'Solicitud rechazada.');
  const origin = req.headers.get('Origin');
  if (origin && origin !== new URL(req.url).origin) throw new HttpError(403, 'csrf', 'Solicitud rechazada.');
}
