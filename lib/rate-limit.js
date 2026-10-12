const store = new Map();
const WINDOW = 60 * 1000;
const MAX = 5;
export function checkLimit(ip) {
  const now = Date.now(); const k = ip || 'unknown'; const rec = store.get(k); if (!rec || now - rec.ts > WINDOW) { store.set(k, { ts: now, count: 1 }); return { ok: true }; }
  if (rec.count >= MAX) return { ok: false, retryAfter: WINDOW - (now - rec.ts) }; rec.count++; store.set(k, rec); return { ok: true };
}
