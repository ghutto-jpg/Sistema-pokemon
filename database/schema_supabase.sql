-- Sistema de cartas: schema inicial (Supabase / Postgres).
-- Rode o arquivo INTEIRO de uma vez no SQL Editor, num projeto sem essas tabelas.
-- RLS ligado e sem policies: so o backend (service_role) acessa os dados.
-- Nunca exponha a service key no JS do navegador.

create table if not exists tipos_loja (
  id bigint generated always as identity primary key,
  nome text unique not null,
  desconto_padrao numeric(5,2) not null default 0
);

create table if not exists produtos (
  id bigint generated always as identity primary key,
  codigo text unique not null,
  nome text not null,
  categoria text not null default 'Geral',
  caixa_master int not null default 1,
  preco_caixa_master numeric(12,2) not null default 0,
  pdv_sugerido numeric(12,2) not null default 0,
  status text not null default 'DISPONíVEL' check (status in ('DISPONíVEL','A CONFIRMAR','INDISPONíVEL')),
  imagem text,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

create table if not exists clientes (
  id bigint generated always as identity primary key,
  cnpj text unique not null,
  nome_fantasia text not null,
  tipo_loja_id bigint references tipos_loja(id),
  desconto numeric(5,2) not null default 0,
  prazo_pagamento text,
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

create table if not exists cotas (
  tipo_loja_id bigint references tipos_loja(id) on delete cascade,
  produto_id bigint references produtos(id) on delete cascade,
  quantidade int not null check (quantidade >= 0),
  ultimo_reset timestamptz,
  primary key (tipo_loja_id, produto_id)
);

create table if not exists pedidos (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references clientes(id),
  criado_em timestamptz default now()
);

create table if not exists pedido_itens (
  pedido_id bigint references pedidos(id) on delete cascade,
  produto_id bigint references produtos(id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null,
  primary key (pedido_id, produto_id)
);

create table if not exists configuracoes (
  chave text primary key,
  valor text not null
);

alter table tipos_loja enable row level security;
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table cotas enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table configuracoes enable row level security;

insert into tipos_loja (nome, desconto_padrao) values
  ('E-commerce',10),('Varejo',20),('Liga',20),('Clube',23),('Hobby Store',20),('Atacado',28)
on conflict (nome) do nothing;

insert into configuracoes (chave, valor) values ('whatsapp_vendedor','')
on conflict (chave) do nothing;

-- Cliente de teste (ajuste CNPJ e tipo_loja_id conforme necessário)
insert into clientes (cnpj, nome_fantasia, tipo_loja_id, desconto, ativo) values
  ('12345678000195', 'Loja Teste E-commerce', 1, 10, true)
on conflict (cnpj) do nothing;

create or replace function criar_pedido(p_cliente_id bigint, p_itens jsonb)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_pedido_id bigint;
  v_item record;
  v_produto record;
  v_cliente record;
  v_cota int;
  v_consumido int;
  v_restante int;
  v_box_size int;
  v_preco_caixa_desc numeric(12,2);
  v_preco_unit numeric(12,2);
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Itens inválidos';
  end if;

  select id, ativo, desconto, tipo_loja_id
  into v_cliente
  from clientes
  where id = p_cliente_id
  for update;

  if not found then
    raise exception 'Cliente não encontrado';
  end if;

  if v_cliente.ativo is false then
    raise exception 'Cliente inativo';
  end if;

  insert into pedidos (cliente_id) values (p_cliente_id) returning id into v_pedido_id;

  for v_item in
    select produto_id, sum(quantidade) as quantidade
    from jsonb_to_recordset(p_itens) as x(produto_id bigint, quantidade int)
    group by produto_id
  loop
    select id, codigo, nome, ativo, status, caixa_master, preco_caixa_master
    into v_produto
    from produtos
    where id = v_item.produto_id;

    if not found then
      raise exception 'Produto não encontrado';
    end if;

    if v_produto.ativo is false then
      raise exception 'Produto inativo';
    end if;

    if v_produto.status = 'INDISPONíVEL' then
      raise exception 'Produto indisponível';
    end if;

    select quantidade into v_cota
    from cotas
    where tipo_loja_id = v_cliente.tipo_loja_id
      and produto_id = v_produto.id;

    if v_cota is not null and v_cota = 0 then
      raise exception 'Produto bloqueado para este cliente';
    end if;

    v_box_size := coalesce(v_produto.caixa_master, 1);

    select coalesce(sum(floor(pi.quantidade / v_box_size)), 0)
    into v_consumido
    from pedido_itens pi
    join pedidos p on p.id = pi.pedido_id
    where p.cliente_id = p_cliente_id
    and pi.produto_id = v_produto.id;

    if v_cota is not null then
      v_restante := v_cota - v_consumido;
      if v_restante <= 0 then
        raise exception 'Produto sem cota disponível';
      end if;
      if v_restante < v_item.quantidade then
        raise exception 'Quantidade acima da cota disponível para o produto';
      end if;
    end if;

    v_preco_caixa_desc := v_produto.preco_caixa_master * (1 - (v_cliente.desconto/100.0));
    v_preco_unit := case when v_produto.caixa_master is null or v_produto.caixa_master <= 0
                         then v_preco_caixa_desc
                         else v_preco_caixa_desc / v_produto.caixa_master::numeric
                    end;

    insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unitario)
    values (v_pedido_id, v_produto.id, v_item.quantidade * v_box_size, v_preco_unit);
  end loop;

  return v_pedido_id;
end;
$$;

revoke all on function criar_pedido(bigint, jsonb) from public, anon, authenticated;
grant execute on function criar_pedido(bigint, jsonb) to service_role;