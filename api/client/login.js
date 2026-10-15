import { serialize } from 'cookie';
import { signToken } from '../../lib/auth-client.js';
import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { checkLimit } from '../../lib/rate-limit.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Sair: apaga o cookie de sessão do cliente
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', serialize('client_session', '', {
      path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0,
    }));
    return res.json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const lim = checkLimit(ip);
  if (!lim.ok) return res.status(429).json({ ok: false, error: 'Muitas tentativas' });

  try {
    const body = req.body || {};
    const cnpj = String(body.cnpj || '').replace(/[^0-9]/g, '');
    if (!cnpj) return res.status(400).json({ ok: false, error: 'CNPJ inválido' });

    const { data, error } = await supabaseAdmin.from('clientes').select('*').eq('cnpj', cnpj).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    if (!data || !data.ativo) return res.status(401).json({ ok: false, error: 'Cliente não autorizado' });

    const token = await signToken({
      role: 'client',
      sub: data.id.toString(),
      cliente_id: data.id,
      cnpj: data.cnpj,
      nome_fantasia: data.nome_fantasia,
      desconto: data.desconto,
    }, '8h');

    res.setHeader('Set-Cookie', serialize('client_session', token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60,
    }));

    return res.json({
      ok: true,
      cliente: { id: data.id, cnpj: data.cnpj, nome_fantasia: data.nome_fantasia, desconto: data.desconto, prazo_pagamento: data.prazo_pagamento },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}