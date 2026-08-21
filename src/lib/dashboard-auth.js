export const AUTH_ITERATIONS = 100_000;
export const SESSION_DAYS = 7;

export const USER_ROLES = new Set(['need', 'food-bank', 'food-supplier']);

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + padding;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePasswordBits(password, salt, iterations = AUTH_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  ));
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derivePasswordBits(password, salt);
  return `pbkdf2$sha256$${AUTH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, algorithm, iterationText, saltText, hashText] = String(encoded ?? '').split('$');
  const iterations = Number(iterationText);
  if (scheme !== 'pbkdf2' || algorithm !== 'sha256' || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) return false;
  try {
    const expected = base64UrlToBytes(hashText);
    const actual = await derivePasswordBits(password, base64UrlToBytes(saltText), iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.display_name,
    organizationName: row.organization_name,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function createSession(db, userId) {
  const token = randomToken(32);
  const tokenHash = await hashSessionToken(token);
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db.prepare('INSERT INTO dashboard_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(`session_${randomToken(12)}`, userId, tokenHash, expiresAt)
    .run();
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return `carespace_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function readSessionToken(request) {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.match(/(?:^|;\s*)carespace_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}
