import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js'; // confira o nome do arquivo em /lib

const CHUNK = 200;

// Aceita número ou texto no formato brasileiro ("R$ 1.234,56")
function toNum(v) {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Monta só os campos que vieram preenchidos na planilha,
// para uma coluna vazia não apagar o que já está no banco.
function normalizar(r) {
  const d = {};
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  if (txt(r.nome)) d.nome = txt(r.nome);
  if (txt(r.categoria)) d.categoria = txt(r.categoria);
  if (txt(r.status)) d.status = txt(r.status).toUpperCase();
  const cm = toNum(r.caixa_master); if (cm !== undefined) d.caixa_master = cm;
  const pc = toNum(r.preco_caixa_master); if (pc !== undefined) d.preco_caixa_master = pc;
  const pv = toNum(r.pdv_sugerido); if (pv !== undefined) d.pdv_sugerido = pv;
  return d;
}

// A planilha chega com os cabeçalhos originais ("Código", "Preço da caixa master"...).
// Aqui cada coluna é convertida para o nome do campo no banco.
const ALIAS = {
  codigo: ['codigo', 'cod', 'sku', 'code', 'ref', 'referencia'],
  nome: ['nome', 'produto', 'descricao', 'name', 'titulo'],
  categoria: ['categoria', 'linha', 'category'],
  caixa_master: ['caixa_master', 'caixa', 'qtd_caixa', 'cx_master', 'unidades_caixa', 'qtd_master'],
  preco_caixa_master: ['preco_caixa_master', 'preco_da_caixa_master', 'preco_caixa', 'valor_caixa', 'preco', 'valor'],
  pdv_sugerido: ['pdv_sugerido', 'pdv', 'preco_sugerido', 'preco_pdv'],
  status: ['status', 'situacao', 'disponibilidade'],
};
const slug = (k) => String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function mapear(r) {
  const s = {};
  for (const [k, v] of Object.entries(r || {})) s[slug(k)] = v;
  const out = {};
  for (const [campo, nomes] of Object.entries(ALIAS)) {
    const achou = nomes.find((n) => s[n] !== undefined && s[n] !== '');
    if (achou) out[campo] = s[achou];
  }
  return out;
}

function pedacos(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'rows required' });

    let criados = 0, atualizados = 0, erros = 0;
    const errosList = [];

    // 1) Limpa e remove códigos repetidos (vale a última linha)
    const porCodigo = new Map();
    rows.forEach((r, i) => {
      const m = mapear(r);
      const codigo = String(m.codigo ?? '').trim();
      if (!codigo) { erros++; errosList.push({ i, motivo: 'codigo vazio' }); return; }
      porCodigo.set(codigo, { i, dados: normalizar(m) });
    });

    // 2) Descobre de uma vez quais códigos já existem
    const existentes = new Map();
    for (const parte of pedacos([...porCodigo.keys()], CHUNK)) {
      const { data, error } = await supabaseAdmin.from('produtos').select('id, codigo').in('codigo', parte);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      (data || []).forEach((p) => existentes.set(p.codigo, p.id));
    }

    const novos = [];
    const paraAtualizar = [];
    for (const [codigo, { i, dados }] of porCodigo) {
      if (existentes.has(codigo)) {
        paraAtualizar.push({ i, id: existentes.get(codigo), dados });
      } else if (!dados.nome) {
        erros++; errosList.push({ i, motivo: 'produto novo sem nome' });
      } else {
        novos.push({
          i,
          row: {
            codigo,
            categoria: 'Geral',
            caixa_master: 1,
            preco_caixa_master: 0,
            pdv_sugerido: 0,
            status: 'DISPONÍVEL',
            ...dados,
            ativo: true,
          },
        });
      }
    }

    // 3) Insere os novos em lote
    for (const parte of pedacos(novos, CHUNK)) {
      const { error } = await supabaseAdmin.from('produtos').insert(parte.map((p) => p.row));
      if (error) { erros += parte.length; parte.forEach((p) => errosList.push({ i: p.i, motivo: error.message })); }
      else criados += parte.length;
    }

    // 4) Atualiza os existentes (sem mexer em "ativo")
    for (const parte of pedacos(paraAtualizar, 10)) {
      await Promise.all(parte.map(async (p) => {
        if (!Object.keys(p.dados).length) return; // nada para atualizar
        const { error } = await supabaseAdmin.from('produtos').update(p.dados).eq('id', p.id);
        if (error) { erros++; errosList.push({ i: p.i, motivo: error.message }); }
        else atualizados++;
      }));
    }

    return res.json({ ok: true, criados, atualizados, erros, errosList });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}