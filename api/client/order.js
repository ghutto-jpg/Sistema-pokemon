import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireClient } from '../../lib/auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const client = await requireClient(req); if (!client) return res.status(401).json({ ok: false });
  try {
    const body = req.body || {};
    const itens = Array.isArray(body.itens) ? body.itens.map(i => ({
      produto_id: Number(i.produto_id),
      quantidade: Number(i.quantidade)
    })).filter(i => i.produto_id && i.quantidade > 0) : [];
    if (!itens.length) return res.status(400).json({ ok: false, error: 'Itens vazios' });
    if (!client.cliente_id) return res.status(400).json({ ok: false, error: 'Cliente não identificado na sessão' });

    console.log('[order] cliente_id:', client.cliente_id, 'itens:', JSON.stringify(itens));

    const { data, error } = await supabaseAdmin.rpc('criar_pedido', {
      p_cliente_id: Number(client.cliente_id),
      p_itens: itens
    });

    if (error) {
      console.log('[order] erro RPC:', JSON.stringify(error));
      return res.status(400).json({ ok: false, error: error.message || error.detail || error.hint || JSON.stringify(error) || 'Erro ao criar pedido' });
    }
    return res.json({ ok: true, pedido_id: data });
  } catch (e) {
    console.log('[order] excecao:', e.message);
    return res.status(500).json({ ok: false, error: e.message || 'Erro inesperado' });
  }
}
