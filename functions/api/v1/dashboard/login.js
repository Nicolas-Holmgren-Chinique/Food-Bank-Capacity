import {
  createSession,
  normalizeEmail,
  publicUser,
  sessionCookie,
  verifyPassword,
} from '../../../../src/lib/dashboard-auth.js';

const MAX_BODY_BYTES = 64_000;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extraHeaders },
});

const fail = (status, error, detail) => json({ error, detail }, status);

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost = async ({ request, env }) => {
  if (!env.CARES_DB) return fail(503, 'database_unavailable', 'The CARES_DB Pages binding is not configured.');

  let payload;
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    const text = await request.text();
    if (declared > MAX_BODY_BYTES || text.length > MAX_BODY_BYTES) return fail(413, 'request_too_large', 'Request body is too large.');
    payload = JSON.parse(text);
  } catch {
    return fail(400, 'invalid_json', 'Body must be a JSON object.');
  }

  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password ?? '');
  if (!email || !password) return fail(400, 'missing_credentials', 'Email and password are required.');

  try {
    const user = await env.CARES_DB.prepare(`
      SELECT id, email, password_hash, role, display_name, organization_name, status, created_at, last_login_at
      FROM dashboard_users
      WHERE email = ? COLLATE NOCASE
      LIMIT 1
    `).bind(email).first();
    if (!user || user.status !== 'active' || !(await verifyPassword(password, user.password_hash))) {
      return fail(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    const session = await createSession(env.CARES_DB, user.id);
    const lastLoginAt = new Date().toISOString();
    await env.CARES_DB.prepare('UPDATE dashboard_users SET last_login_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(lastLoginAt, user.id)
      .run();
    return json({ schema: 'carespace.dashboard-auth', version: '1.0', user: publicUser({ ...user, last_login_at: lastLoginAt }) }, 200, {
      'set-cookie': sessionCookie(session.token),
    });
  } catch {
    return fail(500, 'login_failed', 'The dashboard could not sign you in.');
  }
};

export const onRequest = ({ request }) => fail(405, 'method_not_allowed', `${request.method} is not supported. Use POST.`);
