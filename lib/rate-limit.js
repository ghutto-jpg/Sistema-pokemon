import { supabaseAdmin } from './supabase-admin.js';

const WINDOW = 60 * 1000;
const MAX = 5;

export async function checkLimit(ip) {
  const k = ip || 'unknown';
  const now = Date.now();
  try {
    const { data } = await supabaseAdmin.from('rate_limits').select('*').eq('ip', k).maybeSingle();
    if (!data || now - new Date(data.ts).getTime() > WINDOW) {
      await supabaseAdmin.from('rate_limits').upsert({ ip: k, ts: new Date(now).toISOString(), count: 1 });
      return { ok: true };
    }
    if (data.count >= MAX) return { ok: false, retryAfter: WINDOW - (now - new Date(data.ts).getTime()) };
    await supabaseAdmin.from('rate_limits').update({ count: data.count + 1 }).eq('ip', k);
    return { ok: true };
  } catch {
    return { ok: true };
  }
}