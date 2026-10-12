import XLSX from 'xlsx';
import fs from 'fs';

const wb = XLSX.readFile('tabela_precos_copag_2026.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

function get(row, idx) {
  const keys = Object.keys(row);
  if (idx === 0) return row[keys[0]];
  const allKeys = Object.keys(row);
  return row[allKeys[idx]] !== undefined ? row[allKeys[idx]] : '';
}

function toFloat(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace('R$', '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function parseCaixaMaster(v) {
  if (!v) return 1;
  const s = String(v).toLowerCase().replace(/dúzias?/g, '').replace(/[^0-9]/g, '').trim();
  const num = parseInt(s) || 1;
  if (String(v).toLowerCase().includes('dúzia')) {
    return num * 12;
  }
  return num;
}

const linhas = [];
for (let i = 4; i < data.length; i++) {
  const row = data[i];
  const codigo = String(get(row, 0) || '').trim();
  if (!codigo || codigo === '-') continue;

  const nome = String(get(row, 1) || '').trim();
  const caixaMaster = parseCaixaMaster(get(row, 2));
  const precoCaixa = toFloat(get(row, 3));
  const pdv = toFloat(get(row, 12));

  linhas.push({
    codigo,
    nome: nome || codigo,
    categoria: 'Geral',
    caixa_master: caixaMaster,
    preco_caixa_master: precoCaixa,
    pdv_sugerido: pdv,
    status: 'DISPONÍVEL',
    ativo: true
  });
}

const csvHeader = 'codigo,nome,categoria,caixa_master,preco_caixa_master,pdv_sugerido,status,ativo\n';
const csvRows = linhas.map(r =>
  `${r.codigo},"${r.nome}",${r.categoria},${r.caixa_master},${r.preco_caixa_master},${r.pdv_sugerido},${r.status},${r.ativo}`
).join('\n');

fs.writeFileSync('produtos_convertidos.csv', csvHeader + csvRows);
console.log(`Convertidas ${linhas.length} linhas. Arquivo: produtos_convertidos.csv`);