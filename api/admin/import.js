import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js';
import { parseCopagSpreadsheet } from '../../lib/parse-copag.js';

const CHUNK = 200;

function pedacos(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    let products = [];
    let problems = [];
    let categoriesCount = 0;

    if (req.body?.file) {
      const base64 = String(req.body.file).replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length) return res.status(400).json({ ok: false, error: 'Arquivo vazio' });

      try {
        const result = parseCopagSpreadsheet(buffer);
        products = result.products;
        problems = result.problems;
        categoriesCount = result.categoriesCount;
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    } else if (Array.isArray(req.body?.rows)) {
      products = req.body.rows;
    } else {
      return res.status(400).json({ ok: false, error: 'file ou rows required' });
    }

    if (!products.length && !problems.length) {
      return res.status(400).json({ ok: false, error: 'Nenhum produto encontrado na planilha' });
    }

    let criados = 0, atualizados = 0, erros = 0, ignoradosCount = 0;
    const errosList = [];

    for (const prob of problems) {
      erros++;
      errosList.push({ linha: prob.row, codigo: prob.codigo, motivo: prob.motivo });
    }

    const porCodigo = new Map();
    products.forEach((p, i) => {
      const codigo = String(p.codigo ?? '').trim();
      if (!codigo) { erros++; errosList.push({ i, motivo: 'codigo vazio' }); return; }
      porCodigo.set(codigo, { i, dados: p });
    });

    const existentes = new Map();
    for (const parte of pedacos([...porCodigo.keys()], CHUNK)) {
      const { data, error } = await supabaseAdmin.from('produtos').select('id, codigo').in('codigo', parte);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      (data || []).forEach((p) => existentes.set(p.codigo, p.id));
    }

    const novos = [];
    const ignorados = [];
    for (const [codigo, { i, dados }] of porCodigo) {
      if (existentes.has(codigo)) {
        ignorados.push({ i, codigo, motivo: 'já existe no banco' });
      } else {
        novos.push({
          i,
            row: {
              codigo,
              nome: dados.nome,
              categoria: dados.categoria || 'Geral',
            caixa_master: dados.caixa_master ?? 1,
            preco_caixa_master: dados.preco_caixa_master ?? 0,
            pdv_sugerido: dados.pdv_sugerido ?? 0,
            status: dados.status || 'DISPONÍVEL',
            ativo: true,
          },
        });
      }
    }

    for (const parte of pedacos(novos, CHUNK)) {
      const { error } = await supabaseAdmin.from('produtos').insert(parte.map((p) => p.row));
      if (error) { erros += parte.length; parte.forEach((p) => errosList.push({ i: p.i, motivo: error.message })); }
      else criados += parte.length;
    }

    ignoradosCount = ignorados.length;

    return res.json({ ok: true, criados, atualizados, erros, ignorados: ignoradosCount, errosList, categorias: categoriesCount });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}