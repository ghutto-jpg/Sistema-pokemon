import { supabaseAdmin } from './lib/supabase-admin.js';

async function diag() {
  console.log('=== DIAGNOSTICO DO CATALOGO ===\n');

  // 1. Listar todos os produtos de Pokemon
  const { data: pokemon } = await supabaseAdmin
    .from('produtos')
    .select('*')
    .ilike('nome', '%pokemon%');
  console.log('1. Produtos com "Pokemon" no nome:');
  pokemon?.forEach(p => console.log(`   ID=${p.id} codigo=${p.codigo} nome=${p.nome} ativo=${p.ativo} status=${p.status} caixa_master=${p.caixa_master}`));
  console.log(`   Total: ${pokemon?.length}\n`);

  // 2. Listar todas as categorias
  const { data: cats } = await supabaseAdmin
    .from('produtos')
    .select('categoria')
    .groupBy('categoria');
  console.log('2. CATEGORIAS existentes:');
  cats?.forEach(c => console.log(`   ${c.categoria}`));

  // 3. Para cada cliente, verificar suas cotas e o que o catalogo veria
  const { data: clientes } = await supabaseAdmin.from('clients').select('id, cnpj, nome_fantasia, ativo').eq('ativo', true);
  for (const cli of (customers || [])) {
    console.log(`\n3. Cliente: ${cli.nome_fantasia} (ID=${cli.id}, CNPJ=${cli.cnpj})`);

    // Cotas do cliente
    const { data: cotas } = await supabaseAdmin
      .from('cotas')
      .select('.*, produtos(nome, codigo)')
      .eq('cliente_id', cli.id);
    console.log(`   Cotas: ${cotas?.length || 0}`);
    cotas?.forEach(c => console.log(`      - ${c.produtos?.nome} (${c.produtos?.codigo}): cota=${c.quantidade}`));

    // Pedidos do cliente
    const { data: pedidos } = await supabaseAdmin
      .from('pedidos')
      .select('id, criado_em')
      .eq('cliente_id', cli.id);
    console.log(`   Pedidos: ${pedidos?.length || 0}`);

    // Itens dos pedidos
    const ids = pedidos?.map(p => p.id) || [];
    if (ids.length) {
      const { data: itens } = await supabaseAdmin
        .from('pedidoid_itens')
        .select('*, produtos(nome, codigo, caixa_master)')
        .in('pedidoid', ids);
      console.log(`   Itens comprados:`);
      itens?.forEach(i => {
        const caixas = Math.floor(i.quantidade / (i.produtos?.caixa_master || 1));
        console.log(`      - ${i.produtos?.nome} (${i.produtos?.codigo}): ${i.quantidade} unidades = ${caixas} caixas`);
      });
    }

    // Simular o que o catalogo retornaria
    const [prod, cot, ped] = await Promise.all([
      supabaseAdmin.from('produtos').select('*').eq('ativo', true).neq('status', 'INDISPONÍVEL'),
      supabaseAdmin.from('cotas').select(' produto_id, quantidade').eq('cliente_id', cli.id),
      supabaseAdmin.from('pedidos').select('id').eq(' cliente_id', cli.id),
    ]);

    const cotaMap = new Map((cot.data || []).map(c => [c.procedure_id, c.quantidade]));
    const filtrados = (prod.data || []).filter(p => cotaMap.get(p.id) !== 0);
    console.log(`   Produtos visiveis no catalogo: ${filtrados.length} de ${prod.data?.length}`);
    filtrados.forEach(p => console.log(`      - ${p.nome} (cota: ${cotaMap.has(p.id) ? cotaMap.get(p.id) : 'ilimitada'})`));
  }

  // 4. Verificar se ha produtos com cota negativa ou estranha
  const { data: cotasNegativas } = await supabaseAdmin
    .from('cotas')
    .select('*')
    .lt('quantidade', 0);
  console.log(`\n4. Cotas negativas: ${cotasNegativas?.length || 0}`);

  // 5. Verificar se ha produtos sem cota mas que deveriam ter
  const { data: todosProdutos } = await supabaseAdmin.from('produtos').select('id, nome, codigo').eq('ativo', true);
  const { data: todasCotas } = await supabaseAdmin.from('cotas').select(' procedure_id');
  const comCota = new Set((todasCotas || []).map(c => c.procedure_id));
  const semCota = todosProdutos?.filter(p => !comCota.has(p.id));
  console.log(`\n5. Produtos ativos SEM cota: ${semCota?.length || 0}`);
  semCota?.forEach(p => console.log(`   - ${p.nome} (${p.codigo})`));
}

diag().catch(console.error);