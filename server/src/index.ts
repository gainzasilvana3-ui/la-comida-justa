import type { Env } from './env';
import { configProblem } from './env';
import { ADMIN_CSP, HttpError, corsHeaders, errorResponse, json, withSecurityHeaders } from './http';
import { activate, catalog, claim, recover, renew, reportError } from './public-api';
import { impultiendaWebhook } from './webhook';
import { requireAdmin, requireSameOrigin } from './admin-auth';
import { handleAdmin } from './admin-api';
import { cleanup } from './rate-limit';

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith('/v1/')) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      if (path === '/v1/health' && req.method === 'GET') res = json({ ok: true, ready: configProblem(env) === null });
      else if (path === '/v1/activate' && req.method === 'POST') res = await activate(req, env);
      else if (path === '/v1/claim' && req.method === 'POST') res = await claim(req, env);
      else if (path === '/v1/recover' && req.method === 'POST') res = await recover(req, env);
      else if (path === '/v1/renew' && req.method === 'POST') res = await renew(req, env);
      else if (path === '/v1/catalog' && req.method === 'GET') res = await catalog(req, env);
      else if (path === '/v1/errors' && req.method === 'POST') res = await reportError(req, env);
      else throw new HttpError(404, 'not_found', 'No encontrado.');
    } catch (e) {
      res = toErrorResponse(e);
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  }

  if (path === '/webhooks/impultienda') {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Solo POST.');
      return await impultiendaWebhook(req, env);
    } catch (e) {
      return toErrorResponse(e);
    }
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    try {
      const admin = await requireAdmin(req, env);
      if (path.startsWith('/admin/api/')) {
        requireSameOrigin(req);
        return await handleAdmin(req, env, admin, path.slice('/admin/api/'.length));
      }
      if (!env.ASSETS) throw new HttpError(503, 'no_assets', 'Panel no disponible.');
      if (path === '/admin') return Response.redirect(`${url.origin}/admin/`, 302);
      const assetPath = path.slice('/admin'.length) || '/';
      // El binding de assets sirve index.html en "/" (pedir "/index.html" devuelve una redirección).
      const asset = await env.ASSETS.fetch(new Request(new URL(assetPath, url.origin), req));
      if (asset.status >= 300 && asset.status < 400) throw new HttpError(404, 'not_found', 'No encontrado.');
      return withSecurityHeaders(asset, { 'Content-Security-Policy': ADMIN_CSP, 'Cache-Control': 'no-store' });
    } catch (e) {
      return toErrorResponse(e);
    }
  }

  if (path === '/' || path === '/robots.txt') {
    return new Response(path === '/' ? 'La comida justa: servicio de licencias.' : 'User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return errorResponse(new HttpError(404, 'not_found', 'No encontrado.'));
}

function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) return errorResponse(e);
  console.error('Error inesperado', e instanceof Error ? e.message : e);
  return errorResponse(new HttpError(500, 'internal', 'Ocurrió un error. Probá de nuevo en un rato.'));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await route(req, env);
    return res.headers.has('Strict-Transport-Security') ? res : withSecurityHeaders(res);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await cleanup(env);
  },
} satisfies ExportedHandler<Env>;
