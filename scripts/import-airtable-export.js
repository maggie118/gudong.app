// scripts/import-airtable-export.js
// 把 Airtable 网页端导出的两个 CSV（antiques / sellers）转成仓库数据源
// data/items.csv 与 data/sellers.csv，并顺手修掉导出里已知的脏值：
//   - 复选框导出为 "checked"/空 → 转成 TRUE/FALSE
//   - 日期 "9/12/2026 4:54pm" → ISO "2026-09-12T16:54:00"
//   - 图片列里的错拼扩展名（.jpb）、缺扩展名 → 按 assets/images 下真实文件名匹配纠正
//   - item 的 seller_id 写成 "Yap"（卖家表里实际是 Yap-JM）→ 归一
//   - 导出里空的 era_en / dimensions 等字段 → 用现有 listings.json 同 item_id 的值补齐
//
// 用法：node scripts/import-airtable-export.js <antiques.csv> <sellers.csv>

const fs = require('fs');
const path = require('path');
const sheets = require('./sheets-source');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'images');

const [itemsCsvPath, sellersCsvPath] = process.argv.slice(2);
if (!itemsCsvPath || !sellersCsvPath) {
  console.error('用法: node scripts/import-airtable-export.js <antiques.csv> <sellers.csv>');
  process.exit(1);
}

// 现有数据：用来补齐导出里缺失的字段（同 item_id）
let old = { newListing: [], sellers: [] };
try { old = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'listings.json'), 'utf8')); } catch (e) {}
const oldItems = new Map((old.newListing || []).map((i) => [i.item_id, i]));

const isChecked = (v) => {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'checked' || s === 'true' || s === '1' || s === 'yes';
};

// "9/12/2026 4:54pm" / "2026-09-12" → ISO 本地时间字符串
function toIso(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*)?(?:\s*(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i);
  if (!m) return s;
  let [, mo, da, yr, hh, mm, ap] = m;
  let hour = hh ? Number(hh) : 0;
  if (ap) {
    const pm = ap.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${yr}-${pad(mo)}-${pad(da)}`;
  return hh ? `${date}T${pad(hour)}:${pad(mm || 0)}:00` : date;
}

// 图片名纠正：按 assets/images/<子目录>/ 下真实存在的文件名匹配（忽略错拼的扩展名）
const imgCache = new Map();
function listDir(rel) {
  if (!imgCache.has(rel)) {
    let files = [];
    try { files = fs.readdirSync(path.join(IMG_DIR, rel)); } catch (e) { files = []; }
    imgCache.set(rel, new Set(files));
  }
  return imgCache.get(rel);
}
const repaired = [];
function fixImage(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  const slash = raw.indexOf('/');
  if (slash < 0) return raw; // 没有子目录，原样返回
  const dir = raw.slice(0, slash);
  const file = raw.slice(slash + 1);
  const files = listDir(dir);
  if (files.has(file)) return raw;
  const base = file.replace(/\.(jpb|jpeg|png|webp)$/i, '').replace(/\.jpg$/i, '');
  const candidates = [file + '.jpg', base + '.jpg', base.replace(/\.jpb$/i, '') + '.jpg'];
  for (const c of candidates) {
    if (files.has(c)) {
      repaired.push(`${raw} → ${dir}/${c}`);
      return `${dir}/${c}`;
    }
  }
  repaired.push(`${raw} → (找不到文件，已跳过)`);
  return '';
}

const CATEGORY_EN = { 瓷器: 'Porcelain', 玉器: 'Jade', 铜器: 'Bronzes', 钱币: 'Coins', 书画: 'Paintings', 杂项: 'Miscellaneous' };
const ERA_EN = {
  '晚清': 'Late Qing', '清': 'Qing Dynasty', '清早期': 'Early Qing', '清代': 'Qing Dynasty',
  '明': 'Ming Dynasty', '明代': 'Ming Dynasty', '明早期': 'Early Ming', '明晚期': 'Late Ming',
  '宋': 'Song Dynasty', '宋代': 'Song Dynasty', '北宋': 'Northern Song', '南宋': 'Southern Song',
  '唐': 'Tang Dynasty', '唐代': 'Tang Dynasty', '元': 'Yuan Dynasty', '元代': 'Yuan Dynasty',
  '汉': 'Han Dynasty', '西汉': 'Western Han', '民国': 'Republic Period',
};
const SELLER_ALIAS = { Yap: 'Yap-JM' };

function normalizeSellerId(v) {
  const s = String(v == null ? '' : v).trim();
  return SELLER_ALIAS[s] || s;
}

// ---------- items ----------
const itemRows = sheets.toRecords(fs.readFileSync(itemsCsvPath, 'utf8')).map((r) => {
  const f = r.fields;
  const itemId = String(f.item_id || '').trim();
  const prev = oldItems.get(itemId) || {};
  const sellerId = normalizeSellerId(f.seller_id);
  const imgs = String(f.img_file || '')
    .split(/[\s,]+/)
    .map(fixImage)
    .filter(Boolean)
    .join(' ');
  return {
    item_id: itemId,
    title_zh: f.title_zh || prev.title_zh || '',
    title_en: f.title_en || prev.title_en || '',
    era_zh: f.era_zh || prev.era_zh || '',
    era_en: f.era_en || prev.era_en || ERA_EN[f.era_zh] || '',
    category: f.category || prev.category || '',
    dimensions: f.dimensions || prev.dimensions || '',
    has_surface_wear: isChecked(f.has_surface_wear) || !!prev.has_surface_wear,
    has_surface_damage: isChecked(f.has_surface_damage) || !!prev.has_surface_damage,
    price_type: f.price_type || prev.price_type || '',
    price_display_zh: f.price_display_zh || f.price_zh || prev.price_display_zh || '',
    price_display_en: f.price_display_en || f.price_en || prev.price_display_en || '',
    img_file: imgs,
    seller_id: sellerId,
    seller_name_en: f.seller_name_en || prev.seller_name_en || '',
    seller_whatsapp: f.seller_whatsapp || prev.seller_whatsapp || '',
    is_today_finds: isChecked(f.is_today_finds) || !!prev.is_today_finds,
    is_new_listing: isChecked(f.is_new_listing) || !!prev.is_new_listing,
    status: (f.status || prev.status || 'active').toLowerCase(),
    reason_zh: f.reason_zh || prev.reason_zh || '',
    reason_en: f.reason_en || prev.reason_en || '',
    listed_at: toIso(f.listed_at) || prev.listed_at || '',
    expiry_date: toIso(f.expiry_date) || prev.expiry_date || '',
    previous_price: f.previous_price != null && f.previous_price !== '' ? f.previous_price : (prev.previous_price ?? ''),
    fixed_price: f.fixed_price != null && f.fixed_price !== '' ? f.fixed_price : (prev.fixed_price ?? ''),
    _createdTime: toIso(f.listed_at) || prev._createdTime || '',
  };
});

// ---------- sellers ----------
const oldSellers = new Map((old.sellers || []).map((s) => [String(s.seller_id).trim(), s]));
const sellerRows = sheets.toRecords(fs.readFileSync(sellersCsvPath, 'utf8')).map((r) => {
  const f = r.fields;
  const id = String(f.seller_id || '').trim();
  const prev = oldSellers.get(id) || {};
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // 私家藏馆只认导出的 gallery 勾选，不做任何强制开通
  const gallery = isChecked(f.gallery);
  return {
    seller_id: id,
    display_zh: f['展馆名（中文）'] || f.display_zh || prev.display_zh || id,
    display_en: f.display_en || prev.display_en || id,
    since_year: Number(f.since_year || prev.since_year || 2026),
    intro_zh: f.intro_zh || f['展馆简介 / Seller Biography'] || prev.intro_zh || '',
    intro_en: f.intro_en || prev.intro_en || '',
    title_focus: f.title_focus || prev.title_focus || '',
    gallery,
    gallery_started_at: toIso(f.gallery_started_at) || '',
    gallery_expires_at: toIso(f.gallery_expires_at) || '',
    founding_no: String(f.founding_no == null ? '' : f.founding_no).trim(),
    page_url: `/sellers/seller-${slug}-antiques.html`,
    wa_username: f.wa_username || '',
    wa_phone: (f['WhatsApp 联络号码 / WhatsApp Contact Number'] || f.wa_phone || '').replace(/[^0-9]/g, ''),
    status: (f.status || 'active').toLowerCase(),
  };
});

// ---------- 写回仓库 CSV ----------
const ITEM_COLS = ['item_id', 'title_zh', 'title_en', 'era_zh', 'era_en', 'category', 'dimensions',
  'has_surface_wear', 'has_surface_damage', 'price_type', 'price_display_zh', 'price_display_en', 'img_file',
  'seller_id', 'seller_name_en', 'seller_whatsapp', 'is_today_finds', 'is_new_listing', 'status',
  'reason_zh', 'reason_en', 'listed_at', 'expiry_date', 'previous_price', 'fixed_price', '_createdTime'];
const SELLER_COLS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en',
  'title_focus', 'gallery', 'gallery_started_at', 'gallery_expires_at', 'founding_no', 'page_url',
  'wa_username', 'wa_phone', 'status'];

const cell = (v) => {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number' && Number.isNaN(v)) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
function writeCsv(file, cols, rows) {
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  fs.writeFileSync(file, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
  console.log('写入', path.relative(ROOT, file), '| rows:', rows.length);
}

writeCsv(path.join(ROOT, 'data', 'items.csv'), ITEM_COLS, itemRows);
writeCsv(path.join(ROOT, 'data', 'sellers.csv'), SELLER_COLS, sellerRows);

// ---------- 摘要 ----------
const prevIds = new Set((old.newListing || []).map((i) => i.item_id));
const added = itemRows.filter((i) => !prevIds.has(i.item_id)).map((i) => i.item_id);
const gone = [...prevIds].filter((id) => !itemRows.some((i) => i.item_id === id));
console.log('\n藏品：', itemRows.length, '件');
if (added.length) console.log('  新增:', added.join(', '));
if (gone.length) console.log('  消失:', gone.join(', '));
if (repaired.length) {
  console.log('\n图片名纠正', repaired.length, '处：');
  repaired.forEach((r) => console.log('  ' + r));
}
console.log('\n卖家：', sellerRows.length, '家 | 开通藏馆:', sellerRows.filter((s) => s.gallery).map((s) => s.seller_id).join(', '));
console.log('创始卖家编号:', sellerRows.filter((s) => s.founding_no).map((s) => `${s.seller_id}=${s.founding_no}`).join(', ') || '(无)');
const noDate = itemRows.filter((i) => !i.listed_at);
if (noDate.length) console.log('缺少 listed_at:', noDate.map((i) => i.item_id).join(', '));
const noImg = itemRows.filter((i) => !i.img_file);
if (noImg.length) console.log('缺少图片:', noImg.map((i) => i.item_id).join(', '));
