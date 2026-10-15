import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

async function consumido(tipo_loja_id) {
  // Get all clients of this store type
  const { data: clientes } = await supabaseAdmin.from('clientes').select('id').eq('tipo_loja_id', tipo_loja_id);
  const clienteIds = (clientes || []).map((c) => c.id);
  
  if (!clienteIds.length) {
    return new Map(); // Return empty map if no clients of this type
  }
  
  // Get all orders for these clients
  const { data: pedidos } = await supabaseAdmin.from('pedidos').select('id').in('cliente_id', clienteIds);
  const pedidoIds = (pedidos || []).map((p) => p.id);
  const map = new Map();
  
  if (pedidoIds.length) {
    const { data: itens } = await supabaseAdmin
      .from('pedido_itens')
      .select('produto_id, quantidade')
      .in('pedido_id', pedidoIds);
    (itens || []).forEach((i) => map.set(i.produto_id, (map.get(i.produto_id) || 0) + Number(i.quantidade)));
  }
  
  // Converter unidades para caixas
  const boxMap = new Map();
  const { data: prods } = await supabaseAdmin.from('produtos').select('id, caixa_master');
  const boxSizeMap = new Map((prods || []).map((p) => [p.id, Number(p.caixa_master) || 1]));
  map.forEach((qtdUnidades, pid) => {
    const boxSize = boxSizeMap.get(pid) || 1;
    boxMap.set(pid, Math.floor(qtdUnidades / boxSize));
  });
  return boxMap;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });

  try {
    if (req.method === 'GET') {
      const { tipo_loja_id } = req.query || {};
      if (!tipo_loja_id) {
        const { data, error } = await supabaseAdmin.from('cotas').select('*');
        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.json({ ok: true, data });
      }
      const [prod, cot, usadoMap] = await Promise.all([
        supabaseAdmin.from('produtos').select('id, codigo, nome, caixa_master').order('nome'),
        supabaseAdmin.from('cotas').select('produto_id, quantidade').eq('tipo_loja_id', tipo_loja_id),
        consumido(Number(tipo_loja_id)),
      ]);
      const cotaMap = new Map((cot.data || []).map((c) => [c.produto_id, Number(c.quantidade)]));
      const boxSizeMap = new Map((prod.data || []).map((p) => [p.id, Number(p.caixa_master) || 1]));
      const data = (prod.data || []).map((p) => {
        const usado = usadoMap.get(p.id) || 0;
        const tem = cotaMap.has(p.id);
        const quantidade = tem ? cotaMap.get(p.id) : null;
        const restante = tem ? Math.max(0, quantidade - usado) : null;
        return {
          produto_id: p.id, codigo: p.codigo, nome: p.nome,
          quantidade,
          usado,
          restante,
        };
      });
      return res.json({ ok: true, data });
    }

    const body = req.body || {};
    const { tipo_loja_id, produto_id } = body;

    if (req.method === 'PUT') {
      if (!tipo_loja_id || !produto_id) return res.status(400).json({ ok: false, error: 'required' });
      const caixas = Number(body.quantidade);
      if (!Number.isFinite(caixas) || caixas < 0) {
        return res.status(400).json({ ok: false, error: 'quantidade >= 0' });
      }
      // Buscar cota existente para somar (não substituir)
      const { data: existente } = await supabaseAdmin
        .from('cotas')
        .select('quantidade')
        .eq('tipo_loja_id', tipo_loja_id)
        .eq('produto_id', produto_id)
        .maybeSingle();
      const quantidadeAtual = existente ? Number(existente.quantidade) : 0;
      const novaQuantidade = quantidadeAtual + caixas;
      const { error } = await supabaseAdmin
        .from('cotas')
        .upsert({ tipo_loja_id, produto_id, quantidade: novaQuantidade }, { onConflict: 'tipo_loja_id,produto_id' });
      if (error) return res.status(400).json({ ok: false, error: error.message });
      const usado = (await consumido(Number(tipo_loja_id))).get(produto_id) || 0;
      return res.json({ ok: true, quantidade: novaQuantidade, usado, restante: Math.max(0, novaQuantidade - usado) });
    }

    if (req.method === 'DELETE') {
      if (produto_id) {
        if (!tipo_loja_id) return res.status(400).json({ ok: false, error: 'required' });
        const { error } = await supabaseAdmin
          .from('cotas')
          .delete()
          .eq('tipo_loja_id', tipo_loja_id)
          .eq('produto_id', produto_id);
        if (error) return res.status(400).json({ ok: false, error: error.message });
        return res.json({ ok: true });
      }

      if (tipo_loja_id && body.all === true) {
        const { error } = await supabaseAdmin
          .from('cotas')
          .delete()
          .eq('tipo_loja_id', tipo_loja_id);
        if (error) return res.status(400).json({ ok: false, error: error.message });
        return res.json({ ok: true, cleared: true });
      }

      return res.status(400).json({ ok: false, error: 'required' });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
