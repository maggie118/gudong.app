// 给 item.html 加 data/listings.json 快照兜底（Airtable 额度耗尽期间的临时方案）
// 幂等：已打过补丁则跳过。用法: node scripts/patch-item-snapshot-fallback-2026-10-24.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'item.html');
const MARK = 'gd-snapshot-fallback-2026-10-24';

let html = fs.readFileSync(FILE, 'utf8');
if (html.includes(MARK)) {
  console.log('SKIP  已打过补丁 (' + MARK + ')');
  process.exit(0);
}

const eol = html.includes('\r\n') ? '\r\n' : '\n';
const lines = html.split(/\r?\n/);

// ---- 替换 1：把 fetch(proxy) 包成函数，并接上快照回退 ----
const MARKER_1 = "fetch(API_BASE + '/api/airtable-proxy', { cache: 'no-store', signal: ctl.signal, headers: { 'Accept': 'application/json' } })";
let idx1 = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(MARKER_1)) { idx1 = i; break; }
}
if (idx1 < 0) throw new Error('未找到 fetch(proxy) 行');
// 确认后面两行是预期的 .then(...)
if (!/\.then\(function \(r\) \{ if \(!r\.ok\)/.test(lines[idx1 + 1])) throw new Error('第 ' + (idx1 + 2) + ' 行不是预期的 .then(r)');
if (!/^\s*\.then\(function \(data\) \{\s*$/.test(lines[idx1 + 2])) throw new Error('第 ' + (idx1 + 3) + ' 行不是预期的 .then(data)');

const indent = (lines[idx1].match(/^\s*/) || [''])[0]; // "        "
const NEW_1 = [
  indent + 'function gdFetchProxy() {',
  indent + '    return fetch(API_BASE + \'/api/airtable-proxy\', { cache: \'no-store\', signal: ctl.signal, headers: { \'Accept\': \'application/json\' } })',
  indent + '        .then(function (r) { if (!r.ok) throw new Error(\'HTTP \' + r.status); return r.json(); });',
  indent + '}',
  indent + '// ' + MARK + '：Airtable 额度耗尽期间的临时方案 —— 接口不可用时回退 data/listings.json 快照',
  indent + '// 注意：rewrite 后 URL 可能是 /items/<id>，此时相对路径要回上一级',
  indent + 'var GD_SNAP_URL = (location.pathname.indexOf(\'/items/\') === 0 ? \'../\' : \'\') + \'data/listings.json\';',
  indent + 'function gdFetchSnapshot(prevErr) {',
  indent + '    return fetch(GD_SNAP_URL, { cache: \'no-store\' })',
  indent + '        .then(function (r) { if (!r.ok) throw new Error(prevErr.message + \' / 快照 HTTP \' + r.status); return r.json(); })',
  indent + '        .then(function (d) { d.__gdSnapshot = true; return d; });',
  indent + '}',
  indent + 'gdFetchProxy().catch(gdFetchSnapshot)',
  indent + '    .then(function (data) {',
];

// ---- 替换 2：按数据来源设置 dataset.source 与 badge ----
const MARKER_2 = "document.documentElement.dataset.source = 'airtable';";
let idx2 = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(MARKER_2)) { idx2 = i; break; }
}
if (idx2 < 0) throw new Error('未找到 dataset.source = \'airtable\' 行');

const ind2 = (lines[idx2].match(/^\s*/) || [''])[0];
const NEW_2 = [
  ind2 + 'document.documentElement.dataset.source = data.__gdSnapshot ? \'snapshot\' : \'airtable\';',
  ind2 + 'badge((data.__gdSnapshot ? \'\\u26a0 \\u5feb\\u7167 data/listings.json\\uff08\\u975e\\u5b9e\\u65f6\\uff09\\u00b7 \' : \'\\u2714 Airtable \\u00b7 \') + ID + \'\\n\' + (changes.length ? changes.join(\'\\n\') : \'\\u4e0e\\u9759\\u6001\\u9875\\u4e00\\u81f4\'), !data.__gdSnapshot);',
];

// ---- 替换 3：catch 提示改为「接口与快照均不可用」 ----
const MARKER_3 = "badge('⚠ 未连上 Airtable，显示静态页\\n' + e.message, false);";
let idx3 = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(MARKER_3)) { idx3 = i; break; }
}
if (idx3 < 0) throw new Error('未找到 catch 里的 badge 行');

const ind3 = (lines[idx3].match(/^\s*/) || [''])[0];
const NEW_3 = [
  ind3 + 'badge(\'\\u26a0 \\u63a5\\u53e3\\u4e0e\\u5feb\\u7167\\u5747\\u4e0d\\u53ef\\u7528\\uff0c\\u663e\\u793a\\u9759\\u6001\\u9875\\n\' + e.message, false);',
];

// 从后往前替换，避免索引偏移
const edits = [
  { at: idx3, del: 1, ins: NEW_3, name: 'catch 提示' },
  { at: idx2, del: 2, ins: NEW_2, name: 'source/badge' },
  { at: idx1, del: 3, ins: NEW_1, name: 'fetch 包函数 + 快照回退' },
];
for (const ed of edits) {
  // 校验被删掉的行符合预期
  lines.splice(ed.at, ed.del, ...ed.ins);
  console.log('  OK  ' + ed.name + '  (L' + (ed.at + 1) + ')');
}

fs.writeFileSync(FILE, lines.join(eol));
console.log('\n已写入: ' + FILE);
console.log('EOL: ' + (eol === '\r\n' ? 'CRLF' : 'LF'));
