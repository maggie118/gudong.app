// scripts/sheets-source.js
// 把 Google Sheets 当作数据源，替代 Airtable 的取数层。
//
// 为什么这么做：Airtable 免费版每月只有 1000 次 API 调用，一次部署要拉 items+sellers
// 两张表，一个月几次部署就打爆（PUBLIC_API_BILLING_LIMIT_EXCEEDED），站点会退回仓库里的
// 旧快照。Google Sheets 的读取走「公开 CSV 导出」，没有按月计费的额度，速率上限远高于
// 静态站构建所需（一次构建只读 2 次）。
//
// 使用前提（用户侧一次性设置）：
//   1) 新建一个 Google 表格，两个工作表命名 items、sellers（列头见 data/migration/*.csv）
//   2) 右上角「共享」→ 通用访问设为「知道链接的任何人（查看者）」
//   3) 把表格 URL 里的 /d/<SHEET_ID>/ 部分填到 Vercel 环境变量 SHEET_ID
//   可选：SHEET_TAB_ITEMS / SHEET_TAB_SELLERS 改工作表名（默认 items / sellers）
//
// 输出的记录形状与 Airtable 一致（{ id, fields, createdTime }），因此 refresh-listings.js
// 里既有的 mapItem / mapSeller 无需改动。

// 默认指向站长自己的主数据表（items / sellers 两个工作表都在里面，另含两个表单的回复页）
const DEFAULT_SHEET_ID = '1bXToBUVn9T1R6dcImOvQAlh2arXdDx4n1mtoYCDxV3U';
const SHEET_ID = process.env.SHEET_ID || DEFAULT_SHEET_ID;
const TAB_ITEMS = process.env.SHEET_TAB_ITEMS || 'items';
const TAB_SELLERS = process.env.SHEET_TAB_SELLERS || 'sellers';

function isConfigured() {
  return !!SHEET_ID;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, ''); // 去掉导出的 BOM
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function toRecords(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const fields = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      let v = rows[i][idx] != null ? String(rows[i][idx]) : '';
      v = v.trim();
      if (v === '') return;
      // Google Sheet 导出的布尔/数字都带成字符串，这里还原成各字段原本的类型语义：
      // 布尔字段值统一转 true/false，其余保持字符串（mapItem 内部会再按需转换）
      if (/^(true|false)$/i.test(v)) { fields[h] = v.toLowerCase() === 'true'; }
      else fields[h] = v;
    });
    const id = fields.item_id || fields.seller_id || `row-${i}`;
    const createdTime = fields._createdTime || '';
    delete fields._createdTime;
    out.push({ id, fields, createdTime });
  }
  return out;
}

// 通过「公开 CSV 导出」取表：无需 API key、无需 OAuth，只要表格设为链接可查看
// 取数优先级：SHEET_ID（Google 表格）→ 仓库内 data/<工作表名>.csv → 报错
// 本地联调：设置 SHEET_LOCAL_DIR=<目录> 时直接读该目录下的 <工作表名>.csv，不联网
// 仓库 CSV 模式：把表格导出成 data/items.csv、data/sellers.csv 放进仓库，构建时直接读，
// 这样即使不配 Google 表格也能摆脱 Airtable 的月度额度限制
function repoCsvPath(tabName) {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(path.resolve(__dirname, '..'), 'data', `${tabName}.csv`);
  return fs.existsSync(p) ? p : '';
}

function hasRepoCsv(tabName) {
  return !!repoCsvPath(tabName);
}

async function fetchTable(tabName) {
  const localDir = process.env.SHEET_LOCAL_DIR;
  if (localDir) {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(localDir, `${tabName}.csv`);
    const text = fs.readFileSync(file, 'utf8');
    const records = toRecords(text);
    if (!records.length) throw new Error(`sheet "${tabName}" returned no rows`);
    return records;
  }
  const repoCsv = repoCsvPath(tabName);
  if (!isConfigured() && repoCsv) {
    const records = toRecords(require('fs').readFileSync(repoCsv, 'utf8'));
    if (!records.length) throw new Error(`repo csv data/${tabName}.csv returned no rows`);
    return records;
  }
  if (!isConfigured()) throw new Error('SHEET_ID not configured and no repo csv');
  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await fetch(base, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  if (!r.ok) throw new Error(`sheets ${r.status}: ${text.slice(0, 160)}`);
  // 表格未公开或工作表名不存在时，Google 会回一个 HTML 登录/错误页
  if (/^<|<!DOCTYPE html|<html/i.test(text.trim().slice(0, 20))) {
    throw new Error(`sheet "${tabName}" not readable — 请把表格设成「知道链接的任何人可查看」，并确认工作表名`);
  }
  const records = toRecords(text);
  if (!records.length) throw new Error(`sheet "${tabName}" returned no rows`);
  return records;
}

module.exports = { isConfigured, hasRepoCsv, fetchTable, parseCsv, toRecords, SHEET_ID, TAB_ITEMS, TAB_SELLERS };
