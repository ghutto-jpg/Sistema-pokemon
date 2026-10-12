import { signToken } from './lib/auth-client.js';
import { supabaseAdmin } from './lib/supabase-admin.js';

const token = await signToken({ role: 'admin', sub: 'admin' }, '8h');

// descobre cliente de teste e um produto de teste
const { data: cli } = await supabaseAdmin.from('clientes').select('id, nome_fantasia').eq('cnpj', '00000000000000').maybeSingle();
const { data: prod } = await supabaseAdmin.from('produtos').select('id, nome').eq('codigo', 'TESTE-001').maybeSingle();
console.log('cliente:', cli, 'produto:', prod);
if (!cli || !prod) process.exit(1);

const cid = String(cli.id), pid = prod.id;

function mk(method, qs, body) {
  return {
    method,
    headers: { cookie: `admin_session=${token}` },
    query: qs || {},
    body: body || {},
  };
}

let status = 200, json = null;
const res = { status(c) { status = c; return res; }, json(j) { json = j; } };

const { default: handler } = await import('./api/admin/quotas.js');

// GET visão do admin
await handler(mk('GET', { cliente_id: cid }), res);
console.log('\nGET status', status);
const antes = (json.data || []).find((x) => String(x.produto_id) === String(pid));
console.log('antes:', JSON.stringify(antes));

// PUT: admin digita "30" = quer que o contador mostre 30 restantes
await handler(mk('PUT', null, { cliente_id: cid, produto_id: pid, quantidade: 30 }), res);
console.log('\nPUT 30 status', status, '->', JSON.stringify(json));

// GET novamente para conferir o contador
await handler(mk('GET', { cliente_id: cid }), res);
const depois = (json.data || []).find((x) => String(x.produto_id) === String(pid));
console.log('\ndepois:', JSON.stringify(depois));

// PUT: admin soma 5 -> contador deve ficar 35
await handler(mk('PUT', null, { cliente_id: cid, produto_id: pid, quantidade: depois.restante + 5 }), res);
console.log('\nPUT +5 status', status, '->', JSON.stringify(json));

await handler(mk('GET', { cliente_id: cid }), res);
const final = (json.data || []).find((x) => String(x.produto_id) === String(pid));
console.log('\nfinal:', JSON.stringify(final));
console.log('\nconferido: restante final =', final.restante, '(esperado 35)');
