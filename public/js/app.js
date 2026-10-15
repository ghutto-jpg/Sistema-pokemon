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
  c: { id: "id", cnpj: "cnpj", nome: "nome_fantasia", tipo: "tipo_loja_id", desc: "desconto", prazo: "prazo_pagamento", ativo: "ativo" },
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

// Converte "24 Dúzias" ? 288, "1 dúzia" ? 12, "03 Dúzias" ? 36
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
  area: "cliente", admin: false, tab: "produtos", q: "", modal: null, cat: "", erroPedido: null,
  produtos: [], clientes: [], config: [], cotas: {}, cotaTipoLoja: "", imp: { nome: "", rows: [], file: "" },
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
.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.tc-filterbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.tc-filterbar .tc-in{flex:1;min-width:200px;max-width:none}
.tc-chips{display:flex;gap:6px;flex-wrap:wrap}
.tc-chip{background:#15133a;border:1px solid var(--line);color:var(--text);border-radius:99px;padding:7px 14px;font-size:13px;cursor:pointer;transition:.15s;white-space:nowrap}
.tc-chip:hover{border-color:var(--gold);color:var(--gold)}
.tc-chip.on{background:var(--gold);color:#2a2200;border-color:var(--gold)}
.tc-card{position:relative;background:var(--panel);border:3px solid var(--gold);border-radius:18px;padding:12px;transition:box-shadow .2s,transform .1s;overflow:hidden;animation:deal .5s backwards;animation-delay:calc(var(--i)*40ms)}
@keyframes deal{from{opacity:0;transform:translateY(30px) rotate(3deg)}}
.tc-card:hover{box-shadow:0 12px 30px #0008;transform:translateY(-2px)}
.tc-img{aspect-ratio:1/1;border-radius:10px;background:#15133a;display:grid;place-items:center;overflow:hidden;font-size:40px;color:var(--line)}
.tc-img img{width:100%;height:100%;object-fit:cover}
.tc-card h3{font-size:17px;margin:10px 0 2px}.tc-card .sub{color:var(--mute);font-size:13px}
 .tc-price{font:700 22px 'Bricolage Grotesque',sans-serif;margin:8px 0 2px}
 .tc-pvdsug{font-size:12px;color:#000;font-weight:700;background:#FFD93D;padding:2px 8px;border-radius:6px;display:inline-block;margin-top:4px}
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
@media (max-width:560px){.tc-2{grid-template-columns:1fr}.tc-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;perspective:none}.tc-card{padding:8px;border:2px solid var(--gold);border-radius:12px}.tc-shop{padding:14px}.tc-top{padding:14px 16px}.tc-main{padding:0 16px 40px}.tc-price{font-size:18px}.tc-hello h2{font-size:clamp(20px,5vw,28px)}.tc-step button{width:32px;height:32px;border-radius:8px;font-size:18px}.tc-step b{min-width:24px}.tc-cartbtn i{font-size:11px;min-width:20px;height:20px}}
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
  if (!S.cotaTipoLoja) return render();
  const d = list(await fj(API.quotas + "?tipo_loja_id=" + encodeURIComponent(S.cotaTipoLoja)).catch(() => []));
  d.forEach((x) => { S.cotas[x.produto_id] = x; });
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
      ${p[F.p.img] ? `<img class="tc-th" src="${esc(p[F.p.img])}" alt="">` : `<div class="tc-th">?</div>`}
      <div><b>${esc(p[F.p.nome])}</b><small>${esc(p[F.p.codigo])} </small><span class="tc-tag">${esc(p[F.p.categoria] || "sem categoria")}</span><span class="tc-tag">${esc(p[F.p.status] || "DISPONÍVEL")}</span><small>${brl(num(p[F.p.preco]))}</small></div>
      <div class="tc-act">${sw(p[F.p.ativo], "togP", p[F.p.id])}<button class="tc-btn ghost sm" data-act="editP" data-id="${esc(p[F.p.id])}">Editar</button><button class="tc-btn danger sm" data-act="confirmDelP" data-id="${esc(p[F.p.id])}">Excluir</button></div></div>`).join("")
      : `<div class="tc-empty">Nenhum produto ainda. Clique em "Novo produto" ou use a aba Importar.</div>`);
}

function tClientes() {
  const q = S.q.toLowerCase();
  const rows = S.clientes.filter((c) => (c[F.c.nome] + " " + c[F.c.cnpj]).toLowerCase().includes(q));
  return `<div class="tc-bar"><input class="tc-in" placeholder="Buscar por nome ou CNPJ" data-bind="q" value="${esc(S.q)}"><button class="tc-btn" data-act="newC">Novo cliente</button></div>` +
    (rows.length ? rows.map((c) => `<div class="tc-row cli"><div><b>${esc(c[F.c.nome])}</b><small>${esc(maskCnpj(c[F.c.cnpj]))} </small><span class="tc-tag">${esc(c.tipos_loja?.nome || "sem tipo")}</span><span class="tc-tag">desconto ${esc(c[F.c.desc] || 0)}%</span></div>
      <div class="tc-act">${sw(c[F.c.ativo], "togC", c[F.c.id])}<button class="tc-btn ghost sm" data-act="editC" data-id="${esc(c[F.c.id])}">Editar</button><button class="tc-btn danger sm" data-act="confirmDelC" data-id="${esc(c[F.c.id])}" data-nome="${esc(c[F.c.nome])}">Excluir</button></div></div>`).join("")
      : `<div class="tc-empty">Nenhum cliente cadastrado ainda.</div>`);
}

function tCotas() {
  const opts = `<option value="">Escolha um tipo de loja</option>` + TIPOS.map((t) => `<option value="${t.id}" ${Number(t.id) === Number(S.cotaTipoLoja) ? "selected" : ""}>${esc(t.nome)}</option>`).join("");
  const lista = S.cotaTipoLoja ? S.produtos.map((p) => {
    const pid = p[F.p.id];
    const c = S.cotas[pid];
    const tem = c && c.quantidade != null;
    const total = tem ? c.quantidade : null;
    const usado = tem ? c.usado : 0;
    const restante = tem ? c.restante : null;
    return `<div class="tc-quota"><div><b>${esc(p[F.p.nome])}</b><small> ${esc(p[F.p.codigo])}</small>${tem ? ` <span style="color:var(--mute);font-size:12px">Cota total: ${total} | Usado: ${usado} | Restam: ${restante} caixas</span>` : '<span style="color:var(--hot);font-size:12px"> Sem cota definida (sem limite)</span>'}</div>
       <input class="tc-in" type="number" min="0" placeholder="sem limite" data-quota="${esc(pid)}" value="${tem ? esc(total) : ""}" title="Digite a COTA TOTAL (caixas permitidas por cliente desse tipo). Vazio = sem limite, 0 = bloqueado.">
    </div>`;
   }).join("") : `<div class="tc-empty">Escolha um tipo de loja para definir a cota por produto. O campo é a COTA TOTAL de caixas que cada cliente desse tipo pode comprar (vitalício, sem prazo): vazio = sem limite, 0 = bloqueado.</div>`;
  return `<div class="tc-bar"><select class="tc-sel" style="max-width:340px" data-bind="cotaTipoLoja">${opts}</select>${S.cotaTipoLoja ? `<button class="tc-btn danger sm" data-act="clearQuotas" style="margin-left:auto">Limpar cotas</button>` : ""}</div>${lista}`;
}

function tImportar() {
  const hasFile = !!S.imp.file;
  const r = S.imp.rows;
  const cols = r[0] ? Object.keys(r[0]).slice(0, 6) : [];
  let preview = '';
  if (r.length) {
    preview = `<p style="margin-top:14px"><b>${esc(S.imp.nome)}</b> tem ${r.length} linhas. Prévia das primeiras:</p>
    <div style="overflow:auto"><table class="tc-prev"><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${r.slice(0, 5).map((x) => `<tr>${cols.map((c) => `<td>${esc(x[c])}</td>`).join("")}</tr>`).join("")}</table></div>`;
  } else if (hasFile) {
    preview = `<p style="margin-top:14px"><b>${esc(S.imp.nome)}</b> selecionado. O processamento será feito no servidor.</p>`;
  }
  return `<div class="tc-drop"><p>Envie uma planilha .xlsx ou .csv. Produtos com o mesmo código são atualizados.</p><input type="file" accept=".xlsx,.xls,.csv" data-import></div>` +
    (preview ? preview + `<div class="tc-foot"><button class="tc-btn" data-act="importGo">Importar</button></div>` : '');
}

function tConfig() {
  const rows = S.config.map((c, i) => `<div class="tc-2" style="margin-bottom:8px"><input class="tc-in" data-cfg="${i}" data-f="chave" value="${esc(c.chave ?? "")}" placeholder="chave (ex: whatsapp_vendedor)"><input class="tc-in" data-cfg="${i}" data-f="valor" value="${esc(c.valor ?? "")}" placeholder="Valor"></div>`).join("");
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
   } else if (m.type === "delP") {
    inner = `<h3>Excluir produto</h3>
    <p>Tem certeza que deseja excluir <b>${esc(d[F.p.nome])}</b> (${esc(d[F.p.codigo])})?</p>
    <p style="color:var(--mute);font-size:13px">Esta ação não pode ser desfeita.</p>
    <div class="tc-foot"><button class="tc-btn ghost" data-act="closeM">Cancelar</button><button class="tc-btn danger" data-act="delP" data-id="${esc(d[F.p.id])}">Sim, excluir</button></div>`;
  } else if (m.type === "delC") {
    inner = `<h3>Excluir cliente</h3>
    <p>Tem certeza que deseja excluir <b>${esc(d.nome)}</b> (${esc(d.cnpj)})?</p>
    <p style="color:var(--mute);font-size:13px">Esta ação não pode ser desfeita.</p>
    <div class="tc-foot"><button class="tc-btn ghost" data-act="closeM">Cancelar</button><button class="tc-btn danger" data-act="delC" data-id="${esc(d.id)}">Sim, excluir</button></div>`;
  } else if (m.type === "clearQuotas") {
      const tipoLojaNome = esc(m.tipo_loja_nome || "");
    inner = `<h3>Limpar cotas</h3>
      <p>Tem certeza que quer limpar <b>todas as cotas</b> do tipo de loja <b>${tipoLojaNome}</b>?</p>
    <p style="color:var(--mute);font-size:13px">Esta ação removerá todas as cotas. Não pode ser desfeita.</p>
     <div class="tc-foot"><button class="tc-btn ghost" data-act="closeM">Cancelar</button><button class="tc-btn danger" data-act="confirmClearQuotas" data-id="${esc(m.tipo_loja_id)}">Sim, limpar</button></div>`;
  } else {
    const c = F.c;
    inner = `<h3>${d[c.id] ? "Editar cliente" : "Novo cliente"}</h3>
    <label class="tc-lab">CNPJ</label><input class="tc-in" name="cnpj" value="${esc(maskCnpj(d[c.cnpj] ?? ""))}">
    <label class="tc-lab">Nome fantasia</label><input class="tc-in" name="nome" value="${esc(d[c.nome] ?? "")}">
    <div class="tc-2"><div><label class="tc-lab">Tipo de loja</label><select class="tc-sel" name="tipo"><option value="">Sem tipo</option>${TIPOS.map((t) => `<option value="${t.id}" ${Number(d[c.tipo]) === t.id ? "selected" : ""}>${t.nome}</option>`).join("")}</select></div>
    <div><label class="tc-lab">Desconto (%)</label><input class="tc-in" name="desc" type="number" min="0" max="100" value="${esc(d[c.desc] ?? 0)}"></div></div>
    <label class="tc-lab">Prazo de pagamento</label><input class="tc-in" name="prazo_pagamento" value="${esc(d[c.prazo] ?? "")}" placeholder="Ex: 30 dias, à vista, 15/30/45">
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

const price = (p) => num(p.preco_unitario);
const priceBox = (p) => num(p.preco_caixa_com_desconto);
const boxSize = (p) => num(p[F.p.caixa]) || 1;
const limite = (p) => (p.restante != null ? num(p.restante) : Infinity);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const cartCount = () => Object.values(S.cart).reduce((a, q) => a + q, 0);
const cartTotal = () => S.catalogo.reduce((a, p) => a + (S.cart[p[F.p.id]] || 0) * priceBox(p), 0);

function cardHtml(p, i) {
  const id = p[F.p.id], q = S.cart[id] || 0, lim = limite(p);
  const off = lim <= 0 || p[F.p.status] === "A CONFIRMAR";
  let quotaInfo = "";
  if (p[F.p.status] === "A CONFIRMAR") quotaInfo = "A confirmar";
  else if (lim <= 0) quotaInfo = "Cota esgotada";
  else if (lim === Infinity) quotaInfo = "Sem limite de quantidade";
  else {
    const total = p.cota != null ? p.cota : "?";
    const usado = p.usado != null ? p.usado : 0;
    quotaInfo = `Cota: ${total} caixas | Usado: ${usado} | Restam: <b>${lim}</b>`;
  }
  return `<article class="tc-card ${off ? "tc-off" : ""}" style="--i:${i}">
    <div class="tc-img">${p[F.p.img] ? `<img src="${esc(p[F.p.img])}" alt="${esc(p[F.p.nome])}" loading="lazy">` : "?"}</div>
    <h3>${esc(p[F.p.nome])}</h3>
    <div class="sub">${esc(p[F.p.categoria] || "")}${p[F.p.caixa] ? ", caixa com " + p[F.p.caixa] + " un." : ""}</div>
    <div class="tc-price">${brl(priceBox(p))}<span style="font-size:13px;font-weight:400;color:var(--mute)"> a caixa</span></div>
    ${p[F.p.pdv] ? `<div class="tc-pvdsug">Preço sugerido R$ ${brl(num(p[F.p.pdv]))}/un</div>` : ""}
    <div class="tc-lim">${quotaInfo}</div>
    <div class="tc-step"><button data-act="sub" data-id="${esc(id)}" ${q <= 0 ? "disabled" : ""} aria-label="menos">-</button><b>${q}</b><button data-act="add" data-id="${esc(id)}" ${off || q + 1 > lim ? "disabled" : ""} aria-label="mais">+</button></div></article>`;
}

function viewLoja() {
  const n = cartCount();
  const lines = S.catalogo.filter((p) => S.cart[p[F.p.id]]).map((p) => { const c = S.cart[p[F.p.id]]; return `<div class="tc-line"><span>${c} x ${esc(p[F.p.nome])}</span><b>${brl(c * priceBox(p))}</b></div>`; }).join("");
  const countByCat = {};
  S.catalogo.forEach((p) => {
    const cat = norm(p[F.p.categoria]);
    if (cat) countByCat[cat] = (countByCat[cat] || 0) + 1;
  });
  const chips = [
    { label: "Todas", key: "", count: S.catalogo.length },
    { label: "Baralho", key: "baralho", count: countByCat["baralho"] || 0 },
    { label: "Pokémon", key: "pokemon", count: countByCat["pokemon"] || 0 },
    { label: "Jogos", key: "jogos", count: countByCat["jogos"] || 0 },
    { label: "Lorcana", key: "lorcana", count: countByCat["lorcana"] || 0 },
  ];
  const shown = S.catalogo.filter((p) => {
    const qn = norm(S.q);
    const cat = norm(p[F.p.categoria]);
    const matchQ = !qn || norm(p[F.p.nome] + " " + p[F.p.codigo]).includes(qn);
    const matchC = !S.cat || cat.includes(norm(S.cat));
    return matchQ && matchC;
  });
  return `<div class="tc-shop"><div class="tc-hello"><h2>Olá, ${esc(S.cliente?.[F.c.nome] || S.cliente?.nome || "bem-vindo")}</h2>
    <button class="tc-btn ghost sm" data-act="cliLogout">Sair</button>
    <button class="tc-btn tc-cartbtn" data-act="openCart">Meu pedido${n ? `<i>${n}</i>` : ""}</button></div>
    <div class="tc-filterbar"><input class="tc-in" placeholder="?? Buscar produto por nome ou código" data-bind="q" value="${esc(S.q)}">
      <div class="tc-chips">${chips.map((c) => `<span class="tc-chip ${S.cat === c.key ? "on" : ""}" data-act="setCat" data-id="${esc(c.key)}">${esc(c.label)}${c.count ? ` (${c.count})` : ""}</span>`).join("")}</div></div>
    ${shown.length ? `<div class="tc-grid">${shown.map(cardHtml).join("")}</div>` : `<div class="tc-empty">Nenhum produto encontrado para os filtros selecionados.</div>`}</div>
    ${S.cartOpen ? `<div class="tc-drawer-bg" data-act="closeCart"></div><aside class="tc-drawer"><h3>Meu pedido</h3>
      <div class="tc-lines">${lines || `<div class="tc-empty">Seu pedido está vazio. Use o + nos produtos.</div>`}</div>
      <div class="tc-total"><span>Total</span><span>${brl(cartTotal())}</span></div>
      <button class="tc-btn" data-act="finish" ${n ? "" : "disabled"}>Finalizar pelo WhatsApp</button>
      <button class="tc-btn ghost" data-act="clearCart" style="margin-top:8px">Limpar carrinho</button>
      <button class="tc-btn ghost" style="margin-top:8px" data-act="closeCart">Continuar escolhendo</button></aside>` : ""}`;
}

/* =====================================================================
   7. Render
   ===================================================================== */
const doneHtml = () => `<div class="tc-modal-bg" data-act="closeDone"><div class="tc-modal" role="dialog" aria-modal="true" style="text-align:center"><h3>Pedido #${esc(S.done.id)} registrado</h3><p style="color:var(--mute)">${S.done.url ? "Agora envie o resumo para o vendedor combinar entrega e pagamento." : "O WhatsApp do vendedor ainda não foi configurado. Avise o vendedor sobre o pedido."}</p><div class="tc-foot" style="justify-content:center">${S.done.url ? `<a class="tc-btn" href="${esc(S.done.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir WhatsApp</a>` : ""}<button class="tc-btn ghost" data-act="closeDone">Fechar</button></div></div></div>`;

const erroPedidoHtml = () => `<div class="tc-modal-bg" data-act="closeErroPedido"><div class="tc-modal" role="dialog" aria-modal="true" style="text-align:center"><h3 style="color:var(--hot)">Produto sem estoque suficiente</h3><p style="color:var(--mute);margin-bottom:16px">${esc(S.erroPedido)}</p><div class="tc-foot" style="justify-content:center"><button class="tc-btn ghost" data-act="closeErroPedido">Entendi</button></div></div></div>`;

function render() {
  const f = document.activeElement, key = f && f.dataset && f.dataset.bind, pos = f && f.selectionStart;
  let html;
  if (S.area === "admin") html = S.admin ? viewAdmin() : viewAdminLogin();
  else html = (S.cliente ? viewLoja() : viewClienteLogin()) + (S.done ? doneHtml() : "") + (S.erroPedido ? erroPedidoHtml() : "");
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
  setCat(el) { S.cat = el.dataset.id; render(); },
  newP() { S.modal = { type: "p", data: {} }; render(); },
  editP(el) { S.modal = { type: "p", data: byId(S.produtos, F.p.id, el.dataset.id) }; render(); },
  confirmDelP(el) { const p = byId(S.produtos, F.p.id, el.dataset.id); S.modal = { type: "delP", data: p }; render(); },
  async delP(el) {
    console.log("delP called with:", el.dataset.id);
    try {
      await fj(API.products, { method: "DELETE", body: { [F.p.id]: el.dataset.id } });
      S.modal = null; await loadAdmin(); toast("Produto excluído");
    } catch (err) {
      console.error("Delete failed:", err);
      toast(err.message || "Erro ao excluir");
    }
  },
  async confirmDelC(el) {
    const c = byId(S.clientes, F.c.id, el.dataset.id);
    S.modal = { type: "delC", data: { id: c[F.c.id], nome: c[F.c.nome], cnpj: c[F.c.cnpj] } };
    render();
  },
  async delC(el) {
    const id = el.dataset.id;
    try {
      await fj(API.clients, { method: "DELETE", body: { id } });
      S.modal = null; await loadAdmin(); toast("Cliente excluído");
    } catch (err) {
      console.error("Delete client failed:", err);
      toast(err.message || "Erro ao excluir cliente");
    }
  },
  newC() { S.modal = { type: "c", data: {} }; render(); },
  editC(el) { S.modal = { type: "c", data: byId(S.clientes, F.c.id, el.dataset.id) }; render(); },
   closeM() { S.modal = null; render(); },
   closeBg(el, e) { if (e.target === el) A.closeM(); },
    clearQuotas() {
      const tipoLoja = TIPOS.find(t => Number(t.id) === Number(S.cotaTipoLoja));
      S.modal = { type: "clearQuotas", data: { tipo_loja_id: S.cotaTipoLoja, tipo_loja_nome: tipoLoja ? tipoLoja.nome : "" } };
      render();
    },
    async confirmClearQuotas(el) {
      const tipoLojaId = S.cotaTipoLoja || el.dataset.id;
      await fj(API.quotas + "?tipo_loja_id=" + encodeURIComponent(tipoLojaId) + "&all=true", { method: "DELETE" });
      S.modal = null; S.cotas = {}; await loadCotas(); toast("Todas as cotas limpas");
    },
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
    const body = { [F.c.cnpj]: cnpj, [F.c.nome]: v.nome.trim(), [F.c.tipo]: v.tipo ? Number(v.tipo) : null, [F.c.desc]: num(v.desc), [F.c.prazo]: v.prazo_pagamento?.trim() || null, [F.c.ativo]: v.ativo };
    if (d[F.c.id]) body[F.c.id] = d[F.c.id];
    await fj(API.clients, { method: d[F.c.id] ? UPDATE_METHOD : "POST", body });
    S.modal = null; await loadAdmin(); toast("Cliente salvo");
  },
  async togP(el) { const p = byId(S.produtos, F.p.id, el.dataset.id); await fj(API.products, { method: UPDATE_METHOD, body: { ...p, [F.p.ativo]: !p[F.p.ativo] } }); await loadAdmin(); },
  async togC(el) { const c = byId(S.clientes, F.c.id, el.dataset.id); await fj(API.clients, { method: UPDATE_METHOD, body: { [F.c.id]: c[F.c.id], [F.c.ativo]: !c[F.c.ativo] } }); await loadAdmin(); },
  async importGo() {
    const body = S.imp.file ? { file: S.imp.file } : { rows: S.imp.rows };
    const r = await fj(API.import, { method: "POST", body });
    S.imp = { nome: "", rows: [], file: "" }; await loadAdmin();
    const msg = r && r.ok ? `Importação: ${r.criados} novos, ${r.atualizados} atualizados, ${r.erros} com erro, ${r.categorias || 0} categorias` : (r?.error || "Importação concluída");
    toast(msg);
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
    if (q + 1 > limite(p)) return toast("Você atingiu a cota deste produto");
    S.cart[id] = q + 1; render();
    const b = $(".tc-cartbtn"); if (b) { b.classList.add("bump"); setTimeout(() => b.classList.remove("bump"), 400); }
  },
  sub(el) { const id = el.dataset.id, q = S.cart[id] || 0; S.cart[id] = Math.max(0, q - 1); if (!S.cart[id]) delete S.cart[id]; render(); },
  openCart() { S.cartOpen = true; render(); },
  closeCart() { S.cartOpen = false; render(); },
  clearCart() { S.cart = {}; S.cartOpen = false; render(); },
  closeErroPedido() { S.erroPedido = null; render(); },
async finish() {
    const itens = Object.entries(S.cart).map(([id, quantidade]) => ({ produto_id: Number(id), quantidade }));
    console.log('[finish] itens no carrinho:', itens);
    if (!itens.length) return toast("Seu carrinho está vazio");
    try {
      const r = await fj(API.order, { method: "POST", body: { itens } });
      const c = S.cliente || {};

      const linhas = S.catalogo.filter((p) => S.cart[p[F.p.id]]).map((p) => {
        const caixas = S.cart[p[F.p.id]];
        const valorCaixa = num(p.preco_caixa_com_desconto);
        const subtotal = caixas * valorCaixa;
        return `* ${p[F.p.codigo]} - ${p[F.p.nome]}\nCaixas Master: ${caixas}\nValor Caixa: ${brl(valorCaixa)}\nSubtotal: ${brl(subtotal)}`;
      }).join("\n\n");

      const txt = `NOVO PEDIDO\n\nCliente: ${c.nome_fantasia || ""}\nCNPJ: ${maskCnpj(c.cnpj)}${c.prazo_pagamento ? `\nPrazo: ${c.prazo_pagamento}` : ""}\n\n${linhas}\n\nTOTAL: ${brl(cartTotal())}\n\nPedido sujeito à confirmação de disponibilidade`;

      const fone = digits(S.vendedor);
      S.done = { id: r.pedido_id, url: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(txt)}` : "" };
      S.cart = {}; S.cartOpen = false;
      await loadCatalog().catch(() => {});
      render();
    } catch (err) {
      console.log('[finish] erro:', err);
      S.erroPedido = err.message || "Erro ao finalizar pedido";
      render();
    }
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
      if (t.dataset.bind === "cotaTipoLoja") return loadCotas();
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
      const pid = t.dataset.quota;
      if (t.value === "") {
        await fj(API.quotas + "?tipo_loja_id=" + encodeURIComponent(S.cotaTipoLoja) + "&produto_id=" + encodeURIComponent(pid), { method: "DELETE" });
        return toast("Cota removida: sem limite");
      }
      const quantidadeTotal = num(t.value);
      const r = await fj(API.quotas, { method: UPDATE_METHOD, body: { tipo_loja_id: S.cotaTipoLoja, produto_id: pid, quantidade: quantidadeTotal } });
      await loadCotas();
      return toast(`Cota salva: total ${quantidadeTotal} caixas`);
    }
    if (t.dataset.import !== undefined && t.files[0]) {
      const file = t.files[0];
      S.imp = { nome: file.name, rows: [], file: await new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => no(new Error("Não consegui ler a planilha"));
        r.readAsDataURL(file);
      })};
      render();
    }
  } catch (err) { toast(err.message || "Algo deu errado"); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (S.modal) A.closeM(); else if (S.cartOpen) A.closeCart(); else if (S.erroPedido) A.closeErroPedido(); }
  if (e.key === "Enter" && (e.target.id === "u" || e.target.id === "p")) A.login();
  if (e.key === "Enter" && e.target.id === "cnpj") A.cliLogin();
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



