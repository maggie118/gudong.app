// 一次性数据修复脚本（2026-09-19）
// 修复 Airtable `antiques` 表中的三类数据问题：
//   1. item_id / seller_id 中的 U+2011（‑）等 Unicode 连字符 → ASCII '-'
//   2. img_file 缺少卖家目录前缀（如 "item-lim-04.jpg" → "lim-kw/item-lim-04.jpg"）
//   3. img_file 中的 Unicode 连字符
// 修改前先对目标图片做 HEAD 校验（线上 /assets/images/ 下确实存在才写入）。
require('dotenv').config();

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE_NAME || 'antiques';

const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
const norm = s => typeof s === 'string' ? s.replace(HYPHEN_VARIANTS, '-').trim() : s;

// 卖家目录映射：seller_id → 线上 assets/images/ 下的子目录
const SELLER_DIR = { 'lim-kee-whee': 'lim-kw' };

const api = (path, opts) =>
  fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(opts && opts.headers),
    },
  }).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  });

async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch { return false; }
}

async function main() {
  // 1. 拉全量
  let all = [], offset = null;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    if (offset) q.set('offset', offset);
    const j = await api(`${encodeURIComponent(TABLE)}?${q}`);
    all.push(...j.records);
    offset = j.offset || null;
  } while (offset);
  console.log(`共 ${all.length} 条记录`);

  // 2. 计算变更
  const updates = [];
  for (const rec of all) {
    const f = rec.fields;
    const patch = {};

    const nid = norm(f.item_id || '');
    if (f.item_id && nid !== f.item_id) patch.item_id = nid;

    const nsid = norm(f.seller_id || '');
    if (f.seller_id && nsid !== f.seller_id) patch.seller_id = nsid;

    if (f.img_file) {
      let img = norm(f.img_file);
      if (!img.includes('/')) {
        // 缺目录前缀：用卖家目录映射补齐，并先校验线上是否真的存在
        const dir = SELLER_DIR[nsid || f.seller_id];
        const cand = dir ? `${dir}/${img}` : null;
        if (cand && await headOk(`https://www.gudong.app/assets/images/${cand}`)) {
          img = cand;
        } else {
          console.warn(`⚠️ 记录 ${rec.id}：无法为裸文件名 "${img}" 找到已存在的线上图片（dir=${dir}），跳过 img_file 目录修复`);
        }
      }
      if (img !== f.img_file) patch.img_file = img;
    }

    if (Object.keys(patch).length) updates.push({ id: rec.id, fields: patch });
  }

  if (!updates.length) { console.log('✅ 无需修改，数据已干净'); return; }

  console.log('变更计划：');
  for (const u of updates) console.log(`  ${u.id} →`, JSON.stringify(u.fields));

  // 3. 写回（Airtable 单次最多 10 条）
  for (let i = 0; i < updates.length; i += 10) {
    const j = await api(`${encodeURIComponent(TABLE)}`, {
      method: 'PATCH',
      body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }),
    });
    console.log(`已更新 ${j.records.length} 条`);
  }

  // 4. 复查
  let check = [], offset2 = null;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    if (offset2) q.set('offset', offset2);
    const j = await api(`${encodeURIComponent(TABLE)}?${q}`);
    check.push(...j.records);
    offset2 = j.offset || null;
  } while (offset2);
  for (const rec of check) {
    const bad = ['item_id', 'seller_id', 'img_file']
      .filter(k => typeof rec.fields[k] === 'string' && rec.fields[k].search(HYPHEN_VARIANTS) !== -1);   // 不用 .test()：带 g 标志的正则会记住 lastIndex，导致复查时漏报
    console.log(bad.length ? `❌ ${rec.fields.item_id} 仍有异常字段: ${bad}` : `✓ ${rec.fields.item_id} | img_file=${rec.fields.img_file}`);
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });