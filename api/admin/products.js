import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req); if (!admin) return res.status(401).json({ ok: false });
  const method = req.method;
  if (method === 'GET') {
    const { data, error } = await supabaseAdmin.from('produtos').select('*').order('id');
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, data });
  }
  if (method === 'POST') {
    const body = req.body || {};
    const { data, error } = await supabaseAdmin.from('produtos').insert({ codigo: body.codigo, nome: body.nome, categoria: body.categoria||'Geral', caixa_master: Number(body.caixa_master)||1, preco_caixa_master: Number(body.preco_caixa_master)||0, pdv_sugerido: Number(body.pdv_sugerido)||0, status: body.status||'DISPONÍVEL', imagem: body.imagem||null, ativo: body.ativo!==false }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true, data });
  }
  if (method === 'PUT') {
    const body = req.body || {}; const id = body.id; if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const { data, error } = await supabaseAdmin.from('produtos').update({ codigo: body.codigo, nome: body.nome, categoria: body.categoria||'Geral', caixa_master: Number(body.caixa_master)||1, preco_caixa_master: Number(body.preco_caixa_master)||0, pdv_sugerido: Number(body.pdv_sugerido)||0, status: body.status||'DISPONÍVEL', imagem: body.imagem||null, ativo: !!body.ativo }).eq('id', id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true, data });
  }
  if (method === 'DELETE') {
    const body = req.body || {}; const id = body.id; if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const { error } = await supabaseAdmin.from('produtos').delete().eq('id', id);
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true });
  }
  return res.status(405).json({ ok: false });
}