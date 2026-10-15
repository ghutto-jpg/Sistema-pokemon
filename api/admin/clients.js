import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req); if (!admin) return res.status(401).json({ ok: false });
  const method = req.method;
  if (method === 'GET') {
    const { data, error } = await supabaseAdmin.from('clientes').select('*, tipos_loja(nome)').order('id');
    if (error) return res.status(500).json({ ok: false, error: error.message }); return res.json({ ok: true, data });
  }
  if (method === 'POST') {
    const body = req.body || {};
    const { data, error } = await supabaseAdmin.from('clientes').insert({ cnpj: body.cnpj, nome_fantasia: body.nome_fantasia, tipo_loja_id: body.tipo_loja_id||null, desconto: Number(body.desconto)||0, prazo_pagamento: body.prazo_pagamento||null, ativo: body.ativo!==false }).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true, data });
  }
  if (method === 'PUT') {
    const body = req.body || {}; const id = body.id; if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const update = {}; if (body.cnpj !== undefined) update.cnpj = body.cnpj; if (body.nome_fantasia !== undefined) update.nome_fantasia = body.nome_fantasia; if (body.tipo_loja_id !== undefined) update.tipo_loja_id = body.tipo_loja_id||null; if (body.desconto !== undefined) update.desconto = Number(body.desconto)||0; if (body.prazo_pagamento !== undefined) update.prazo_pagamento = body.prazo_pagamento; if (body.ativo !== undefined) update.ativo = !!body.ativo;
    const { data, error } = await supabaseAdmin.from('clientes').update(update).eq('id', id).select().single();
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true, data });
  }
  if (method === 'DELETE') {
    const body = req.body || {}; const id = body.id; if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    // Primeiro remove os itens de pedido e pedidos do cliente (foreign key constraint)
    const { error: errItens } = await supabaseAdmin.from('pedido_itens').delete().in('pedido_id', (await supabaseAdmin.from('pedidos').select('id').eq('cliente_id', id)).data?.map((p) => p.id) || []);
    const { error: errPedidos } = await supabaseAdmin.from('pedidos').delete().eq('cliente_id', id);
    if (errItens || errPedidos) return res.status(400).json({ ok: false, error: errItens?.message || errPedidos?.message });
    const { error } = await supabaseAdmin.from('clientes').delete().eq('id', id);
    if (error) return res.status(400).json({ ok: false, error: error.message }); return res.json({ ok: true });
  }
  return res.status(405).json({ ok: false });
}