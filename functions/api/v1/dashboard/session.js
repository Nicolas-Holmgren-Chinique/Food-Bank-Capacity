import {
  clearSessionCookie,
  hashSessionToken,
  publicUser,
  readSessionToken,
} from '../../../../src/lib/dashboard-auth.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extraHeaders },
});

const unauthenticated = (extraHeaders = {}) => json({ error: 'not_authenticated', detail: 'Sign in to use the dashboard.' }, 401, extraHeaders);

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestGet = async ({ request, env }) => {
  if (!env.CARES_DB) return json({ error: 'database_unavailable', detail: 'The CARES_DB Pages binding is not configured.' }, 503);
  const token = readSessionToken(request);
  if (!token) return unauthenticated();

  const tokenHash = await hashSessionToken(token);
  const user = await env.CARES_DB.prepare(`
    SELECT u.id, u.email, u.role, u.display_name, u.organization_name, u.status, u.created_at, u.last_login_at
    FROM dashboard_sessions s
    JOIN dashboard_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
    LIMIT 1
  `).bind(tokenHash, Date.now()).first();
  if (!user) return unauthenticated({ 'set-cookie': clearSessionCookie() });
  return json({ schema: 'carespace.dashboard-auth', version: '1.0', user: publicUser(user) });
};

export const onRequestDelete = async ({ request, env }) => {
  if (env.CARES_DB) {
    const token = readSessionToken(request);
    if (token) {
      const tokenHash = await hashSessionToken(token);
      await env.CARES_DB.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').bind(tokenHash).run();
    }
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
};

export const onRequest = ({ request }) => json({
  error: 'method_not_allowed',
  detail: `${request.method} is not supported. Use GET or DELETE.`,
}, 405, { Allow: 'GET, DELETE, OPTIONS' });
