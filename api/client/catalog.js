import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireClient } from '../../lib/auth-admin.js';
import { calcPrice } from '../../lib/calc-price.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const sessao = await requireClient(req);
  if (!sessao) return res.status(401).json({ ok: false });

  try {
    const clienteId = sessao.cliente_id;

    const [cli, prod, ped, cfg] = await Promise.all([
      supabaseAdmin
        .from('clientes')
        .select('id, cnpj, nome_fantasia, desconto, ativo, prazo_pagamento, tipo_loja_id')
        .eq('id', clienteId)
        .maybeSingle(),
      supabaseAdmin.from('produtos').select('*').eq('ativo', true).neq('status', 'INDISPONÍVEL').order('nome'),
      supabaseAdmin.from('pedidos').select('id, criado_em').eq('cliente_id', clienteId),
      supabaseAdmin.from('configuracoes').select('chave, valor'),
    ]);

    if (!cli || !cli.data?.ativo) return res.status(401).json({ ok: false, error: 'Cliente não autorizado' });

    // Get client's store type for quota lookup
    const tipoLojaId = cli.data.tipo_loja_id;

    // Get quotas with reset dates for this store type
    const cot = await supabaseAdmin
      .from('cotas')
      .select('produto_id, quantidade, ultimo_reset')
      .eq('tipo_loja_id', tipoLojaId);

    // Build map of reset dates by product
    const resetsMap = new Map();
    (cot.data || []).forEach((c) => {
      if (c.ultimo_reset) resetsMap.set(c.produto_id, new Date(c.ultimo_reset).getTime());
    });

    // Calcular usado considerando data de reset por produto
    const usado = new Map();
    const pedidos = ped.data || [];
    if (pedidos.length) {
      const ids = pedidos.map((p) => p.id);
      const { data: itens } = await supabaseAdmin
        .from('pedido_itens')
        .select('pedido_id, produto_id, quantidade')
        .in('pedido_id', ids);
      // Converter unidades para caixas
      const { data: prods } = await supabaseAdmin.from('produtos').select('id, caixa_master');
      const boxSizeMap = new Map((prods || []).map((p) => [p.id, Number(p.caixa_master) || 1]));
      (itens || []).forEach((i) => {
        const pedido = pedidos.find((p) => p.id === i.pedido_id);
        if (!pedido) return;
        const pedidoTime = new Date(pedido.criado_em).getTime();
        const resetTime = resetsMap.get(i.produto_id);
        if (resetTime !== undefined && pedidoTime < resetTime) return; // Pedido antes do reset, ignora
        const boxSize = boxSizeMap.get(i.produto_id) || 1;
        const caixas = Math.floor(i.quantidade / boxSize);
        usado.set(i.produto_id, (usado.get(i.produto_id) || 0) + caixas);
      });
    }

    const cotaMap = new Map((cot.data || []).map((c) => [c.produto_id, c.quantidade]));
    const dc = Number(cli.data.desconto) || 0;

    const produtos = (prod.data || [])
      .filter((p) => cotaMap.get(p.id) !== 0)
      .map((p) => {
        const { precoCaixaDesc, precoUnit } = calcPrice(dc, p.preco_caixa_master, p.caixa_master);
        const cota = cotaMap.has(p.id) ? cotaMap.get(p.id) : null;
        const usadoCaixas = usado.get(p.id) || 0;
        const restante = cota === null ? null : Math.max(0, cota - usadoCaixas);
        return { ...p, desconto_cliente: dc, preco_caixa_com_desconto: precoCaixaDesc, preco_unitario: precoUnit, cota, usado: usadoCaixas, restante };
      });

    const whatsapp = (cfg.data || []).find((c) => c.chave === 'whatsapp_vendedor')?.valor || '';
    return res.json({
      ok: true,
      cliente: { id: cli.data.id, cnpj: cli.data.cnpj, nome_fantasia: cli.data.nome_fantasia, desconto: dc, prazo_pagamento: cli.data.prazo_pagamento },
      produtos,
      whatsapp_vendedor: whatsapp,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
