import type { Env } from './env';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export const ADMIN_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

export function withSecurityHeaders(res: Response, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(err: HttpError): Response {
  return json({ error: err.code, message: err.message, ...err.extra }, err.status);
}

export function allowedOrigins(env: Env): string[] {
  return env.APP_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** CORS solo para el origen de la app. */
export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const MAX_BODY = 64 * 1024;

/** Lee JSON con límite de tamaño. */
export async function readJson(req: Request, maxBytes = MAX_BODY): Promise<unknown> {
  const type = req.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Se esperaba JSON.');
  }
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'La solicitud es demasiado grande.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'La solicitud es demasiado grande.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'JSON inválido.');
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('CF-Connecting-IP') ?? 'local';
}
