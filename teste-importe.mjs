import { signToken } from './lib/auth-client.js';
import fs from 'node:fs';

const token = await signToken({ role: 'admin', sub: 'admin' }, '8h');

const dataUrl = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' +
  fs.readFileSync('tabela_precos_copag_2026.xlsx').toString('base64');

const req = {
  method: 'POST',
  headers: { cookie: `admin_session=${token}` },
  body: { file: dataUrl },
};

let status = 200, json = null;
const res = {
  status(c) { status = c; return res; },
  json(j) { json = j; },
};

const { default: handler } = await import('./api/admin/import.js');
await handler(req, res);
console.log('HTTP', status);
console.log(JSON.stringify(json, null, 1));
