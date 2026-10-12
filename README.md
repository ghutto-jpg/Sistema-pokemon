# Catálogo B2B (Pokémon/Yu-Gi-Oh! TCG) - Vercel + Supabase

## Pré-requisitos
- Node.js 18+
- Conta Supabase (URL + Service Role Key)
- Vercel CLI (opcional) ou deploy na Vercel

## Configuração inicial
1. Rode 
pm install.
2. Copie .env.example para .env e preencha: ADMIN_USER, ADMIN_PASS_HASH, SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
3. No Supabase SQL Editor, execute database/schema_supabase.sql (cria tabelas, RLS, configurações e RPC criar_pedido).
4. No Supabase Storage, crie bucket produtos (público ou com regras conforme preferir).
5. Rode 
pm run dev (vercel dev) para testar localmente.

## Login
- Admin: usuário/senha definidos no .env (senha em hash bcrypt).
- Cliente: login por CNPJ apenas.

## Notas
- Upload de imagem: redimensionado para 800x800 no navegador (canvas); API valida tipo/tamanho (máx. 1 MB).
- Importação: XLSX/CSV lido no navegador (SheetJS CDN) e enviado como JSON.
- Pedido: criado via RPC criar_pedido de forma atômica (valida cotas, grava pedidos + itens).
- WhatsApp: número configurável em Configurações (admin), abre com window.location.href.

## Deploy
Faça deploy na Vercel e configure as mesmas variáveis no painel.
