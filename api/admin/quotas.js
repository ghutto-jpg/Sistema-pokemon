import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });

  try {
    // Lista cotas (de um cliente, se vier ?cliente_id=)
    if (req.method === 'GET') {
      const { cliente_id } = req.query || {};
      let q = supabaseAdmin.from('cotas').select('*');
      if (cliente_id) q = q.eq('cliente_id', cliente_id);
      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true, data });
    }

    const body = req.body || {};
    const { cliente_id, produto_id } = body;

    // Cria ou atualiza a cota (0 = bloqueado)
    if (req.method === 'PUT') {
      if (!cliente_id || !produto_id) return res.status(400).json({ ok: false, error: 'required' });
      const quantidade = Number(body.quantidade);
      if (!Number.isFinite(quantidade) || quantidade < 0) {
        return res.status(400).json({ ok: false, error: 'quantidade >= 0' });
      }
      const { error } = await supabaseAdmin
        .from('cotas')
        .upsert({ cliente_id, produto_id, quantidade }, { onConflict: 'cliente_id,produto_id' });
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    }

    // Remove a cota: o produto volta a ficar "sem limite" para esse cliente
    if (req.method === 'DELETE') {
      if (!cliente_id || !produto_id) return res.status(400).json({ ok: false, error: 'required' });
      const { error } = await supabaseAdmin
        .from('cotas')
        .delete()
        .eq('cliente_id', cliente_id)
        .eq('produto_id', produto_id);
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}