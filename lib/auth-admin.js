import { verifyToken } from './auth-client.js';

function parseCookies(req) {
  const cookie = req.headers.cookie || '';
  const out = {};
  cookie.split(';').forEach(c => {
    const [k, v] = c.split('='); if (k && v) out[k.trim()] = decodeURIComponent(v.trim());
  });
  return out;
}

export async function requireAdmin(req) {
  const cookies = parseCookies(req); const token = cookies.admin_session; if (!token) return null; const payload = await verifyToken(token); if (!payload || payload.role !== 'admin') return null; return payload;
}

export async function requireClient(req) {
  const cookies = parseCookies(req); const token = cookies.client_session; if (!token) return null; const payload = await verifyToken(token); if (!payload || payload.role !== 'client') return null; return payload;
}
