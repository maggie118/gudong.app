// scripts/import-form-responses.js
// 把「Gudong 藏品提交 / Item Submission」表单回复转成 items 行草稿。
//
// 数据从哪来：主表（SHEET_ID）里的「表单回复」页签，公开 CSV 导出，不需要密钥。
// 产出：data/pending-items.csv —— 列头与 items 页签完全一致，补齐人工字段后可直接粘进 items 页签。
//
// 用法：
//   node scripts/import-form-responses.js                # 生成草稿 + 打印待补清单
//   node scripts/import-form-responses.js --tab=回复页名  # 指定回复页签
//   node scripts/import-form-responses.js --reset        # 清空导入进度（重跑所有回复）
//
// 说明：
//   - 已导入过的回复（按时间戳记）记在 data/form-import-state.json，重复跑不会重复生成。
//   - img_file / reason_zh / reason_en / 曝光位 这几项表单不收集，脚本留空并在末尾列出来。
//   - item_id 按藏家前缀自增生成（Lim-KW → item-lim-01），生成后不改。

const fs = require('fs');
const path = require('path');
const sheets = require('./sheets-source');

const ROOT = path.resolve(__dirname, '..');
const OUT_CSV = path.join(ROOT, 'data', 'pending-items.csv');
const STATE_FILE = path.join(ROOT, 'data', 'form-import-state.json');

// 回复页签按 gid 定位，而不是按名字：
// gviz?sheet=<名字> 在名字不存在时会静默回落到第一个工作表，按名字取数会拿到错表。
// gid 来自「表单 → 回复 → 在 Google 表格中查看」的链接尾部。
const RESP_GID = process.env.SHEET_GID_RESPONSES || '471361248';

const args = process.argv.slice(2);
const argGid = (args.find((a) => a.startsWith('--gid=')) || '').slice(6) || RESP_GID;
const resetState = args.includes('--reset');
const selfTest = args.includes('--selftest');

function log(msg) {
  console.log(msg);
}

function parseCsv(text) {
  return sheets.parseCsv(text);
}

async function fetchResponsesCsv(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheets.SHEET_ID}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  if (/^<|<!DOCTYPE html|<html/i.test(text.trim().slice(0, 20))) {
    throw new Error(`回复页签 gid=${gid} 取不到（表格可能未公开，或 gid 不对）`);
  }
  const rows = parseCsv(text);
  if (!rows.length) throw new Error(`回复页签 gid=${gid} 是空表`);
  return { headers: rows[0].map((h) => String(h).trim()), rows: rows.slice(1) };
}

function hasNewSchema(headers) {
  return headers.some((h) => h.includes('品相披露')) && headers.some((h) => h.includes('上传图片'));
}

function colIndex(headers, ...keywords) {
  for (const kw of keywords) {
    const i = headers.findIndex((h) => h.includes(kw));
    if (i >= 0) return i;
  }
  return -1;
}

function cell(row, idx) {
  if (idx < 0) return '';
  const v = row[idx];
  return v == null ? '' : String(v).trim();
}

/** 「中文 / English」拆成两段：先按斜杠、竖线、换行；拆不开就按中英文边界切 */
function splitBilingual(text) {
  const raw = String(text || '').trim();
  if (!raw) return { zh: '', en: '' };
  const seps = [' / ', ' ／ ', '／', ' / ', '/', '|', '\n', '——', ' - '];
  for (const s of seps) {
    if (raw.includes(s)) {
      const [a, ...rest] = raw.split(s);
      return { zh: a.trim(), en: rest.join(s).trim() };
    }
  }
  const m = raw.match(/^([\u3000-\u9fff\uff00-\uffef，。、（）：:；;·]+)([\s:：-]*)([A-Za-z].*)$/);
  if (m) return { zh: m[1].trim(), en: m[3].trim() };
  return { zh: raw, en: '' };
}

/** 价格文本 → { type, fixed, min, max } */
function parsePrice(mode, price) {
  const modeRaw = String(mode || '');
  const priceRaw = String(price || '').replace(/[，,]/g, ',');
  const nums = (priceRaw.match(/\d[\d,.]*/g) || []).map((n) => Number(n.replace(/,/g, ''))).filter((n) => isFinite(n) && n > 0);

  let type = '私聊';
  if (/一口价|fixed/i.test(modeRaw)) type = '一口价';
  else if (/区间|议价|range|negotiable/i.test(modeRaw)) type = '价格区间（可议价）';
  else if (/私聊|询价|面议|enquir/i.test(modeRaw)) type = '私聊';

  if (type === '私聊' && nums.length) type = nums.length > 1 ? '价格区间（可议价）' : '一口价';

  if (type === '一口价' && nums.length) return { type, fixed: nums[0], min: '', max: '' };
  if (type === '价格区间（可议价）' && nums.length >= 2) return { type, fixed: '', min: nums[0], max: nums[1] };
  if (type === '价格区间（可议价）' && nums.length === 1) return { type, fixed: '', min: nums[0], max: '' };
  return { type, fixed: '', min: '', max: '' };
}

/** 品相自述 → 两个布尔字段 */
function parseCondition(text) {
  const t = String(text || '');
  const wear = /磨损|使用痕迹|划痕|包浆不均|旧痕/.test(t);
  const damage = /修补|修复|冲线|后配|裂纹|裂|磕|缺|锔|残|补配/.test(t);
  return { wear, damage };
}

function slugPrefix(sellerId) {
  const s = String(sellerId || '');
  if (!s) return 'item';
  // 站点既有惯例取 seller_id 的第一段（Lim-KW → lim / Yak-BC → yak）
  const head = s.split('-')[0];
  return head.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3) || 'item';
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { imported: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  log(`数据源：Google 表格 ${sheets.SHEET_ID}`);

  // 1. 读回复页签（按 gid）
  let resp = await fetchResponsesCsv(argGid);
  if (!hasNewSchema(resp.headers)) {
    throw new Error('这个页签不是现行表单的回复页（缺「品相披露」「上传图片」列），用 --gid= 指定正确的页签');
  }
  if (selfTest) {
    // 自检：喂一条合成回复，验证拆字段 / 映射 / item_id 生成，不碰真实数据
    resp = {
      headers: resp.headers,
      rows: [[
        '2026-11-14 12:00:00',
        'Lim-KW',
        '青花龙纹测试瓶 / Test Blue-and-White Vase',
        '瓷器',
        '清乾隆 / Qing, Qianlong',
        'H 30cm × D 12cm',
        '3.2',
        '可议价区间',
        '800-1200',
        '测试描述 / Test description',
        '冲线一处，底部有旧修补。 / One hairline, old restoration',
        'https://drive.google.com/x.jpg, https://drive.google.com/y.jpg',
        '我已阅读并同意《藏家背书与免责协议》'
      ]]
    };
    log('【自检模式】使用合成回复，不写进度文件');
  }
  log(`回复页签：gid=${argGid}，${resp.rows.length} 条回复`);

  const headers = resp.headers;
  const C = {
    ts: colIndex(headers, '时间戳记', 'Timestamp'),
    sellerNo: colIndex(headers, '藏家编号', 'Collector ID'),
    name: colIndex(headers, '藏品名称', 'Item Name'),
    category: colIndex(headers, '品类', 'Category'),
    era: colIndex(headers, '年代', 'Period'),
    dims: colIndex(headers, '尺寸', 'Dimensions'),
    weight: colIndex(headers, '重量', 'Weight'),
    mode: colIndex(headers, '价格方式', 'Pricing mode'),
    price: colIndex(headers, '价格（SGD', 'Price (SGD'),
    desc: colIndex(headers, '藏品描述', 'Item description'),
    cond: colIndex(headers, '品相披露', 'Condition disclosure'),
    img: colIndex(headers, '上传图片', 'Upload photos')
  };

  // 2. 读 items + sellers，算出已有 item_id 与 seller_id
  const items = await sheets.fetchTable(sheets.TAB_ITEMS).catch(() => []);
  const existingIds = new Set(items.map((r) => r.fields.item_id).filter(Boolean));
  const usedIndex = {};
  for (const id of existingIds) {
    const m = String(id).match(/^item-([a-z0-9]+)-(\d+)$/i);
    if (m) usedIndex[m[1].toLowerCase()] = Math.max(usedIndex[m[1].toLowerCase()] || 0, Number(m[2]));
  }

  let sellers = [];
  try { sellers = await sheets.fetchTable(sheets.TAB_SELLERS); } catch { sellers = []; }
  const byFoundingNo = new Map();
  for (const s of sellers) {
    const f = s.fields;
    if (f.founding_no) byFoundingNo.set(String(f.founding_no).trim().toLowerCase(), f.seller_id);
    if (f.seller_id) byFoundingNo.set(String(f.seller_id).trim().toLowerCase(), f.seller_id);
  }

  // 3. 逐条映射
  const state = resetState || selfTest ? { imported: [] } : loadState();
  const imported = new Set(state.imported);
  const outRows = [];
  const todo = [];

  for (const row of resp.rows) {
    const ts = cell(row, C.ts);
    if (!ts) continue;
    if (imported.has(ts)) continue;

    const sellerRaw = cell(row, C.sellerNo);
    const sellerId = byFoundingNo.get(sellerRaw.toLowerCase()) || sellerRaw;
    if (!sellerId) {
      todo.push(`[跳过] ${ts} 没有藏家编号`);
      continue;
    }
    const prefix = slugPrefix(sellerId);
    usedIndex[prefix] = (usedIndex[prefix] || 0) + 1;
    const itemId = `item-${prefix}-${String(usedIndex[prefix]).padStart(2, '0')}`;

    const name = splitBilingual(cell(row, C.name));
    const era = splitBilingual(cell(row, C.era));
    const price = parsePrice(cell(row, C.mode), cell(row, C.price));
    const cond = parseCondition(cell(row, C.cond));
    const imgs = cell(row, C.img);

    const missing = [];
    if (!name.en) missing.push('title_en');
    if (!era.en) missing.push('era_en');
    if (!imgs) missing.push('img_file（表单没图或没上传）');
    if (!price.fixed && !price.min) missing.push('价格数字');

    const rec = {
      item_id: itemId,
      title_zh: name.zh,
      title_en: name.en,
      era_zh: era.zh,
      era_en: era.en,
      category: cell(row, C.category),
      dimensions: cell(row, C.dims),
      has_surface_wear: cond.wear ? 'TRUE' : 'FALSE',
      has_surface_damage: cond.damage ? 'TRUE' : 'FALSE',
      price_type: price.type,
      img_file: '',
      seller_id: sellerId,
      is_today_finds: 'FALSE',
      is_new_listing: 'TRUE',
      status: 'active',
      reason_zh: '',
      reason_en: '',
      listed_at: new Date().toISOString().slice(0, 10),
      expiry_date: '',
      fixed_price: price.fixed,
      price_min: price.min,
      price_max: price.max
    };

    outRows.push(rec);
    imported.add(ts);
    todo.push(
      `· ${itemId}（${sellerId}）${name.zh || '(无名称)'} → 待补：img_file` +
      (rec.reason_zh ? '' : '、reason_zh/en') +
      (missing.length ? '；需核对：' + missing.join('、') : '') +
      (cell(row, C.weight) ? `；重量 ${cell(row, C.weight)}kg` : '') +
      (imgs ? `；表单图片 ${imgs.split(/[,\s]+/).filter(Boolean).length} 张（在 Drive，需下载重命名）` : '')
    );
  }

  if (!outRows.length) {
    log('没有新回复，什么都没写。');
    return;
  }

  // 4. 写草稿 CSV（列头与 items 页签一致）
  const columns = ['item_id', 'title_zh', 'title_en', 'era_zh', 'era_en', 'category', 'dimensions',
    'has_surface_wear', 'has_surface_damage', 'price_type', 'img_file', 'seller_id', 'is_today_finds',
    'is_new_listing', 'status', 'reason_zh', 'reason_en', 'listed_at', 'expiry_date',
    'fixed_price', 'price_min', 'price_max'];
  const lines = [columns.map((c) => `"${c}"`).join(',')];
  for (const r of outRows) lines.push(columns.map((c) => csvEscape(r[c])).join(','));
  const outPath = selfTest ? OUT_CSV.replace(/\.csv$/, '.selftest.csv') : OUT_CSV;
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  if (!selfTest) saveState({ imported: [...imported] });

  log(`\n已生成 ${outRows.length} 行草稿 → ${path.relative(ROOT, outPath)}`);
  log('补齐后把整块粘进主表 items 页签（不要粘列头）。\n');
  log('待补清单：');
  for (const t of todo) log(t);
}

main().catch((e) => {
  console.error('导入失败：', e.message);
  process.exit(1);
});
