const fs = require('fs');

// 读取现有 listings.json
const listings = JSON.parse(fs.readFileSync('c:/Users/Eastw Engineering/Documents/Gudong/data/listings.json', 'utf8'));

// CSV 解析：处理带引号字段（引号内可含逗号和换行）
function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQ = false; }
      } else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') {
        cur.push(field); rows.push(cur); cur = []; field = '';
      } else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  // 处理最后一行
  if (field !== '' || cur.length > 0) {
    cur.push(field); rows.push(cur);
  }
  // 过滤空行
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

let csv = fs.readFileSync('c:/Users/Eastw Engineering/.trae-cn/attachments/6aa3f97b4fcdd7f27de0cfd8/12c782bd-334a-48e5-8118-71d94261a6dc_90ef9790-9308-445a-9d10-3cbe7abeff9c_antiques-Grid view (1).csv', 'utf8');
// 去除 UTF-8 BOM
if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
const rows = parseCSV(csv);
console.log('Parsed rows:', rows.length);
const headers = rows[0];
console.log('Headers count:', headers.length);
const items = rows.slice(1).map(r => {
  const o = {};
  headers.forEach((h, i) => o[h] = r[i] || '');
  return o;
});

// 构建 item 对象
function buildItem(o) {
  const checked = (v) => v === 'checked';
  return {
    item_id: o.item_id,
    title_zh: o.title_zh,
    title_en: o.title_en,
    era_zh: o.era_zh,
    era_en: o.era_en,
    category: (o.category || '').trim(),
    dimensions: o.dimensions || '',
    has_surface_wear: checked(o.has_surface_wear),
    has_surface_damage: checked(o.has_surface_damage),
    price_type: o.price_type || '私聊',
    price_display_zh: o.price_display_zh || '价格面议',
    price_display_en: o.price_display_en || 'Price on inquiry',
    img_file: o.img_file || '',
    seller_id: o.seller_id,
    seller_name_en: o.seller_name_en || '',
    is_today_finds: true,
    is_new_listing: true,
    status: o.status || 'active'
  };
}

// 去重：以 item_id 为 key，但 CSV 中有重复的 item-ngcy-01（Lim-KW 和 Ng-CY 各一个）
// 保留所有，因为 seller_id 不同
const map = {};
items.forEach((o, idx) => {
  const it = buildItem(o);
  console.log('Item', idx, 'id=', it.item_id, 'seller=', it.seller_id, 'title=', it.title_zh);
  // 跳过 Lim-KW 的 item-ngcy-01（实际是 item-lim-01 的重复，Airtable 数据错误）
  if (it.seller_id === 'Lim-KW' && it.item_id === 'item-ngcy-01') {
    console.log('  -> skipped (duplicate of item-lim-01)');
    return;
  }
  // 用 item_id 作为唯一 key（Ng-CY 的 item-ngcy-01 保留）
  map[it.item_id] = it;
});

const allItems = Object.values(map);

// 更新三个数组（去重，保留已有 item 的额外字段如 fixed_price）
function merge(arr, items) {
  const existing = {};
  arr.forEach(it => { existing[it.seller_id + '|' + it.item_id] = it; });
  items.forEach(it => {
    const key = it.seller_id + '|' + it.item_id;
    if (existing[key]) {
      // 合并：用 CSV 的数据覆盖，但保留已有的额外字段
      existing[key] = Object.assign({}, existing[key], it);
    } else {
      existing[key] = it;
    }
  });
  return Object.values(existing);
}

listings.todayFinds = merge(listings.todayFinds || [], allItems);
listings.editorPicks = merge(listings.editorPicks || [], allItems);
listings.newListing = merge(listings.newListing || [], allItems);
listings.total = allItems.length;
[...listings.todayFinds, ...listings.editorPicks, ...listings.newListing].forEach(it => delete it.seller_whatsapp);
(listings.sellers || []).forEach(seller => { delete seller.whatsapp; delete seller.seller_whatsapp; });

fs.writeFileSync('c:/Users/Eastw Engineering/Documents/Gudong/data/listings.json', JSON.stringify(listings, null, 2));
console.log('Updated listings.json with', allItems.length, 'items');
console.log('Sellers:', listings.sellers.map(s => s.seller_id).join(', '));

