// Force rebuild - 2026-10-12
// Force rebuild 2
import { toast, brl, esc } from "./utils.js";

/* =====================================================================
   1. AJUSTES. Se alguma coisa vier vazia ou errada, mexa só aqui.
   ===================================================================== */
const API = {
  adminAuth: "/api/admin/auth",
  products: "/api/admin/products",
  upload: "/api/admin/products-upload",
  clients: "/api/admin/clients",
  quotas: "/api/admin/quotas",
  import: "/api/admin/import",
  settings: "/api/admin/settings",
  clientLogin: "/api/client/login",
  catalog: "/api/client/catalog",
  order: "/api/client/order",
};
const UPDATE_METHOD = "PUT"; // troque para "PATCH" se sua API usar PATCH
// Tipos de loja: iguais aos da tabela tipos_loja do banco. Se mudar lá, mude aqui.
const TIPOS = [
  { id: 1, nome: "E-commerce", desc: 10 }, { id: 2, nome: "Varejo", desc: 20 }, { id: 3, nome: "Liga", desc: 20 },
  { id: 4, nome: "Clube", desc: 23 }, { id: 5, nome: "Hobby Store", desc: 20 }, { id: 6, nome: "Atacado", desc: 28 },
];
const STATUS = ["DISPONÍVEL", "A CONFIRMAR", "INDISPONÍVEL"];
const F = {
  p: { id: "id", codigo: "codigo", nome: "nome", categoria: "categoria", caixa: "caixa_master", preco: "preco_caixa_master", pdv: "pdv_sugerido", status: "status", ativo: "ativo", img: "imagem" },
  c: { id: "id", cnpj: "cnpj", nome: "nome_fantasia", tipo: "tipo_loja_id", desc: "desconto", ativo: "ativo" },
};

/* =====================================================================
   2. Utilidades
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const num = (v) => Number(String(v).replace(",", ".")) || 0;
const digits = (v) => String(v || "").replace(/\D/g, "");

// Converte valor para número, tratando R$ e vírgula
function toFloat(v) {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace("R$", "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

// Converte "24 Dúzias" → 288, "1 dúzia" → 12, "03 Dúzias" → 36
function parseCaixaMaster(v) {
  if (!v) return 1;
  const s = String(v).toLowerCase().replace(/dúzias?/g, "").replace(/[^0-9]/g, "").trim();
  const n = parseInt(s) || 1;
  return String(v).toLowerCase().includes("dúzia") ? n * 12 : n;
}
const maskCnpj = (v) => digits(v).slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
const list = (d) => (Array.isArray(d) ? d : (d && (d.items || d.data || d.rows || d.produtos || d.clientes || d.products || d.clients || d.cotas || d.quotas)) || []);

// Lê a imagem escolhida e devolve { name, type, data } (data = dataURL em base64) para a API de upload
const fileToJson = (f) => new Promise((ok, no) => {
  if (f.size > 1024 * 1024) return no(new Error("Imagem maior que 1MB. Reduza para cerca de 600 x 600 px."));
  const r = new FileReader();
  r.onload = () => ok({ name: f.name, type: f.type, data: r.result });
  r.onerror = () => no(new Error("Não consegui ler a imagem"));
  r.readAsDataURL(f);
});

async function fj(url, opts = {}) {
  const { headers, body, ...rest } = opts;
  const isForm = body instanceof FormData;
  const r = await fetch(url, {
    credentials: "include",
    ...rest,
    body: body && !isForm ? JSON.stringify(body) : body,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(headers || {}) },
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error((d && (d.error || d.message)) || (typeof d === "string" && d) || r.statusText);
  return d;
}

/* =====================================================================
   3. Estado
   ===================================================================== */
const S = {
  area: "cliente", admin: false, tab: "produtos", q: "", modal: null,
  produtos: [], clientes: [], config: [], cotas: {}, cotaCliente: "", imp: { nome: "", rows: [] },
  cliente: null, catalogo: [], cart: {}, cartOpen: false, vendedor: "", done: null,
};

/* =====================================================================
   4. Estilos (injetados aqui, não depende do style.css)
   ===================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Instrument+Sans:wght@400;500;600&display=swap');
:root{--ink:#16143A;--panel:#211E52;--panel2:#2B2766;--line:#3B3790;--text:#ECEAFB;--mute:#A9A5D6;--gold:#F5C842;--hot:#FF5C8A;--ok:#47D18C;--r:14px}
body{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#2f2a79 0%,transparent 60%),var(--ink);color:var(--text);font:400 15px/1.5 'Instrument Sans',system-ui,sans-serif;min-height:100vh}
#app *{box-sizing:border-box}
#app h1,#app h2,#app h3{font-family:'Bricolage Grotesque',system-ui,sans-serif;margin:0;letter-spacing:-.01em}
#app button{font:inherit;cursor:pointer}
#app :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.tc-btn{background:var(--gold);color:#2a2200;border:0;border-radius:10px;padding:10px 18px;font-weight:600;transition:transform .12s,filter .12s}
.tc-btn:hover{filter:brightness(1.08)}.tc-btn:active{transform:scale(.97)}
.tc-btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.tc-btn.sm{padding:6px 12px;font-size:13px}.tc-btn.danger{background:var(--hot);color:#fff}
.tc-in,.tc-sel{width:100%;background:#15133a;border:1px solid var(--line);color:var(--text);border-radius:10px;padding:10px 12px;font:inherit}
.tc-lab{display:block;font-size:13px;color:var(--mute);margin:12px 0 4px}
.tc-err{color:var(--hot);min-height:1.4em;margin:10px 0 0}
.tc-login{display:grid;place-items:center;min-height:100vh;padding:20px}
.tc-panel{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:28px;width:100%;max-width:380px;animation:pop .5s cubic-bezier(.2,1.3,.4,1)}
@keyframes pop{from{opacity:0;transform:translateY(16px) scale(.96)}}
.tc-panel h1{font-size:30px;margin-bottom:4px}.tc-panel p{color:var(--mute);margin:0 0 14px}
.tc-top{display:flex;align-items:center;gap:14px;padding:14px 22px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tc-top h2{font-size:20px;flex:1}
.tc-tabs{display:flex;gap:6px;padding:14px 22px 0;overflow-x:auto}
.tc-tabs button{background:transparent;color:var(--mute);border:1px solid transparent;border-radius:10px 10px 0 0;padding:9px 16px;white-space:nowrap}
.tc-tabs button.on{background:var(--panel);color:var(--text);border-color:var(--line);border-bottom-color:var(--panel)}
.tc-main{padding:0 22px 40px}.tc-body{background:var(--panel);border:1px solid var(--line);border-radius:0 var(--r) var(--r) var(--r);padding:18px}
.tc-bar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}.tc-bar .tc-in{max-width:320px}
.tc-row{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;padding:10px;border-radius:12px}
.tc-row:hover{background:var(--panel2)}
.tc-row.cli{grid-template-columns:1fr auto}
.tc-th{width:56px;height:56px;border-radius:10px;background:#15133a;object-fit:cover;display:grid;place-items:center;color:var(--mute)}
.tc-row b{display:block}.tc-row small{color:var(--mute)}
.tc-tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:#15133a;border:1px solid var(--line);margin-right:6px}
.tc-tag.ok{color:var(--ok);border-color:var(--ok)}.tc-tag.off{color:var(--hot);border-color:var(--hot)}
.tc-act{display:flex;gap:8px;align-items:center}
.tc-sw{width:42px;height:24px;border-radius:99px;background:#15133a;border:1px solid var(--line);position:relative;padding:0}
.tc-sw::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--mute);transition:.2s}
.tc-sw.on{background:var(--ok);border-color:var(--ok)}.tc-sw.on::after{left:20px;background:#fff}
.tc-empty{padding:40px 10px;text-align:center;color:var(--mute)}
.tc-modal-bg{position:fixed;inset:0;background:#0009;display:grid;place-items:center;padding:16px;z-index:50;animation:fade .2s}
@keyframes fade{from{opacity:0}}
.tc-modal{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;width:100%;max-width:520px;max-height:90vh;overflow:auto;animation:pop .35s cubic-bezier(.2,1.3,.4,1)}
.tc-modal h3{margin-bottom:6px}.tc-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tc-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
.tc-quota{display:grid;grid-template-columns:1fr 110px;gap:10px;align-items:center;padding:8px 10px}
.tc-drop{border:2px dashed var(--line);border-radius:14px;padding:26px;text-align:center;color:var(--mute)}
.tc-prev{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.tc-prev td,.tc-prev th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}
/* ---- lojinha ---- */
.tc-shop{max-width:1180px;margin:0 auto;padding:22px}
.tc-hello{display:flex;align-items:center;gap:14px;margin-bottom:22px;flex-wrap:wrap}
.tc-hello h2{font-size:clamp(24px,4vw,38px);flex:1}
.tc-cartbtn{position:relative}.tc-cartbtn.bump{animation:bump .4s}
@keyframes bump{40%{transform:scale(1.18) rotate(-4deg)}}
.tc-cartbtn i{position:absolute;top:-8px;right:-8px;background:var(--hot);color:#fff;font-style:normal;font-size:12px;min-width:22px;height:22px;border-radius:99px;display:grid;place-items:center;padding:0 5px}
.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;perspective:900px}
.tc-card{--rx:0deg;--ry:0deg;--mx:50%;--my:50%;position:relative;background:var(--panel);border:3px solid var(--gold);border-radius:18px;padding:12px;transform:rotateX(var(--rx)) rotateY(var(--ry));transition:transform .15s ease-out,box-shadow .2s;transform-style:preserve-3d;overflow:hidden;animation:deal .5s backwards;animation-delay:calc(var(--i)*40ms)}
@keyframes deal{from{opacity:0;transform:translateY(30px) rotate(3deg)}}
.tc-card:hover{box-shadow:0 18px 40px #0008}
.tc-card::after{content:"";position:absolute;inset:0;border-radius:15px;pointer-events:none;opacity:0;transition:opacity .2s;mix-blend-mode:color-dodge;background:radial-gradient(circle at var(--mx) var(--my),#fff8 0,transparent 35%),linear-gradient(115deg,#ff5c8a55,#f5c84255,#47d1ff55,#b46bff55)}
.tc-card:hover::after{opacity:1}
.tc-img{aspect-ratio:1/1;border-radius:10px;background:#15133a;display:grid;place-items:center;overflow:hidden;font-size:40px;color:var(--line)}
.tc-img img{width:100%;height:100%;object-fit:cover}
.tc-card h3{font-size:17px;margin:10px 0 2px}.tc-card .sub{color:var(--mute);font-size:13px}
.tc-price{font:700 22px 'Bricolage Grotesque',sans-serif;margin:8px 0 2px}
.tc-lim{font-size:13px;color:var(--mute);margin-bottom:10px}.tc-lim b{color:var(--gold)}
.tc-step{display:flex;align-items:center;justify-content:space-between;background:#15133a;border-radius:12px;padding:4px}
.tc-step button{width:38px;height:38px;border-radius:9px;border:0;background:var(--panel2);color:var(--text);font-size:20px}
.tc-step button:disabled{opacity:.35;cursor:not-allowed}.tc-step b{min-width:30px;text-align:center}
.tc-off{opacity:.55}
.tc-drawer-bg{position:fixed;inset:0;background:#0008;z-index:40;animation:fade .2s}
.tc-drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--panel);border-left:1px solid var(--line);z-index:41;padding:20px;display:flex;flex-direction:column;animation:slide .3s cubic-bezier(.2,.9,.3,1)}
@keyframes slide{from{transform:translateX(100%)}}
.tc-lines{flex:1;overflow:auto;margin:14px 0}
.tc-line{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.tc-total{display:flex;justify-content:space-between;font:700 20px 'Bricolage Grotesque',sans-serif;margin-bottom:12px}
@media (max-width:560px){.tc-2{grid-template-columns:1fr}.tc-grid{grid-template-columns:repeat(2,1fr);gap:12px}.tc-card{padding:8px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
if (!$("#tc-style")) { const s = document.createElement("style"); s.id = "tc-style"; s.textContent = CSS; document.head.appendChild(s); }

/* =====================================================================
   5. Carga de dados
   ===================================================================== */
async function loadAdmin() {
  const [p, c, s] = await Promise.all([
    fj(API.products).catch(() => []), fj(API.clients).catch(() => []), fj(API.settings).catch(() => []),
  ]);
  S.produtos = list(p); S.clientes = list(c); S.config = (s && s.configuracoes) || list(s);
  render();
}
async function loadCotas() {
  S.cotas = {};
  if (!S.cotaCliente) return render();
  const d = list(await fj(API.quotas + "?cliente_id=" + encodeURIComponent(S.cotaCliente)).catch(() => []));
  d.forEach((x) => { S.cotas[x.produto_id] = x.quantidade; });
  render();
}
async function loadCatalog() {
  const d = await fj(API.catalog);
  S.catalogo = list(d);
  if (d && d.cliente) S.cliente = d.cliente; else if (!S.cliente) S.cliente = { [F.c.nome]: "" };
  S.vendedor = (d && d.whatsapp_vendedor) || "";
}

/* =====================================================================
   6. Telas
   ===================================================================== */
const ativoTag = (a) => a ? "<span class='tc-tag ok'>ativo</span>" : "<span class='tc-tag off'>inativo</span>";
const sw = (on, act, id) => `<button class="tc-sw ${on ? "on" : ""}" data-act="${act}" data-id="${esc(id)}" aria-label="ativar ou desativar"></button>`;

function viewAdminLogin() {
  return `<div class="tc-login"><div class="tc-panel"><h1>Painel</h1><p>Entre para gerenciar produtos, clientes e cotas.</p>
  <label class="tc-lab" for="u">Usuário</label><input class="tc-in" id="u" autocomplete="username">
  <label class="tc-lab" for="p">Senha</label><input class="tc-in" id="p" type="password" autocomplete="current-password">
  <p class="tc-err" id="err"></p><button class="tc-btn" style="width:100%" data-act="login">Entrar</button></div></div>`;
}

function viewAdmin() {
  const tabs = { produtos: "Produtos", clientes: "Clientes", cotas: "Cotas", importar: "Importar produtos", config: "Configurações" };
  const body = { produtos: tProdutos, clientes: tClientes, cotas: tCotas, importar: tImportar, config: tConfig }[S.tab]();
  return `<div class="tc-top"><h2>Catálogo</h2><button class="tc-btn ghost sm" data-act="logout">Sair</button></div>
  <div class="tc-tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${S.tab === k ? "on" : ""}" data-act="tab" data-id="${k}">${v}</button>`).join("")}</div>
  <div class="tc-main"><div class="tc-body">${body}</div></div>${modalHtml()}`;
}

function tProdutos() {
  const q = S.q.toLowerCase();
  const rows = S.produtos.filter((p) => (p[F.p.nome] + " " + p[F.p.codigo]).toLowerCase().includes(q));
  return `<div class="tc-bar"><input class="tc-in" placeholder="Buscar por nome ou código" data-bind="q" value="${esc(S.q)}"><button class="tc-btn" data-act="newP">Novo produto</button></div>` +
    (rows.length ? rows.map((p) => `<div class="tc-row">
      ${p[F.p.img] ? `<img class="tc-th" src="${esc(p[F.p.img])}" alt="">` : `<div class="tc-th">✦</div>`}
      <div><b>${esc(p[F.p.nome])}</b><small>${esc(p[F.p.codigo])} </small><span class="tc-tag">${esc(p[F.p.categoria] || "sem categoria")}</span><span class="tc-tag">${esc(p[F.p.status] || "DISPONÍVEL")}</span><small>${brl(num(p[F.p.preco]))}</small></div>
      <div class="tc-act">${sw(p[F.p.ativo], "togP", p[F.p.id])}<button class="tc-btn ghost sm" data-act="editP" data-id="${esc(p[F.p.id])}">Editar</button></div></div>`).join("")
      : `<div class="tc-empty">Nenhum produto ainda. Clique em "Novo produto" ou use a aba Importar.</div>`);
}

function tClientes() {
  const q = S.q.toLowerCase();
  const rows = S.clientes.filter((c) => (c[F.c.nome] + " " + c[F.c.cnpj]).toLowerCase().includes(q));
  return `<div class="tc-bar"><input class="tc-in" placeholder="Buscar por nome ou CNPJ" data-bind="q" value="${esc(S.q)}"><button class="tc-btn" data-act="newC">Novo cliente</button></div>` +
    (rows.length ? rows.map((c) => `<div class="tc-row cli"><div><b>${esc(c[F.c.nome])}</b><small>${esc(maskCnpj(c[F.c.cnpj]))} </small><span class="tc-tag">${esc(c.tipos_loja?.nome || "sem tipo")}</span><span class="tc-tag">desconto ${esc(c[F.c.desc] || 0)}%</span></div>
      <div class="tc-act">${sw(c[F.c.ativo], "togC", c[F.c.id])}<button class="tc-btn ghost sm" data-act="editC" data-id="${esc(c[F.c.id])}">Editar</button></div></div>`).join("")
      : `<div class="tc-empty">Nenhum cliente cadastrado ainda.</div>`);
}

function tCotas() {
  const opts = `<option value="">Escolha um cliente</option>` + S.clientes.map((c) => `<option value="${esc(c[F.c.id])}" ${String(c[F.c.id]) === String(S.cotaCliente) ? "selected" : ""}>${esc(c[F.c.nome])}</option>`).join("");
  const lista = S.cotaCliente ? S.produtos.map((p) => `<div class="tc-quota"><div><b>${esc(p[F.p.nome])}</b><small> ${esc(p[F.p.codigo])}</small></div>
    <input class="tc-in" type="number" min="0" placeholder="sem limite" data-quota="${esc(p[F.p.id])}" value="${esc(S.cotas[p[F.p.id]] ?? "")}"></div>`).join("") : `<div class="tc-empty">Escolha um cliente para definir quanto ele pode comprar de cada produto. O valor salva ao sair do campo. Campo vazio = sem limite, 0 = bloqueado.</div>`;
  return `<div class="tc-bar"><select class="tc-sel" style="max-width:340px" data-bind="cotaCliente">${opts}</select></div>${lista}`;
}

function tImportar() {
  const r = S.imp.rows;
  const cols = r[0] ? Object.keys(r[0]).slice(0, 6) : [];
  return `<div class="tc-drop"><p>Envie uma planilha .xlsx ou .csv. Produtos com o mesmo código são atualizados.</p><input type="file" accept=".xlsx,.xls,.csv" data-import></div>` +
    (r.length ? `<p style="margin-top:14px"><b>${esc(S.imp.nome)}</b> tem ${r.length} linhas. Prévia das primeiras:</p>
    <div style="overflow:auto"><table class="tc-prev"><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${r.slice(0, 5).map((x) => `<tr>${cols.map((c) => `<td>${esc(x[c])}</td>`).join("")}</tr>`).join("")}</table></div>
    <div class="tc-foot"><button class="tc-btn" data-act="importGo">Importar ${r.length} linhas</button></div>` : "");
}

function tConfig() {
  const rows = S.config.map((c, i) => `<div class="tc-2" style="margin-bottom:8px"><input class="tc-in" data-cfg="${i}" data-f="chave" value="${esc(c.chave ?? "")}" placeholder="Nome"><input class="tc-in" data-cfg="${i}" data-f="valor" value="${esc(c.valor ?? "")}" placeholder="Valor"></div>`).join("");
  return `<p style="color:var(--mute);margin-top:0">Descontos por tipo de loja, WhatsApp do vendedor e outros ajustes.</p>${rows || `<div class="tc-empty">Nenhuma configuração ainda.</div>`}
  <div class="tc-foot"><button class="tc-btn ghost" data-act="addCfg">Adicionar linha</button><button class="tc-btn" data-act="saveCfg">Salvar configurações</button></div>`;
}

function modalHtml() {
  const m = S.modal; if (!m) return "";
  const d = m.data || {};
  let inner = "";
  if (m.type === "p") {
    const p = F.p;
    inner = `<h3>${d[p.id] ? "Editar produto" : "Novo produto"}</h3>
    <div class="tc-2"><div><label class="tc-lab">Código</label><input class="tc-in" name="codigo" value="${esc(d[p.codigo] ?? "")}"></div><div><label class="tc-lab">Categoria</label><input class="tc-in" name="categoria" value="${esc(d[p.categoria] ?? "")}"></div></div>
    <label class="tc-lab">Nome</label><input class="tc-in" name="nome" value="${esc(d[p.nome] ?? "")}">
    <div class="tc-2"><div><label class="tc-lab">Caixa master (unidades)</label><input class="tc-in" name="caixa" type="number" value="${esc(d[p.caixa] ?? "")}"></div><div><label class="tc-lab">Preço da caixa master</label><input class="tc-in" name="preco" value="${esc(d[p.preco] ?? "")}"></div></div>
    <div class="tc-2"><div><label class="tc-lab">PDV sugerido</label><input class="tc-in" name="pdv" value="${esc(d[p.pdv] ?? "")}"></div><div><label class="tc-lab">Status</label><select class="tc-sel" name="status">${STATUS.map((s) => `<option ${(d[p.status] || STATUS[0]) === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
    <label class="tc-lab">Imagem (sugerido 600 x 600 px)</label><input class="tc-in" type="file" name="file" accept="image/*">
    <label class="tc-lab"><input type="checkbox" name="ativo" ${d[p.ativo] === false ? "" : "checked"}> Produto ativo</label>
    <div class="tc-foot"><button class="tc-btn ghost" data-act="closeM">Cancelar</button><button class="tc-btn" data-act="saveP">Salvar produto</button></div>`;
  } else {
    const c = F.c;
    inner = `<h3>${d[c.id] ? "Editar cliente" : "Novo cliente"}</h3>
    <label class="tc-lab">CNPJ</label><input class="tc-in" name="cnpj" value="${esc(maskCnpj(d[c.cnpj] ?? ""))}">
    <label class="tc-lab">Nome fantasia</label><input class="tc-in" name="nome" value="${esc(d[c.nome] ?? "")}">
    <div class="tc-2"><div><label class="tc-lab">Tipo de loja</label><select class="tc-sel" name="tipo"><option value="">Sem tipo</option>${TIPOS.map((t) => `<option value="${t.id}" ${Number(d[c.tipo]) === t.id ? "selected" : ""}>${t.nome}</option>`).join("")}</select></div>
    <div><label class="tc-lab">Desconto (%)</label><input class="tc-in" name="desc" type="number" min="0" max="100" value="${esc(d[c.desc] ?? 0)}"></div></div>
    <label class="tc-lab"><input type="checkbox" name="ativo" ${d[c.ativo] === false ? "" : "checked"}> Cliente ativo</label>
    <div class="tc-foot"><button class="tc-btn ghost" data-act="closeM">Cancelar</button><button class="tc-btn" data-act="saveC">Salvar cliente</button></div>`;
  }
  return `<div class="tc-modal-bg" data-act="closeBg"><div class="tc-modal" role="dialog" aria-modal="true">${inner}</div></div>`;
}

/* ---- área do cliente ---- */
function viewClienteLogin() {
  return `<div class="tc-login"><div class="tc-panel"><h1>Sua loja</h1><p>Digite o CNPJ para ver o que está liberado para você.</p>
  <label class="tc-lab" for="cnpj">CNPJ</label><input class="tc-in" id="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off">
  <p class="tc-err" id="err"></p><button class="tc-btn" style="width:100%" data-act="cliLogin">Entrar na loja</button></div></div>`;
}

const price = (p) => num(p.preco_caixa_com_desconto || p.preco_unitario);
// restante = cota menos o que o cliente já pediu; sem cota = sem limite
const limite = (p) => (p.restante != null ? num(p.restante) : p.cota != null ? num(p.cota) : Infinity);
const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
const cartTotal = () => S.catalogo.reduce((a, p) => a + (S.cart[p[F.p.id]] || 0) * price(p), 0);

function cardHtml(p, i) {
  const id = p[F.p.id], q = S.cart[id] || 0, lim = limite(p);
  const off = lim <= 0 || p[F.p.status] === "A CONFIRMAR";
  return `<article class="tc-card ${off ? "tc-off" : ""}" style="--i:${i}">
    <div class="tc-img">${p[F.p.img] ? `<img src="${esc(p[F.p.img])}" alt="${esc(p[F.p.nome])}" loading="lazy">` : "✦"}</div>
    <h3>${esc(p[F.p.nome])}</h3><div class="sub">${esc(p[F.p.categoria] || "")}${p[F.p.caixa] ? ", caixa com " + p[F.p.caixa + " un." : ""}</div>
    <div class="tc-price">${brl(price(p))}<span style="font-size:13px;font-weight:400;color:var(--mute)"> por caixa</span></div>
    <div class="tc-lim">${p[F.p.status] === "A CONFIRMAR" ? "A confirmar" : lim <= 0 ? "Cota esgotada" : lim === Infinity ? "Sem limite de quantidade" : `Você ainda pode levar <b>${lim}</b>`}</div>
    <div class="tc-step"><button data-act="sub" data-id="${esc(id)}" ${q <= 0 ? "disabled" : ""} aria-label="menos">−</button><b>${q}</b><button data-act="add" data-id="${esc(id)}" ${off || q >= lim ? "disabled" : ""} aria-label="mais">+</button></div></article>`;
}

function viewLoja() {
  const n = cartCount();
  const lines = S.catalogo.filter((p) => S.cart[p[F.p.id]]).map((p) => `<div class="tc-line"><span>${S.cart[p[F.p.id]]} x ${esc(p[F.p.nome])}</span><b>${brl(S.cart[p[F.p.id]] * price(p))}</b></div>`).join("");
  return `<div class="tc-shop"><div class="tc-hello"><h2>Olá, ${esc(S.cliente?.[F.c.nome] || S.cliente?.nome || "bem-vindo")}</h2>
    <button class="tc-btn ghost sm" data-act="cliLogout">Sair</button>
    <button class="tc-btn tc-cartbtn" data-act="openCart">Meu pedido${n ? `<i>${n}</i>` : ""}</button></div>
    ${S.catalogo.length ? `<div class="tc-grid">${S.catalogo.map(cardHtml).join("")}</div>` : `<div class="tc-empty">Nenhum produto liberado para você por enquanto. Fale com o vendedor.</div>`}</div>
    ${S.cartOpen ? `<div class="tc-drawer-bg" data-act="closeCart"></div><aside class="tc-drawer"><h3>Meu pedido</h3>
      <div class="tc-lines">${lines || `<div class="tc-empty">Seu pedido está vazio. Use o + nos produtos.</div>`}</div>
      <div class="tc-total"><span>Total</span><span>${brl(cartTotal())}</span></div>
      <button class="tc-btn" data-act="finish" ${n ? "" : "disabled"}>Finalizar pelo WhatsApp</button>
      <button class="tc-btn ghost" style="margin-top:8px" data-act="closeCart">Continuar escolhendo</button></aside>` : ""}`;
}

/* =====================================================================
   7. Render
   ===================================================================== */
const doneHtml = () => `<div class="tc-modal-bg" data-act="closeDone"><div class="tc-modal" role="dialog" aria-modal="true" style="text-align:center"><h3>Pedido #${esc(S.done.id)} registrado</h3><p style="color:var(--mute)">${S.done.url ? "Agora envie o resumo para o vendedor combinar entrega e pagamento." : "O WhatsApp do vendedor ainda não foi configurado. Avise o vendedor sobre o pedido."}</p><div class="tc-foot" style="justify-content:center">${S.done.url ? `<a class="tc-btn" href="${esc(S.done.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir WhatsApp</a>` : ""}<button class="tc-btn ghost" data-act="closeDone">Fechar</button></div></div></div>`;

function render() {
  const f = document.activeElement, key = f && f.dataset && f.dataset.bind, pos = f && f.selectionStart;
  let html;
  if (S.area === "admin") html = S.admin ? viewAdmin() : viewAdminLogin();
  else html = (S.cliente ? viewLoja() : viewClienteLogin()) + (S.done ? doneHtml() : "");
  $("#app").innerHTML = html;
  if (key) { const el = $(`[data-bind="${key}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
}

/* =====================================================================
   8. Ações
   ===================================================================== */
const readModal = () => Object.fromEntries([...document.querySelectorAll(".tc-modal [name]")].map((i) => [i.name, i.type === "checkbox" ? i.checked : i.value]));
const byId = (arr, k, id) => arr.find((x) => String(x[k]) === String(id));

const A = {
  async login() {
    const err = $("#err");
    try {
      await fj(API.adminAuth + "?action=login", { method: "POST", body: { user: $("#u").value, pass: $("#p").value } });
      S.admin = true; await loadAdmin();
    } catch (e) { err.textContent = e.message || "Não foi possível entrar."; }
  },
  async logout() { try { await fj(API.adminAuth + "?action=logout", { method: "POST" }); } catch {} S.admin = false; render(); },
  tab(el) { S.tab = el.dataset.id; S.q = ""; render(); },
  newP() { S.modal = { type: "p", data: {} }; render(); },
  editP(el) { S.modal = { type: "p", data: byId(S.produtos, F.p.id, el.dataset.id) }; render(); },
  newC() { S.modal = { type: "c", data: {} }; render(); },
  editC(el) { S.modal = { type: "c", data: byId(S.clientes, F.c.id, el.dataset.id) }; render(); },
  closeM() { S.modal = null; render(); },
  closeBg(el, e) { if (e.target === el) A.closeM(); },
  async saveP() {
    const v = readModal(), d = S.modal.data || {}, file = $(".tc-modal [name=file]").files[0];
    let img = d[F.p.img] || "";
    if (file) { const r = await fj(API.upload, { method: "POST", body: { file: await fileToJson(file) } }); img = (r && (r.url || r[F.p.img])) || img; }
    const body = { [F.p.codigo]: v.codigo.trim(), [F.p.nome]: v.nome.trim(), [F.p.categoria]: v.categoria.trim(), [F.p.caixa]: num(v.caixa), [F.p.preco]: num(v.preco), [F.p.pdv]: num(v.pdv), [F.p.status]: v.status, [F.p.ativo]: v.ativo, [F.p.img]: img };
    if (!body[F.p.nome]) return toast("Informe o nome do produto");
    if (d[F.p.id]) body[F.p.id] = d[F.p.id];
    await fj(API.products, { method: d[F.p.id] ? UPDATE_METHOD : "POST", body });
    S.modal = null; await loadAdmin(); toast("Produto salvo");
  },
  async saveC() {
    const v = readModal(), d = S.modal.data || {}, cnpj = digits(v.cnpj);
    if (cnpj.length !== 14) return toast("O CNPJ precisa ter 14 números");
    const body = { [F.c.cnpj]: cnpj, [F.c.nome]: v.nome.trim(), [F.c.tipo]: v.tipo ? Number(v.tipo) : null, [F.c.desc]: num(v.desc), [F.c.ativo]: v.ativo };
    if (d[F.c.id]) body[F.c.id] = d[F.c.id];
    await fj(API.clients, { method: d[F.c.id] ? UPDATE_METHOD : "POST", body });
    S.modal = null; await loadAdmin(); toast("Cliente salvo");
  },
  async togP(el) { const p = byId(S.produtos, F.p.id, el.dataset.id); await fj(API.products, { method: UPDATE_METHOD, body: { ...p, [F.p.ativo]: !p[F.p.ativo] } }); await loadAdmin(); },
  async togC(el) { const c = byId(S.clientes, F.c.id, el.dataset.id); await fj(API.clients, { method: UPDATE_METHOD, body: { [F.c.id]: c[F.c.id], [F.c.ativo]: !c[F.c.ativo] } }); await loadAdmin(); },
  async importGo() {
    const r = await fj(API.import, { method: "POST", body: { rows: S.imp.rows } });
    S.imp = { nome: "", rows: [] }; await loadAdmin();
    toast(r ? `Importação: ${r.criados} novos, ${r.atualizados} atualizados, ${r.erros} com erro` : "Importação concluída");
  },
  addCfg() { S.config.push({ chave: "", valor: "" }); render(); },
  async saveCfg() { await fj(API.settings, { method: UPDATE_METHOD, body: { configuracoes: S.config.filter((c) => c.chave) } }); toast("Configurações salvas"); },

  /* ---- cliente ---- */
  async cliLogin() {
    const err = $("#err"), cnpj = digits($("#cnpj").value);
    if (cnpj.length !== 14) { err.textContent = "O CNPJ precisa ter 14 números."; return; }
    try { const r = await fj(API.clientLogin, { method: "POST", body: { cnpj } }); S.cliente = (r && r.cliente) || null; await loadCatalog(); render(); }
    catch (e) { err.textContent = e.message || "CNPJ não encontrado ou desativado."; }
  },
  async cliLogout() {
    try { await fj(API.clientLogin, { method: "DELETE" }); } catch {}
    S.cliente = null; S.cart = {}; S.catalogo = []; S.cartOpen = false; render();
  },
  add(el) {
    const id = el.dataset.id, p = byId(S.catalogo, F.p.id, id), q = S.cart[id] || 0;
    if (q >= limite(p)) return toast("Você atingiu a cota deste produto");
    S.cart[id] = q + 1; render();
    const b = $(".tc-cartbtn"); if (b) { b.classList.add("bump"); setTimeout(() => b.classList.remove("bump"), 400); }
  },
  sub(el) { const id = el.dataset.id; S.cart[id] = Math.max(0, (S.cart[id] || 0) - 1); if (!S.cart[id]) delete S.cart[id]; render(); },
  openCart() { S.cartOpen = true; render(); },
  closeCart() { S.cartOpen = false; render(); },
  async finish() {
    const itens = Object.entries(S.cart).map(([id, quantidade]) => ({ produto_id: Number(id), quantidade }));
    const r = await fj(API.order, { method: "POST", body: { itens } });
    const c = S.cliente || {};
    const linhas = S.catalogo.filter((p) => S.cart[p[F.p.id]]).map((p) => `${S.cart[p[F.p.id]]} x ${p[F.p.nome]}`).join("\n");
    const txt = `Olá! Pedido #${r.pedido_id}\nCliente: ${c.nome_fantasia || ""}\nCNPJ: ${maskCnpj(c.cnpj)}\n\n${linhas}\n\nTotal: ${brl(cartTotal())}`;
    const fone = digits(S.vendedor);
    S.done = { id: r.pedido_id, url: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(txt)}` : "" };
    S.cart = {}; S.cartOpen = false;
    await loadCatalog().catch(() => {});
    render();
  },
  closeDone(el, e) { if (e.target === el || el.tagName === "BUTTON") { S.done = null; render(); } },
};

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || !A[el.dataset.act]) return;
  try { await A[el.dataset.act](el, e); } catch (err) { toast(err.message || "Algo deu errado"); }
});

document.addEventListener("input", async (e) => {
  const t = e.target;
  if (t.dataset.bind) {
    S[t.dataset.bind] = t.value;
    if (t.dataset.bind === "cotaCliente") return loadCotas();
    return render();
  }
  if (t.dataset.cfg !== undefined) S.config[t.dataset.cfg][t.dataset.f] = t.value;
  if (t.id === "cnpj") t.value = maskCnpj(t.value);
  if (t.name === "cnpj") t.value = maskCnpj(t.value);
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (t.name === "tipo") {
      const x = TIPOS.find((y) => y.id === Number(t.value)), dc = $(".tc-modal [name=desc]");
      if (x && dc) dc.value = x.desc;
    }
    if (t.dataset.quota) {
      if (t.value === "") {
        // campo vazio = volta a ser "sem limite" (remove a cota)
        await fj(API.quotas, { method: "DELETE", body: { cliente_id: S.cotaCliente, produto_id: t.dataset.quota } });
        delete S.cotas[t.dataset.quota];
        return toast("Cota removida: sem limite");
      }
      await fj(API.quotas, { method: UPDATE_METHOD, body: { cliente_id: S.cotaCliente, produto_id: t.dataset.quota, quantidade: num(t.value) } });
      S.cotas[t.dataset.quota] = num(t.value); toast("Cota salva");
    }
    if (t.dataset.import !== undefined && t.files[0]) {
      if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = () => no(new Error("Não consegui carregar o leitor de planilhas")); document.head.appendChild(s); });
      const wb = XLSX.read(await t.files[0].arrayBuffer());
      let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      // Detecta planilha COPAG (título na primeira coluna) e converte colunas __EMPTY
      const firstKey = Object.keys(rows[0] || {})[0];
      if (firstKey && firstKey.includes('COPAG')) {
        rows = rows.slice(4).map(r => {
          const keys = Object.keys(r);
          return {
            codigo: String(r[keys[0]] || '').trim(),
            nome: String(r[keys[1]] || '').trim(),
            categoria: 'Geral',
            caixa_master: parseCaixaMaster(String(r[keys[2]] || '')),
            preco_caixa_master: toFloat(r[keys[3]]),
            pdv_sugerido: toFloat(r[keys[12]]),
            status: 'DISPONÍVEL',
            ativo: true
          };
        }).filter(r => r.codigo);
      }
      S.imp = { nome: t.files[0].name, rows };
      render();
    }
  } catch (err) { toast(err.message || "Algo deu errado"); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (S.modal) A.closeM(); else if (S.cartOpen) A.closeCart(); }
  if (e.key === "Enter" && (e.target.id === "u" || e.target.id === "p")) A.login();
  if (e.key === "Enter" && e.target.id === "cnpj") A.cliLogin();
});

/* efeito de carta holográfica: a luz segue o mouse */
document.addEventListener("mousemove", (e) => {
  const c = e.target.closest && e.target.closest(".tc-card");
  if (!c || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  c.style.setProperty("--mx", x * 100 + "%"); c.style.setProperty("--my", y * 100 + "%");
  c.style.setProperty("--ry", (x - 0.5) * 12 + "deg"); c.style.setProperty("--rx", (0.5 - y) * 12 + "deg");
});
document.addEventListener("mouseout", (e) => {
  const c = e.target.closest && e.target.closest(".tc-card");
  if (c && !c.contains(e.relatedTarget)) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
});

/* =====================================================================
   9. Início: loja do cliente em "/", painel só em "/admin" (sem botão)
   ===================================================================== */
const isAdminRoute = () => location.pathname.replace(/\/+$/, "") === "/admin" || location.hash === "#admin";
async function boot() {
  S.area = isAdminRoute() ? "admin" : "cliente";
  if (S.area === "admin") {
    try { await fj(API.adminAuth + "?action=me"); S.admin = true; await loadAdmin(); } catch { S.admin = false; }
  } else {
    try { await loadCatalog(); } catch { S.cliente = null; }
  }
  render();
}
window.addEventListener("hashchange", boot);
boot();