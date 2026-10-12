-- Banco inicial (Supabase / Postgres). Rode no SQL Editor.


alter table tipos_loja enable row level security;

create table tipos_loja (
  id bigint generated always as identity primary key,
  nome text unique not null,
  desconto_padrao numeric(5,2) not null default 0
);

alter table produtos enable row level security;

create table produtos (
  id bigint generated always as identity primary key,
  codigo text unique not null,
  nome text not null,
  categoria text not null default 'Geral',
  caixa_master int not null default 1,
  preco_caixa_master numeric(12,2) not null default 0,
  pdv_sugerido numeric(12,2) not null default 0,
  status text not null default 'DISPONÃVEL' check (status in ('DISPONÃVEL','A CONFIRMAR','INDISPONÃVEL')),
  imagem text,                      -- URL do arquivo no Supabase Storage (bucket "produtos")
  ativo boolean not null default true,
  criado_em timestamptz default now()
);

alter table clientes enable row level security;

create table clientes (
  id bigint generated always as identity primary key,
  cnpj text unique not null,
  nome_fantasia text not null,
  tipo_loja_id bigint references tipos_loja(id),
  desconto numeric(5,2) not null default 0,

  ativo boolean not null default true,
  criado_em timestamptz default now()
);

alter table cotas enable row level security;

create table cotas (
  cliente_id bigint references clientes(id) on delete cascade,
  produto_id bigint references produtos(id) on delete cascade,
  quantidade int not null check (quantidade >= 0),
  primary key (cliente_id, produto_id)
);

alter table pedidos enable row level security;

create table pedido_itens (
  pedido_id bigint references pedidos(id) on delete cascade,
  produto_id bigint references produtos(id),
  quantidade int not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null,
  primary key (pedido_id, produto_id)
);
-- Ative RLS em todas as tabelas e acesse sÃ³ pelo backend (service key). Nunca exponha a service key no JS.
insert into tipos_loja (nome, desconto_padrao) values
 ('E-commerce',10),('Varejo',15),('Liga',20),('Clube',23),('Hobby Store',20),('Atacado',28);

alter table pedido_itens enable row level security;

create table configuracoes (
  chave text primary key,
  valor text not null
);

alter table configuracoes enable row level security;

-- Ative RLS em todas as tabelas e acesse so pelo backend (service key). Nunca exponha a service key no JS.
insert into tipos_loja (nome, desconto_padrao) values
 ('E-commerce',10),('Varejo',15),('Liga',20),('Clube',23),('Hobby Store',20),('Atacado',28);

insert into configuracoes (chave, valor) values
 ('whatsapp_vendedor','');

create or replace function criar_pedido(p_cliente_id bigint, p_itens jsonb)
returns bigint
language plpgsql
as \$\$
declare
  v_pedido_id bigint;
  v_item record;
  v_produto record;
  v_cliente record;
  v_cota int;
  v_consumido int;
  v_restante int;
  v_preco_caixa_desc numeric(12,2);
  v_preco_unit numeric(12,2);
begin
  set search_path = public;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Itens inválidos';
  end if;
  select id, ativo, desconto into v_cliente from clientes where id = p_cliente_id for update;
  if not found then raise exception 'Cliente não encontrado'; end if;
  if v_cliente.ativo is false then raise exception 'Cliente inativo'; end if;
  insert into pedidos (cliente_id) values (p_cliente_id) returning id into v_pedido_id;
  for v_item in select produto_id, sum(quantidade) as quantidade from jsonb_to_recordset(p_itens) as x(produto_id bigint, quantidade int) group by produto_id loop
    select id, codigo, nome, ativo, status, caixa_master, preco_caixa_master into v_produto from produtos where id = v_item.produto_id;
    if not found then raise exception 'Produto não encontrado'; end if;
    if v_produto.ativo is false then raise exception 'Produto inativo'; end if;
    if v_produto.status = 'INDISPONÍVEL' then raise exception 'Produto indisponível'; end if;
    select quantidade into v_cota from cotas where cliente_id = p_cliente_id and produto_id = v_produto.id;
    if v_cota is not null and v_cota = 0 then raise exception 'Produto bloqueado para este cliente'; end if;
    select coalesce(sum(pi.quantidade), 0) into v_consumido from pedido_itens pi join pedidos p on p.id = pi.pedido_id where p.cliente_id = p_cliente_id and pi.produto_id = v_produto.id;
    if v_cota is not null then
      v_restante := v_cota - v_consumido;
      if v_restante < v_item.quantidade then raise exception 'Quantidade acima da cota disponível para o produto'; end if;
    end if;
    v_preco_caixa_desc := v_produto.preco_caixa_master * (1 - (v_cliente.desconto / 100.0));
    v_preco_unit := case when v_produto.caixa_master is null or v_produto.caixa_master <= 0 then v_preco_caixa_desc else v_preco_caixa_desc / v_produto.caixa_master::numeric end;
    insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) values (v_pedido_id, v_produto.id, v_item.quantidade, v_preco_unit);
  end loop;
  return v_pedido_id;
end;
\$\$;

revoke all on function criar_pedido(bigint, jsonb) from public, anon, authenticated;
grant execute on function criar_pedido(bigint, jsonb) to service_role;
