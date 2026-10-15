import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js'; // confira se o arquivo se chama auth-admin.js ou auth.js

function parseDesconto(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });

  try {
    // Lista tipos de loja e configurações
    if (req.method === 'GET') {
      const [tipos, cfg] = await Promise.all([
        supabaseAdmin.from('tipos_loja').select('*').order('id'),
        supabaseAdmin.from('configuracoes').select('*'),
      ]);
      const err = tipos.error || cfg.error;
      if (err) return res.status(500).json({ ok: false, error: err.message });
      return res.json({ ok: true, tipos: tipos.data || [], configuracoes: cfg.data || [] });
    }

    const body = req.body || {};

    // Cria tipo de loja OU salva uma configuração (chave/valor)
    if (req.method === 'POST') {
      if (body.tipo) {
        const nome = String(body.tipo.nome || '').trim();
        const desconto_padrao = parseDesconto(body.tipo.desconto_padrao);
        if (!nome) return res.status(400).json({ ok: false, error: 'Nome obrigatório' });
        if (desconto_padrao === null) return res.status(400).json({ ok: false, error: 'Desconto deve ser entre 0 e 100' });
        const { error } = await supabaseAdmin.from('tipos_loja').insert({ nome, desconto_padrao });
        if (error) return res.status(400).json({ ok: false, error: error.message });
        return res.json({ ok: true });
      }
      if (body.chave) {
        const { error } = await supabaseAdmin
          .from('configuracoes')
          .upsert({ chave: body.chave, valor: body.valor }, { onConflict: 'chave' });
        if (error) return res.status(400).json({ ok: false, error: error.message });
        return res.json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: 'invalid' });
    }

    // Edita nome/desconto de um tipo de loja existente
    if (req.method === 'PUT') {
      // A aba Configurações do front envia { configuracoes: [{ chave, valor }, ...] }
      if (Array.isArray(body.configuracoes)) {
        const linhas = body.configuracoes
          .filter((c) => c && String(c.chave || '').trim())
          .map((c) => ({ chave: String(c.chave).trim(), valor: c.valor ?? '' }));
        if (!linhas.length) return res.json({ ok: true });
        const { error } = await supabaseAdmin.from('configuracoes').upsert(linhas, { onConflict: 'chave' });
        if (error) return res.status(400).json({ ok: false, error: error.message });
        return res.json({ ok: true });
      }
      const { id } = body;
      const nome = String(body.nome || '').trim();
      const desconto_padrao = parseDesconto(body.desconto_padrao);
      if (!id || !nome || desconto_padrao === null) {
        return res.status(400).json({ ok: false, error: 'id, nome e desconto (0-100) obrigatórios' });
      }
      const { error } = await supabaseAdmin.from('tipos_loja').update({ nome, desconto_padrao }).eq('id', id);
      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}