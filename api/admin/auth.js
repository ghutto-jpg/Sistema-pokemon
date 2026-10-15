import bcrypt from 'bcryptjs';
import { serialize } from 'cookie';
import { signToken } from '../../lib/auth-client.js';
import { requireAdmin } from '../../lib/auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const method = req.method;
  const url = new URL(req.url, 'http://localhost'); const action = url.searchParams.get('action') || req.body?.action;
  if (method === 'GET') {
    const admin = await requireAdmin(req); return res.status(admin ? 200 : 401).json({ ok: !!admin });
  }
  if (method === 'POST') {
    const body = req.body || {}; const actionp = body.action || action;
    if (actionp === 'logout') {
      res.setHeader('Set-Cookie', serialize('admin_session', '', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV==='production', maxAge: 0 })); return res.json({ ok: true });
    }
    if (actionp === 'login' || !actionp) {
      const user = body.user || ''; const pass = body.pass || ''; const expectedUser = process.env.ADMIN_USER; const expectedHash = process.env.ADMIN_PASS_HASH;
      if (!expectedUser || !expectedHash) return res.status(500).json({ ok: false, error: 'Config admin ausente' });
      if (user !== expectedUser || !bcrypt.compareSync(pass, expectedHash)) return res.status(401).json({ ok: false, error: 'Credenciais inválidas' });
      const token = await signToken({ role: 'admin', sub: 'admin' }, '8h');
      res.setHeader('Set-Cookie', serialize('admin_session', token, { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV==='production', maxAge: 8*60*60 }));
      return res.json({ ok: true });
    }
  }
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
