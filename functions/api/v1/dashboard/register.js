import {
  USER_ROLES,
  createSession,
  hashPassword,
  normalizeEmail,
  publicUser,
  randomToken,
  sessionCookie,
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

async function readPayload(request) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error('request_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('request_too_large');
  return JSON.parse(text);
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost = async ({ request, env }) => {
  if (!env.CARES_DB) return fail(503, 'database_unavailable', 'The CARES_DB Pages binding is not configured.');

  let payload;
  try {
    payload = await readPayload(request);
  } catch (error) {
    return fail(400, error.message === 'request_too_large' ? 'request_too_large' : 'invalid_json', 'Body must be a JSON object.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, 'invalid_body', 'Body must be a JSON object.');

  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? '');
  const role = String(payload.role ?? 'need');
  const displayName = String(payload.displayName ?? '').trim();
  const organizationName = String(payload.organizationName ?? '').trim();

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return fail(400, 'invalid_email', 'Provide a valid email address.');
  if (password.length < 12 || password.length > 256) return fail(400, 'invalid_password', 'Password must be between 12 and 256 characters.');
  if (!USER_ROLES.has(role)) return fail(400, 'invalid_role', 'Role must be need, food-bank, or food-supplier.');
  if (!displayName || displayName.length > 120) return fail(400, 'invalid_display_name', 'Provide a display name up to 120 characters.');
  if (role !== 'need' && (!organizationName || organizationName.length > 160)) return fail(400, 'invalid_organization', 'Food organizations must provide an organization name up to 160 characters.');

  const id = `user_${randomToken(12)}`;
  const passwordHash = await hashPassword(password);
  const row = {
    id,
    email,
    role,
    display_name: displayName,
    organization_name: organizationName || 'Community member',
    status: 'active',
    created_at: new Date().toISOString(),
    last_login_at: null,
  };

  try {
    await env.CARES_DB.prepare(`
      INSERT INTO dashboard_users (id, email, password_hash, role, display_name, organization_name, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).bind(id, email, passwordHash, role, row.display_name, row.organization_name).run();
    const session = await createSession(env.CARES_DB, id);
    return json({ schema: 'carespace.dashboard-auth', version: '1.0', user: publicUser(row) }, 201, {
      'set-cookie': sessionCookie(session.token),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    if (/unique/i.test(detail)) return fail(409, 'email_in_use', 'An account already exists for this email.');
    return fail(500, 'registration_failed', 'The account could not be created.');
  }
};

export const onRequest = ({ request }) => fail(405, 'method_not_allowed', `${request.method} is not supported. Use POST.`);
