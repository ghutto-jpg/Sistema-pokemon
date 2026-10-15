import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';

async function consumido(tipo_loja_id, resetsMap = null) {
  // Get all clients of this store type
  const { data: clientes } = await supabaseAdmin.from('clientes').select('id').eq('tipo_loja_id', tipo_loja_id);
  const clienteIds = (clientes || []).map((c) => c.id);
  
  if (!clienteIds.length) {
    return new Map(); // Return empty map if no clients of this type
  }
  
  // Get all orders for these clients with created_at
  const { data: pedidos } = await supabaseAdmin
    .from('pedidos')
    .select('id, criado_em')
    .in('cliente_id', clienteIds);
  
  // Filtrar pedidos por data de reset (se houver)
  let pedidoIds = (pedidos || []).map((p) => p.id);
  if (resetsMap) {
    // Para cada produto, temos uma data de reset diferente
    // Precisamos agrupar pedidos por produto, o que requer join com pedido_itens
    // Vamos buscar todos os itens e filtrar no JS
    const { data: allItens } = await supabaseAdmin
      .from('pedido_itens')
      .select('pedido_id, produto_id, quantidade')
      .in('pedido_id', pedidoIds);
    
    const mapa = new Map();
    (allItens || []).forEach((i) => {
      const pedido = pedidos.find((p) => p.id === i.pedido_id);
      if (!pedido) return;
      const pedidoData = new Date(pedido.criado_em).getTime();
      const resetData = resetsMap.get(i.produto_id);
      const resetTime = resetData ? new Date(resetData).getTime() : 0;
      if (pedidoData >= resetTime) {
        mapa.set(i.produto_id, (mapa.get(i.produto_id) || 0) + Number(i.quantidade));
      }
    });
    
    // Converter unidades para caixas
    const boxMap = new Map();
    const { data: prods } = await supabaseAdmin.from('produtos').select('id, caixa_master');
    const boxSizeMap = new Map((prods || []).map((p) => [p.id, Number(p.caixa_master) || 1]));
    mapa.forEach((qtdUnidades, pid) => {
      const boxSize = boxSizeMap.get(pid) || 1;
      boxMap.set(pid, Math.floor(qtdUnidades / boxSize));
    });
    return boxMap;
  }
  
  if (pedidoIds.length) {
    const map = new Map();
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
      const [prod, cot] = await Promise.all([
        supabaseAdmin.from('produtos').select('id, codigo, nome, caixa_master').order('nome'),
        supabaseAdmin.from('cotas').select('produto_id, quantidade, ultimo_reset').eq('tipo_loja_id', tipo_loja_id),
      ]);
      
      // Construir mapa de resets por produto
      const resetsMap = new Map();
      (cot.data || []).forEach((c) => {
        if (c.ultimo_reset) resetsMap.set(c.produto_id, c.ultimo_reset);
      });
      
      const usadoMap = await consumido(Number(tipo_loja_id), resetsMap);
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
    const query = req.query || {};
    const tipo_loja_id = body.tipo_loja_id ?? query.tipo_loja_id;
    const produto_id = body.produto_id ?? query.produto_id;
    const all = body.all ?? query.all;

    if (req.method === 'PUT') {
      if (!tipo_loja_id || !produto_id) return res.status(400).json({ ok: false, error: 'required' });
      const caixas = Number(body.quantidade);
      if (!Number.isFinite(caixas) || caixas < 0) {
        return res.status(400).json({ ok: false, error: 'quantidade >= 0' });
      }
      const agora = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from('cotas')
        .upsert({ tipo_loja_id, produto_id, quantidade: caixas, ultimo_reset: agora }, { onConflict: 'tipo_loja_id,produto_id' });
      if (error) return res.status(400).json({ ok: false, error: error.message });
      const resetsMap = new Map();
      resetsMap.set(produto_id, agora);
      const usado = (await consumido(Number(tipo_loja_id), resetsMap)).get(produto_id) || 0;
      return res.json({ ok: true, quantidade: caixas, usado, restante: Math.max(0, caixas - usado) });
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

      if (tipo_loja_id && all === true) {
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
