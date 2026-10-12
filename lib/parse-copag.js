import XLSX from 'xlsx';

function normalizeHeader(h) {
  if (!h) return '';
  return String(h)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '_');
}

function toFloat(v) {
  if (v === null || v === undefined || v === '' || v === '-') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round2(v) {
  if (v === null || v === undefined) return null;
  return Math.round(v * 100) / 100;
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

function findHeaderRow(data, maxRows = 30) {
  for (let i = 0; i < Math.min(data.length, maxRows); i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = normalizeHeader(row[j]);
      if (cell === 'ref' || cell === 'referencia' || cell === 'codigo' || cell === 'cod') {
        return { rowIndex: i, refCol: j };
      }
    }
  }
  return null;
}

function mapColumns(headers, refCol) {
  const normalized = headers.map(h => normalizeHeader(h));
  const colMap = {};
  
  const targetColumns = {
    codigo: ['ref', 'referencia', 'codigo', 'cod'],
    nome: ['descricao', 'descricao_', 'nome', 'produto', 'descricao_completa'],
    categoria: ['categoria', 'linha'],
    caixa_master: ['caixa_master', 'caixa', 'qtd_caixa', 'cx_master', 'unidades_caixa', 'qtd_master'],
    preco_caixa_master: ['preco_cheio', 'preco_caixa_master', 'preco_da_caixa_master', 'preco_caixa', 'valor_caixa', 'preco', 'valor'],
    ecommerce: ['ecommerce', 'e_commerce', 'e_commerce_10'],
    varejo15: ['varejo_15', 'varejo15'],
    varejo20: ['varejo_20', 'varejo20'],
    clube: ['clube', 'clube_23'],
    hobby20: ['hobby_store_20', 'hobby20', 'hobby_store'],
    hobby26: ['hobby_store_26', 'hobby26'],
    atacado26: ['atacado_26', 'atacado26', 'atacado_categoria_c'],
    atacado28: ['atacado_28', 'atacado28', 'atacado_categoria_b'],
    atacado30: ['atacado_30', 'atacado30', 'atacado_categoria_a'],
    suggestedWholesale: ['preco_sugerido_venda_atacado', 'preco_sugerido', 'venda_atacado'],
    pdv: ['preco_sugerido_pdv_unidade', 'preco_sugerido_pdv', 'pdv_sugerido', 'pdv'],
  };

  for (const [field, aliases] of Object.entries(targetColumns)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias);
      if (idx !== -1) {
        colMap[field] = idx;
        break;
      }
    }
  }

  if (colMap.codigo === undefined && refCol !== undefined) {
    colMap.codigo = refCol;
  }

  return colMap;
}

function isCategoryRow(row, colMap, refCol) {
  const codigo = row[colMap.codigo];
  const nome = colMap.nome !== undefined ? row[colMap.nome] : '';
  const preco = colMap.preco_caixa_master !== undefined ? row[colMap.preco_caixa_master] : '';
  
  const hasCodigo = codigo !== null && codigo !== undefined && String(codigo).trim() !== '';
  const hasNome = nome !== null && nome !== undefined && String(nome).trim() !== '';
  const hasPreco = preco !== null && preco !== undefined && String(preco).trim() !== '' && String(preco).trim() !== '-';
  
  if (hasCodigo && !hasNome && !hasPreco) {
    return true;
  }
  
  const firstCol = refCol > 0 ? refCol - 1 : 0;
  const firstCell = row[firstCol];
  const hasFirstCell = firstCell !== null && firstCell !== undefined && String(firstCell).trim() !== '';
  const otherDataColsEmpty = !hasNome && !hasPreco && !hasCodigo;
  
  if (hasFirstCell && otherDataColsEmpty) {
    return true;
  }
  
  return false;
}

export function parseCopagSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  
  let targetSheetName = null;
  let targetData = null;
  let headerInfo = null;
  
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1, range: 0 });
    const info = findHeaderRow(data);
    if (info) {
      targetSheetName = sheetName;
      targetData = data;
      headerInfo = info;
      break;
    }
  }
  
  if (!targetData) {
    throw new Error('Nenhuma aba com cabeçalho "Ref" encontrada nas primeiras 30 linhas');
  }
  
  const headers = targetData[headerInfo.rowIndex] || [];
  const colMap = mapColumns(headers, headerInfo.refCol);
  
  const requiredFields = ['codigo', 'nome', 'caixa_master', 'preco_caixa_master', 'pdv'];
  const missing = requiredFields.filter(f => colMap[f] === undefined);
  if (missing.length > 0) {
    const headerNames = headers.map((h, i) => `${i}: "${h}"`).join(', ');
    throw new Error(`Colunas obrigatórias não encontradas: ${missing.join(', ')}. Cabeçalhos detectados: ${headerNames}`);
  }
  
  const products = [];
  let currentCategory = 'Geral';
  const problems = [];
  
  for (let i = headerInfo.rowIndex + 1; i < targetData.length; i++) {
    const row = targetData[i];
    if (!row || !Array.isArray(row)) continue;
    
    if (row.every(c => c === null || c === undefined || c === '')) continue;
    
    const codigoRaw = row[colMap.codigo];
    const codigo = codigoRaw !== null && codigoRaw !== undefined ? String(codigoRaw).trim() : '';
    
    if (!codigo || codigo === '-') {
      if (isCategoryRow(row, colMap, headerInfo.refCol)) {
        const firstCol = headerInfo.refCol > 0 ? headerInfo.refCol - 1 : 0;
        const firstCell = row[firstCol];
        if (firstCell !== null && firstCell !== undefined && String(firstCell).trim() !== '') {
          currentCategory = String(firstCell).trim();
        }
      }
      continue;
    }
    
    if (isCategoryRow(row, colMap, headerInfo.refCol)) {
      currentCategory = codigo;
      continue;
    }
    
    const nomeRaw = colMap.nome !== undefined ? row[colMap.nome] : '';
    const nome = nomeRaw !== null && nomeRaw !== undefined ? String(nomeRaw).trim() : '';
    if (!nome) {
      problems.push({ row: i, codigo, motivo: 'nome vazio' });
      continue;
    }
    
    const caixaMasterRaw = colMap.caixa_master !== undefined ? row[colMap.caixa_master] : '';
    const caixaMaster = parseCaixaMaster(caixaMasterRaw);
    
    const precoRaw = colMap.preco_caixa_master !== undefined ? row[colMap.preco_caixa_master] : '';
    const precoCaixaMaster = round2(toFloat(precoRaw));
    
    const pdvRaw = colMap.pdv !== undefined ? row[colMap.pdv] : '';
    const pdvSugerido = round2(toFloat(pdvRaw));
    
    const product = {
      codigo,
      nome,
      categoria: currentCategory || 'Geral',
      caixa_master: caixaMaster,
      preco_caixa_master: precoCaixaMaster,
      pdv_sugerido: pdvSugerido,
      status: 'DISPONÍVEL',
      ativo: true,
    };
    
    products.push(product);
  }
  
  return { products, problems, sheet: targetSheetName, categoriesCount: new Set(products.map(p => p.categoria)).size };
}