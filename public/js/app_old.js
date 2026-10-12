const KEY="catalogo_v2",TYPES={"E-commerce":10,"Varejo":15,"Liga":20,"Clube":23,"Hobby Store":20,"Atacado":28};
const STS=["DISPONÍVEL","A CONFIRMAR","INDISPONÍVEL"],SC={"DISPONÍVEL":"DISP","A CONFIRMAR":"CONF","INDISPONÍVEL":"INDI"};
let db=JSON.parse(localStorage.getItem(KEY)||"null")||{seq:20,
 products:[{id:1,code:"91016",name:"Baralho 139 AS",cat:"Baralhos",cm:24,priceCm:190,pdv:25.99,status:"DISPONÍVEL",active:true},
  {id:2,code:"95886",name:"Baralho 1001 (Estojo com 2 Baralhos)",cat:"Baralhos",cm:4,priceCm:402.3,pdv:0,status:"A CONFIRMAR",active:false},
  {id:3,code:"PKM-001",name:"Box Pokémon Exemplo",cat:"Pokémon",cm:6,priceCm:900,pdv:199.9,status:"DISPONÍVEL",active:true}],
 clients:[{id:1,cnpj:"00.000.000/0001-00",name:"Loja Exemplo TCG",type:"Liga",discount:20,active:true},
  {id:2,cnpj:"11.111.111/0001-11",name:"Exemplo E-commerce",type:"E-commerce",discount:10,active:true}],
 quotas:{"1|1":20,"1|3":40}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){toast("Armazenamento cheio: use imagens menores")}};
let tmpImg="";
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const brl=n=>(+n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=v=>typeof v==="number"?v:(String(v).includes(",")?parseFloat(String(v).replace(/[R$\s.]/g,"").replace(",",".")):parseFloat(v))||0;
const nid=()=>db.seq++;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t.h);t.h=setTimeout(()=>t.classList.remove("show"),2200)}
let tab="produtos",editId=null,cotaC=null,catC=null;
const TABS={produtos:"Produtos",clientes:"Clientes",cotas:"Cotas",importar:"Importar produtos",catalogo:"Ver como cliente"};

function login(){if($("#u").value===CONFIG.user&&$("#p").value===CONFIG.pass){sessionStorage.ok=1;start()}else $("#err").textContent="Usuário ou senha incorretos."}
function start(){$("#login").classList.add("hide");$("#app").classList.remove("hide");render()}
if(sessionStorage.ok)start();
function render(){
 $("#tabs").innerHTML=Object.entries(TABS).map(([k,v])=>`<button class="${k==tab?"on":""}" onclick="tab='${k}';editId=null;render()">${v}</button>`).join("");
 $("#view").innerHTML=V[tab]();if(tab=="produtos")fillP();if(tab=="cotas")fillQ();if(tab=="catalogo")fillC();
}
const sw=(on,fn)=>`<label class="sw"><input type="checkbox" ${on?"checked":""} onchange="${fn}"><i></i></label>`;
const opts=(arr,sel)=>arr.map(a=>`<option ${a==sel?"selected":""}>${esc(a)}</option>`).join("");
const cliOpts=sel=>db.clients.map(c=>`<option value="${c.id}" ${c.id==sel?"selected":""}>${esc(c.name)}</option>`).join("");

const V={
produtos(){const cats=[...new Set(db.products.map(p=>p.cat))];return `
<div class="card"><form id="pf" class="grid" onsubmit="saveP(event)">
<label>Código<input name="code" required></label><label class="w2">Nome do produto<input name="name" required></label>
<label>Categoria<input name="cat" value="Geral"></label><label>Caixa master (un.)<input name="cm" type="number" min="1" value="1"></label>
<label>Preço caixa master<input name="priceCm" type="number" step="0.01" value="0"></label>
<label>PDV sugerido<input name="pdv" type="number" step="0.01" value="0"></label>
<label>Status<select name="status">${opts(STS)}</select></label>
<label class="w2">Imagem do produto (ideal 800×800 px)<input type="file" accept="image/*" onchange="pickImg(this)"></label><div class="prev" id="prev"></div>
<button class="btn" id="pbtn">Cadastrar produto</button></form></div>
<div class="bar"><input id="fq" placeholder="Buscar por código ou produto..." oninput="fillP()">
<select id="fc" onchange="fillP()"><option value="">Todas as categorias</option>${opts(cats)}</select>
<select id="fs" onchange="fillP()"><option value="">Todos os status</option>${opts(STS)}</select></div>
<div class="card scroll" style="padding:0"><table><thead><tr><th></th><th>CÓDIGO</th><th>PRODUTO</th><th>CATEGORIA</th><th>CM</th><th>PREÇO CM</th><th>STATUS</th><th>ATIVO</th><th></th></tr></thead><tbody id="pb"></tbody></table></div>`},

clientes(){return `
<div class="card"><form class="grid" onsubmit="saveCli(event)" style="grid-template-columns:1.2fr 2fr 1fr 90px auto">
<label>CNPJ<input name="cnpj" placeholder="00.000.000/0000-00" required></label><label>Nome fantasia<input name="name" required></label>
<label>Tipo de loja<select name="type" onchange="this.form.discount.value=TYPES[this.value]">${opts(Object.keys(TYPES))}</select></label>
<label>Desc. %<input name="discount" type="number" step="0.1" value="10"></label><button class="btn">Cadastrar cliente</button></form></div>
<div class="card scroll" style="padding:0"><table><thead><tr><th>CNPJ</th><th>NOME FANTASIA</th><th>TIPO</th><th>DESCONTO (%)</th><th>ATIVO</th><th></th></tr></thead><tbody>
${db.clients.map(c=>`<tr><td>${esc(c.cnpj)}</td><td>${esc(c.name)}</td><td>${esc(c.type)}</td>
<td><input type="number" step="0.1" value="${c.discount}" onchange="upd('clients',${c.id},'discount',+this.value)"></td>
<td>${sw(c.active,`upd('clients',${c.id},'active',this.checked)`)}</td><td><button class="lk d" onclick="del('clients',${c.id})">Excluir</button></td></tr>`).join("")}</tbody></table></div>`},

cotas(){cotaC=cotaC||(db.clients[0]||{}).id;return `<div class="card"><label>Cliente<select onchange="cotaC=+this.value;fillQ()">${cliOpts(cotaC)}</select></label>
<p class="mut">Cota em unidades por produto. Vazio = sem limite · 0 = produto bloqueado para este cliente.</p></div>
<div class="card scroll" style="padding:0"><table><thead><tr><th>CÓDIGO</th><th>PRODUTO</th><th>COTA (UN.)</th></tr></thead><tbody id="qb"></tbody></table></div>`},

importar(){return `<div class="card"><h2 style="margin-top:0">Importar produtos</h2>
<p class="mut">Aceita XLSX ou CSV com as colunas: codigo, nome, categoria, caixa_master, preco_caixa_master, pdv_sugerido, status. Produtos com código já existente são atualizados.</p>
<input type="file" accept=".xlsx,.xls,.csv" onchange="imp(this.files[0])"></div>`},

catalogo(){catC=catC||(db.clients[0]||{}).id;return `<div class="card"><label>Visualizar catálogo como<select onchange="catC=+this.value;fillC()">${cliOpts(catC)}</select></label>
<p class="mut" id="cinfo"></p></div><div class="card scroll" style="padding:0"><table><thead><tr><th>CÓDIGO</th><th>PRODUTO</th><th>CM</th><th>PREÇO CM</th><th>UNIDADE</th><th>PDV SUG.</th><th>COTA</th><th>QTD</th></tr></thead><tbody id="cb"></tbody></table></div>`}
};

function fillP(){
 const q=($("#fq")||{value:""}).value.toLowerCase(),c=$("#fc").value,s=$("#fs").value;
 $("#pb").innerHTML=db.products.filter(p=>(!q||(p.code+p.name).toLowerCase().includes(q))&&(!c||p.cat==c)&&(!s||p.status==s)).map(p=>`<tr>
 <td>${thumb(p)}</td><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.cat)}</td><td>${p.cm}</td><td>${brl(p.priceCm)}</td><td><span class="st ${SC[p.status]}">${p.status}</span></td>
 <td>${sw(p.active,`upd('products',${p.id},'active',this.checked)`)}</td>
 <td><button class="lk" onclick="editP(${p.id})">Editar</button><button class="lk d" onclick="del('products',${p.id})">Excluir</button></td></tr>`).join("")||`<tr><td colspan=9 class="mut">Nenhum produto.</td></tr>`}
function saveP(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
 const d={code:f.code.trim(),name:f.name,cat:f.cat||"Geral",cm:+f.cm||1,priceCm:+f.priceCm||0,pdv:+f.pdv||0,status:f.status};
 if(tmpImg)d.img=tmpImg;
 const ex=db.products.find(p=>p.id==editId)||db.products.find(p=>p.code==d.code);
 if(ex)Object.assign(ex,d);else db.products.push({id:nid(),active:true,...d});
 save();editId=null;tmpImg="";toast("Produto salvo");render()}
function editP(id){const p=db.products.find(x=>x.id==id),f=$("#pf");editId=id;
 for(const k of ["code","name","cat","cm","priceCm","pdv","status"])f[k].value=p[k];tmpImg="";$("#prev").innerHTML=p.img?`<img src="${p.img}">`:"";$("#pbtn").textContent="Salvar alterações";scrollTo({top:0,behavior:"smooth"})}
function saveCli(e){e.preventDefault();const f=Object.fromEntries(new FormData(e.target));
 db.clients.push({id:nid(),cnpj:f.cnpj,name:f.name,type:f.type,discount:+f.discount||0,active:true});save();toast("Cliente cadastrado");render()}
function upd(l,id,k,v){db[l].find(x=>x.id==id)[k]=v;save();if(tab=="produtos")fillP()}
function del(l,id){if(!confirm("Excluir?"))return;db[l]=db[l].filter(x=>x.id!=id);save();render()}

function fillQ(){$("#qb").innerHTML=db.products.map(p=>{const v=db.quotas[cotaC+"|"+p.id];
 return `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td><input type="number" min="0" value="${v??""}" placeholder="sem limite" onchange="setQ(${p.id},this.value)"></td></tr>`}).join("")}
function setQ(pid,v){const k=cotaC+"|"+pid;if(v==="")delete db.quotas[k];else db.quotas[k]=+v;save();toast("Cota atualizada")}

function fillC(){const c=db.clients.find(x=>x.id==catC);if(!c){$("#cb").innerHTML="";return}
 $("#cinfo").textContent=c.active?`${c.type} · desconto de ${c.discount}%`:"Cliente inativo: nenhum produto é exibido.";
 $("#cb").innerHTML=c.active?db.products.filter(p=>p.active&&p.status!="INDISPONÍVEL"&&db.quotas[c.id+"|"+p.id]!==0).map(p=>{
 const pr=p.priceCm*(1-c.discount/100),q=db.quotas[c.id+"|"+p.id];
 return `<tr><td>${esc(p.code)}</td><td>${thumb(p)} ${esc(p.name)}</td><td>${p.cm}</td><td><b>${brl(pr)}</b></td><td>${brl(pr/p.cm)}</td><td>${p.pdv?brl(p.pdv):"-"}</td>
 <td>${q??"sem limite"}</td><td><input type="number" min="0" oninput="chk(this,${q??-1})"><div class="warn"></div></td></tr>`}).join(""):""}
function chk(i,q){i.nextElementSibling.textContent=q>=0&&+i.value>q?`Máx. ${q} un.`:""}

function imp(file){if(!file)return;const r=new FileReader();r.onload=ev=>{
 const rows=XLSX.utils.sheet_to_json(XLSX.read(ev.target.result,{type:"array"}).Sheets[XLSX.read(ev.target.result,{type:"array"}).SheetNames[0]]);let a=0,u=0;
 rows.forEach(o=>{const k={};for(const x in o)k[x.toLowerCase().trim()]=o[x];if(!k.codigo||!k.nome)return;
  const st=String(k.status||"DISPONÍVEL").toUpperCase(),d={code:String(k.codigo),name:String(k.nome),cat:String(k.categoria||"Geral"),cm:num(k.caixa_master)||1,priceCm:num(k.preco_caixa_master),pdv:num(k.pdv_sugerido),status:STS.includes(st)?st:"A CONFIRMAR"};
  const ex=db.products.find(p=>p.code==d.code);if(ex){Object.assign(ex,d);u++}else{db.products.push({id:nid(),active:true,...d});a++}});
 save();toast(`${a} novo(s), ${u} atualizado(s)`)};r.readAsArrayBuffer(file)}

// ---- Imagem do produto: redimensiona para 800x800 (fundo branco) e guarda como JPEG ----
const IMG_SIZE=800;
const thumb=p=>p.img?`<img class="th" src="${p.img}" alt="">`:`<span class="th ph">🃏</span>`;
function pickImg(inp){const f=inp.files[0];if(!f)return;const im=new Image();
 im.onload=()=>{const c=document.createElement("canvas");c.width=c.height=IMG_SIZE;const x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,IMG_SIZE,IMG_SIZE);const k=Math.min(IMG_SIZE/im.width,IMG_SIZE/im.height);
  x.drawImage(im,(IMG_SIZE-im.width*k)/2,(IMG_SIZE-im.height*k)/2,im.width*k,im.height*k);
  tmpImg=c.toDataURL("image/jpeg",.82);$("#prev").innerHTML=`<img src="${tmpImg}">`};
 im.src=URL.createObjectURL(f)}
