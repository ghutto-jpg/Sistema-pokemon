import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

async function consumido(cliente_id) {
  const { data: pedidos } = await supabaseAdmin.from('pedidos').select('id').eq('cliente_id', cliente_id);
  const ids = (pedidos || []).map((p) => p.id);
  const map = new Map();
  if (ids.length) {
    const { data: itens } = await supabaseAdmin
      .from('pedido_itens')
      .select('produto_id, quantidade')
      .in('pedido_id', ids);
    (itens || []).forEach((i) => map.set(i.produto_id, (map.get(i.produto_id) || 0) + Number(i.quantidade)));
  }
  return map;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });

  try {
    if (req.method === 'GET') {
      const { cliente_id } = req.query || {};
      if (!cliente_id) {
        const { data, error } = await supabaseAdmin.from('cotas').select('*');
        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.json({ ok: true, data });
      }
      const [prod, cot, usadoMap] = await Promise.all([
        supabaseAdmin.from('produtos').select('id, codigo, nome, caixa_master').order('nome'),
        supabaseAdmin.from('cotas').select('produto_id, quantidade').eq('cliente_id', cliente_id),
        consumido(cliente_id),
      ]);
      const cotaMap = new Map((cot.data || []).map((c) => [c.produto_id, Number(c.quantidade)]));
      const boxSizeMap = new Map((prod.data || []).map((p) => [p.id, Number(p.caixa_master) || 1]));
      const data = (prod.data || []).map((p) => {
        const usado = usadoMap.get(p.id) || 0;
        const tem = cotaMap.has(p.id);
        const boxSize = boxSizeMap.get(p.id) || 1;
        const quantidade = tem ? Math.floor(cotaMap.get(p.id) / boxSize) : null;
        const usadoCaixas = Math.floor(usado / boxSize);
        return {
          produto_id: p.id, codigo: p.codigo, nome: p.nome,
          quantidade,
          usado: usadoCaixas,
          restante: tem ? Math.max(0, quantidade - usadoCaixas) : null,
        };
      });
      return res.json({ ok: true, data });
    }

    const body = req.body || {};
    const { cliente_id, produto_id } = body;

    if (req.method === 'PUT') {
      if (!cliente_id || !produto_id) return res.status(400).json({ ok: false, error: 'required' });
      const caixasRestantes = Number(body.quantidade);
      if (!Number.isFinite(caixasRestantes) || caixasRestantes < 0) {
        return res.status(400).json({ ok: false, error: 'quantidade >= 0' });
      }
      const { data: prod } = await supabaseAdmin
        .from('produtos')
        .select('caixa_master')
        .eq('id', produto_id)
        .maybeSingle();
      const boxSize = Number(prod?.caixa_master) || 1;
      const usado = (await consumido(cliente_id)).get(produto_id) || 0;
      const quantidade = usado + caixasRestantes * boxSize;
      const { error } = await supabaseAdmin
        .from('cotas')
        .upsert({ cliente_id, produto_id, quantidade }, { onConflict: 'cliente_id,produto_id' });
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.json({ ok: true, quantidade, usado, restante: caixasRestantes });
    }

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
