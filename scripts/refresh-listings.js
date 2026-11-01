// scripts/refresh-listings.js
// 穷人版 SSG：在 Vercel build 时拉一次 Airtable，覆盖 data/listings.json。
// 设计原则：任何失败都不阻塞 build —— 拉不到就保留旧 listings.json。
//
// 需要的环境变量（Vercel 已配）：
//   AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_TOKEN
//
// 退出码：
//   0 = 成功刷新，或失败但已安全跳过（保留旧文件）
//   1 = 严重错误（一般不会发生；发生时 Vercel build 会失败，你能立刻看到）

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'listings.json');

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;

function log(...args) {
  console.log('[refresh-listings]', ...args);
}

function safeReadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

async function fetchAll(table) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`airtable ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    records.push(...(j.records || []));
    offset = j.offset || null;
  } while (offset);
  return records;
}

function mapItem(rec) {
  const f = rec.fields || {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  return {
    item_id: f.item_id || rec.id,
    _createdTime: rec.createdTime,
    title_zh: f.title_zh || '',
    title_en: f.title_en || '',
    era_zh: f.era_zh || '',
    era_en: f.era_en || '',
    category: f.category || '',
    dimensions: f.dimensions || '',
    has_surface_wear: !!f.has_surface_wear,
    has_surface_damage: !!f.has_surface_damage,
    price_type: f.price_type || '',
    price_display_zh: f.price_display_zh || f.price_zh || '',
    price_display_en: f.price_display_en || f.price_en || '',
    img_file: Array.isArray(f.img_file) ? f.img_file.join(' ') : (f.img_file || ''),
    seller_id: f.seller_id || '',
    seller_name_en: f.seller_name_en || '',
    seller_whatsapp: f.seller_whatsapp || '',
    is_today_finds: !!f.is_today_finds,
    is_new_listing: !!f.is_new_listing,
    status: (f.status || '').toLowerCase(),
  };
}

function validate(items) {
  if (!Array.isArray(items) || items.length < 5) {
    return `only ${items.length} items, refusing to overwrite`;
  }
  const noTitle = items.filter(i => !i.title_zh && !i.title_en).length;
  if (noTitle > items.length * 0.5) {
    return `${noTitle}/${items.length} items missing title, suspicious schema change`;
  }
  return null;
}

async function main() {
  if (!BASE || !TABLE || !TOKEN) {
    log('missing AIRTABLE_* env vars, keeping existing listings.json');
    process.exit(0);
  }

  let records;
  try {
    records = await fetchAll(TABLE);
  } catch (e) {
    log('airtable fetch failed, keeping existing listings.json:', e.message);
    process.exit(0);
  }

  const active = records
    .filter(r => String((r.fields && r.fields.status) || '').trim().toLowerCase() === 'active')
    .map(mapItem)
    .sort((a, b) => String(b._createdTime || '').localeCompare(String(a._createdTime || '')));

  const problem = validate(active);
  if (problem) {
    log('validation failed, keeping existing listings.json:', problem);
    process.exit(0);
  }

  const payload = {
    todayFinds: active.filter(i => i.is_today_finds),
    editorPicks: [], // editorPicks 暂未在 Airtable 表中维护，保留空数组；如需可加 is_editor_picks
    newListing: active,
    sellers: [],
    total: active.length,
  };

  // 保留旧的 editorPicks（避免 SSG 后这一栏空了）
  const old = safeReadExisting();
  if (old && Array.isArray(old.editorPicks) && old.editorPicks.length) {
    payload.editorPicks = old.editorPicks;
  }
  if (old && Array.isArray(old.sellers) && old.sellers.length) {
    payload.sellers = old.sellers;
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  log(`refreshed listings.json: ${active.length} active items, ${payload.todayFinds.length} today finds`);
}

main().catch(e => {
  log('unexpected error, keeping existing listings.json:', e.message);
  process.exit(0);
});
