import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../lib/supabase-admin.js';
import { requireAdmin } from '../../lib/auth-admin.js'; // confira o nome do arquivo em /lib

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

const MAX_BYTES = 1024 * 1024; // 1MB
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const admin = await requireAdmin(req);
  if (!admin) return res.status(401).json({ ok: false });
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  try {
    const file = req.body?.file;
    if (!file) return res.status(400).json({ ok: false, error: 'file required' });

    const type = file.type || '';
    const ext = EXT[type];
    if (!ext) return res.status(400).json({ ok: false, error: 'Use PNG, JPG ou WEBP' });

    // Remove o prefixo "data:image/png;base64," se o front mandar o dataURL inteiro
    const raw = String(file.data || file.buffer || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) return res.status(400).json({ ok: false, error: 'Arquivo vazio' });
    if (buffer.length > MAX_BYTES) return res.status(400).json({ ok: false, error: 'Arquivo > 1MB' });

    const filename = `${randomUUID()}.${ext}`; // o bucket já se chama "produtos"
    const { error } = await supabaseAdmin.storage
      .from('produtos')
      .upload(filename, buffer, { contentType: type, upsert: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });

    const { data: pub } = supabaseAdmin.storage.from('produtos').getPublicUrl(filename);
    return res.json({ ok: true, url: pub.publicUrl, path: filename });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}