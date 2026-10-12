import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireClient } from '../../lib/auth-admin.js';
import { calcPrice } from '../../lib/calc-price.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false });
  const sessao = await requireClient(req);
  if (!sessao) return res.status(401).json({ ok: false });

  try {
    const clienteId = sessao.cliente_id;

    // Dados do cliente sempre do banco: se o admin desativar ou mudar o desconto, vale na hora.
    const { data: cli } = await supabaseAdmin
      .from('clientes').select('id, cnpj, nome_fantasia, desconto, ativo').eq('id', clienteId).maybeSingle();
    if (!cli || !cli.ativo) return res.status(401).json({ ok: false, error: 'Cliente não autorizado' });

    const [prod, cot, ped, cfg] = await Promise.all([
      supabaseAdmin.from('produtos').select('*').eq('ativo', true).neq('status', 'INDISPONÍVEL').order('nome'),
      supabaseAdmin.from('cotas').select('produto_id, quantidade').eq('cliente_id', clienteId),
      supabaseAdmin.from('pedidos').select('id').eq('cliente_id', clienteId),
      supabaseAdmin.from('configuracoes').select('chave, valor'),
    ]);

    // Quanto o cliente já pediu de cada produto (a cota vale pelo total).
    const usado = new Map();
    const ids = (ped.data || []).map((p) => p.id);
    if (ids.length) {
      const { data: itens } = await supabaseAdmin
        .from('pedido_itens').select('produto_id, quantidade').in('pedido_id', ids);
      (itens || []).forEach((i) => usado.set(i.produto_id, (usado.get(i.produto_id) || 0) + i.quantidade));
    }

    const cotaMap = new Map((cot.data || []).map((c) => [c.produto_id, c.quantidade]));
    const dc = Number(cli.desconto) || 0;

    const produtos = (prod.data || [])
      .filter((p) => cotaMap.get(p.id) !== 0) // cota 0 = produto bloqueado para este cliente
      .map((p) => {
        const { precoCaixaDesc, precoUnit } = calcPrice(dc, p.preco_caixa_master, p.caixa_master);
        const cota = cotaMap.has(p.id) ? cotaMap.get(p.id) : null; // null = sem limite
        const restante = cota === null ? null : Math.max(0, cota - (usado.get(p.id) || 0));
        return { ...p, desconto_cliente: dc, preco_caixa_com_desconto: precoCaixaDesc, preco_unitario: precoUnit, cota, restante };
      });

    const whatsapp = (cfg.data || []).find((c) => c.chave === 'whatsapp_vendedor')?.valor || '';
    return res.json({
      ok: true,
      cliente: { id: cli.id, cnpj: cli.cnpj, nome_fantasia: cli.nome_fantasia, desconto: dc },
      produtos,
      whatsapp_vendedor: whatsapp,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}