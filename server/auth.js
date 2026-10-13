/** Minimal single-merchant session authentication for the hosted demo.
 * This is not multi-tenant identity management and should not be reused for a SaaS launch.
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const prod = process.env.NODE_ENV === 'production';
if (prod && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12 || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production requires ADMIN_PASSWORD (12+ characters) and SESSION_SECRET (32+ characters).');
}
const password = process.env.ADMIN_PASSWORD || (prod ? '' : 'local-demo-only');
const signingKey = `${process.env.SESSION_SECRET || randomBytes(32).toString('hex')}:${createHash('sha256').update(password).digest('hex')}`;
const cookieName = 'dg_session';
const MAX_AGE = 12 * 60 * 60;
const revokedTokens = new Map();

function signature(payload) {
  return createHmac('sha256', signingKey).update(payload).digest('base64url');
}
function constantEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function cookieValue() {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + MAX_AGE * 1000, nonce: randomBytes(8).toString('hex') })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function validatePassword(input) {
  if (typeof input !== 'string' || input.length > 200) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(password).digest();
  return timingSafeEqual(a, b);
}
export function authCookie() {
  return `${cookieName}=${cookieValue()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Strict${prod ? '; Secure' : ''}`;
}
export function clearAuthCookie() {
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${prod ? '; Secure' : ''}`;
}
export function isAuthenticated(req) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`));
  if (!raw) return false;
  const value = raw.slice(cookieName.length + 1);
  const sep = value.lastIndexOf('.');
  if (sep < 1) return false;
  const payload = value.slice(0, sep);
  if (!constantEqual(signature(payload), value.slice(sep + 1))) return false;
  if (revokedTokens.get(value) > Date.now()) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return parsed.v === 1 && typeof parsed.exp === 'number' && parsed.exp > Date.now() && parsed.exp <= Date.now() + MAX_AGE * 1000;
  } catch { return false; }
}
export function isSameOrigin(req) {
  // Browser POSTs include an Origin. Requests without Origin must still authenticate for private actions.
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return !!host && new URL(origin).host.toLowerCase() === String(host).toLowerCase();
  } catch { return false; }
}

export function revokeSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`));
  if (!raw) return;
  const value = raw.slice(cookieName.length + 1);
  if (isAuthenticated(req)) revokedTokens.set(value, Date.now() + MAX_AGE * 1000);
  if (revokedTokens.size > 10000) for (const [k, expiry] of revokedTokens) if (expiry < Date.now()) revokedTokens.delete(k);
}
