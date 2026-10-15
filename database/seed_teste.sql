-- =====================================================================
-- SEED DE TESTE - Rode quantas vezes quiser (idempotente)
-- REMOVER ANTES DE ENTREGAR
-- =====================================================================

-- 1) Bucket "produtos" público (Storage)
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

-- 2) Tipos de loja (já existem no schema, mas garante)
insert into tipos_loja (nome, desconto_padrao) values
  ('E-commerce',10),('Varejo',20),('Liga',20),('Clube',23),('Hobby Store',20),('Atacado',28)
on conflict (nome) do nothing;

-- 3) Cliente de teste
-- CNPJ: 00000000000000 (apenas zeros)
-- Desconto: 10%
-- Tipo: E-commerce (id=1)
-- Ativo: true
insert into clientes (cnpj, nome_fantasia, tipo_loja_id, desconto, ativo, prazo_pagamento)
values ('00000000000000', 'Cliente Teste', 1, 10, true, '30 dias')
on conflict (cnpj) do update set
  nome_fantasia = excluded.nome_fantasia,
  tipo_loja_id = excluded.tipo_loja_id,
  desconto = excluded.desconto,
  ativo = excluded.ativo,
  prazo_pagamento = excluded.prazo_pagamento;

-- 4) Produtos de teste
-- Produto 1: com cota 20
-- Produto 2: com cota 0 (bloqueado)
-- Produto 3: sem cota (ilimitado)
insert into produtos (codigo, nome, categoria, caixa_master, preco_caixa_master, pdv_sugerido, status, ativo)
values
  ('TESTE-001', 'Produto Teste Cota 20', 'Testes', 10, 100.00, 15.00, 'DISPONÍVEL', true),
  ('TESTE-002', 'Produto Teste Cota 0',   'Testes', 5,  50.00,  12.00, 'DISPONÍVEL', true),
  ('TESTE-003', 'Produto Teste Sem Cota', 'Testes', 1,  30.00,   8.00, 'DISPONÍVEL', true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  caixa_master = excluded.caixa_master,
  preco_caixa_master = excluded.preco_caixa_master,
  pdv_sugerido = excluded.pdv_sugerido,
  status = excluded.status,
  ativo = excluded.ativo;

-- 5) Cotas para o cliente de teste
-- Pega o id do cliente
do $$
declare
  -- v_cliente_id bigint;
  v_prod1_id bigint;
  v_prod2_id bigint;
  v_prod3_id bigint;
begin
  -- select id into v_cliente_id from clientes where cnpj = '00000000000000';
  select id into v_prod1_id from produtos where codigo = 'TESTE-001';
  select id into v_prod2_id from produtos where codigo = 'TESTE-002';
  select id into v_prod3_id from produtos where codigo = 'TESTE-003';

  -- Cota 20 para TESTE-001
  insert into cotas (tipo_loja_id, produto_id, quantidade)
  values ((select tipo_loja_id from clientes where cnpj = '00000000000000'), v_prod1_id, 20)
  on conflict (tipo_loja_id, produto_id) do update set quantidade = excluded.quantidade;

  -- Cota 0 para TESTE-002 (bloqueado)
  insert into cotas (tipo_loja_id, produto_id, quantidade)
  values ((select tipo_loja_id from clientes where cnpj = '00000000000000'), v_prod2_id, 0)
  on conflict (tipo_loja_id, produto_id) do update set quantidade = excluded.quantidade;

  -- TESTE-003: SEM cota (não insere nada = ilimitado)
  -- Se já existir uma cota antiga, remove para voltar a ser ilimitado
  delete from cotas where tipo_loja_id = (select tipo_loja_id from clientes where cnpj = '00000000000000') and produto_id = v_prod3_id;
end $$;

-- =====================================================================
-- LIMPEZA (descomente para remover tudo do seed)
-- =====================================================================
-- delete from pedido_itens where pedido_id in (select id from pedidos where cliente_id = (select id from clientes where cnpj = '00000000000000'));
-- delete from pedidos where cliente_id = (select id from clientes where cnpj = '00000000000000');
-- delete from cotas where tipo_loja_id = (select tipo_loja_id from clientes where cnpj = '00000000000000');
-- delete from produtos where codigo in ('TESTE-001','TESTE-002','TESTE-003');
-- delete from clientes where cnpj = '00000000000000';
