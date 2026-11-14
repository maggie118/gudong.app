// 为 data/listings.json 中尚未存在静态页的藏品，按 items/_template.html 模板生成独立静态页
// 用法：node scripts/build-item-pages.js [listings.json 路径] [--force]
// 只补齐缺失文件，绝不覆盖手工维护的静态页（除非显式传 --force）
// 模板单独存放（items/_template.html），不再借用某件藏品的页面，避免生成页反噬模板

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv.find((a) => a.endsWith('.json')) || path.join(ROOT, 'data', 'listings.json');
const FORCE = process.argv.includes('--force');
const TEMPLATE = path.join(ROOT, 'items', '_template.html');
const OUT_DIR = path.join(ROOT, 'items');
const SITE = 'https://www.gudong.app';

const CATEGORY_EN = {
  '铜器': 'Bronze',
  '瓷器': 'Porcelain',
  '玉器': 'Jade',
  '钱币': 'Coins',
  '书画': 'Paintings',
  '佛像': 'Sculpture',
  '杂项': 'Works of Art',
  '木器': 'Woodwork',
  '家具': 'Furniture',
  '陶瓷': 'Ceramics',
  '珠宝': 'Jewellery'
};

// Airtable 里个别记录的年代中文位写成了英文（如 item-chrysler-01 的 "Song Dynasty"），反查回中文
const ERA_ZH = {
  'tang': '唐',
  'tang dynasty': '唐',
  'song': '宋',
  'song dynasty': '宋',
  'northern song': '北宋',
  'southern song': '南宋',
  'yuan': '元',
  'yuan dynasty': '元',
  'ming': '明',
  'ming dynasty': '明',
  'early ming': '明早期',
  'mid ming': '明代中期',
  'late ming': '明晚期',
  'qing': '清',
  'qing dynasty': '清',
  'early qing': '清早期',
  'han': '汉',
  'western han': '西汉',
  'eastern han': '东汉',
  'warring states': '战国',
  'sui': '隋',
  'jin': '晋',
  'five dynasties': '五代',
  'republic': '民国',
  'java': '爪哇',
  'central java': '中爪哇',
  'indonesia': '印度尼西亚'
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function loadListings(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = [];
  for (const key of ['todayFinds', 'editorPicks', 'newListing']) {
    const v = data[key];
    if (!v) continue;
    (Array.isArray(v) ? v : [v]).forEach((i) => { if (i && i.item_id) items.push(i); });
  }
  const uniq = new Map();
  items.forEach((i) => { if (!uniq.has(i.item_id)) uniq.set(i.item_id, i); });
  const sellers = new Map();
  (data.sellers || []).forEach((s) => { if (s && s.seller_id) sellers.set(String(s.seller_id).trim(), s); });
  return { items: [...uniq.values()], sellers };
}

// 创始卖家席号：唯一来源是 Airtable sellers 表的 founding_no（经 refresh-listings.js 带进 listings.json）
// 页面里不再写死编号：填了号才显示徽章，没填就不显示，避免出现与 Airtable 不一致的席号
function computeSeats(sellers) {
  const seats = new Map();
  for (const [sid, s] of sellers.entries()) {
    const raw = String((s && s.founding_no) || '').trim();
    if (!raw) continue;
    const numeric = raw.replace(/[^0-9]/g, '');
    seats.set(sid, numeric ? numeric.padStart(3, '0') : raw);
  }
  return seats;
}

function imagesOf(item) {
  return String(item.img_file || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function money(n) {
  return 'S$' + Number(n).toLocaleString('en-SG');
}

function conditionOf(item) {
  if (item.has_surface_damage) {
    return { zh: '有可见瑕疵 · 详见货品说明', en: 'Visible flaws · see listing notes' };
  }
  if (item.has_surface_wear) {
    return { zh: '完整 · 表面有轻微磨损', en: 'Intact · minor surface wear' };
  }
  return { zh: '完整 · 未见明显问题', en: 'Intact · no visible issues' };
}

function priceNumber(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[S$\s,]/gi, ''));
  return isFinite(n) && n > 0 ? n : 0;
}

/* 2026-11-14 价格口径：数字 + 类型，文案按语言自动生成（price_display_* 仅作兜底） */
function priceOf(item) {
  const type = String(item.price_type || '').trim();
  const enquiry = { zh: '私聊询价', en: 'Enquire' };
  if (/私聊|询价|面议|enquir|inquir|message/i.test(type)) return enquiry;
  const fixed = priceNumber(item.fixed_price);
  if (fixed && (!type || /一口价|fixed/i.test(type))) {
    return { zh: money(fixed), en: money(fixed) };
  }
  const lo = priceNumber(item.price_min), hi = priceNumber(item.price_max);
  if (lo && hi && lo !== hi) {
    return {
      zh: `估价区间：${money(lo)}–${money(hi)}`,
      en: `Estimated range: ${money(lo)}–${money(hi)}`
    };
  }
  if (lo) return { zh: `${money(lo)} 起`, en: `From ${money(lo)}` };
  if (hi) return { zh: `至 ${money(hi)}`, en: `Up to ${money(hi)}` };
  if (fixed) return { zh: money(fixed), en: money(fixed) };
  const zh = item.price_display_zh || (item.price_zh ? 'S$' + item.price_zh : '');
  const en = item.price_display_en || (item.price_en ? 'S$' + item.price_en : '');
  return { zh: zh || enquiry.zh, en: en || zh || enquiry.en };
}

/* 2026-11-14 结构化数据价格：一口价给 Offer，区间价给 AggregateOffer，私聊不给价
   （区间价无法用单个 price 表达，用 lowPrice/highPrice 才不会被 Google 判为无效） */
function structuredOffer(item, id) {
  const type = String(item.price_type || '').trim();
  if (/私聊|询价|面议|enquir|inquir|message/i.test(type)) return null;
  const url = `${SITE}/items/${id}`;
  const fixed = priceNumber(item.fixed_price);
  if (fixed && (!type || /一口价|fixed/i.test(type))) {
    return { '@type': 'Offer', price: String(fixed), priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
  }
  const lo = priceNumber(item.price_min), hi = priceNumber(item.price_max);
  if (lo && hi && lo !== hi) {
    return { '@type': 'AggregateOffer', lowPrice: String(lo), highPrice: String(hi), priceCurrency: 'SGD', offerCount: 1, url };
  }
  if (lo) return { '@type': 'Offer', price: String(lo), priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
  if (fixed) return { '@type': 'Offer', price: String(fixed), priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
  return null;
}

function removeFounderBadge(html) {
  const start = html.indexOf('<span class="founder-badge"');
  if (start < 0) return html;
  // 从起点向后扫描 <span 与 </span> 配平，找到该徽章的闭合位置
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const open = html.indexOf('<span', i);
    const close = html.indexOf('</span>', i);
    if (close < 0) break;
    if (open !== -1 && open < close) {
      depth += 1;
      i = open + 5;
    } else {
      depth -= 1;
      i = close + 7;
      if (depth === 0) {
        let end = i;
        while (end < html.length && /[ \t\r\n]/.test(html[end])) end += 1;
        return html.slice(0, start) + html.slice(end);
      }
    }
  }
  return html;
}

function build(item, sellers, seats, template) {
  const id = String(item.item_id).trim();
  const titleZh = String(item.title_zh || id).trim();
  const titleEn = String(item.title_en || titleZh).trim();
  let eraZh = String(item.era_zh || '').trim();
  const eraEn = String(item.era_en || eraZh).trim();
  if (/^[\x00-\x7F]+$/.test(eraZh) && ERA_ZH[eraZh.toLowerCase()]) {
    eraZh = ERA_ZH[eraZh.toLowerCase()];
  }
  const catRaw = String(item.category || '').trim();
  let catZh = catRaw;
  let catEn = CATEGORY_EN[catRaw] || catRaw;
  if (!CATEGORY_EN[catRaw]) {
    // Airtable 里部分记录直接写英文品类，反查成中文，避免中文页出现英文分类
    const hit = Object.keys(CATEGORY_EN).find((k) => CATEGORY_EN[k].toLowerCase() === catRaw.toLowerCase());
    if (hit) { catZh = hit; catEn = CATEGORY_EN[hit]; }
  }

  const sellerKey = String(item.seller_id || '').trim();
  const seller = sellers.get(sellerKey) || {};
  const sellerZh = String(seller.display_zh || item.seller_name_zh || sellerKey).trim();
  const sellerEn = String(seller.display_en || item.seller_name_en || sellerKey).trim();
  const sellerSlug = String(seller.page_url || '').replace(/^\/sellers\//, '').replace(/\.html$/, '') ||
    ('seller-' + sellerKey.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const sellerPage = SITE + '/sellers/' + sellerSlug;

  const imgs = imagesOf(item);
  const mainImg = imgs[0] || '';
  const mainUrl = SITE + '/assets/images/' + mainImg;
  const cond = conditionOf(item);
  const price = priceOf(item);
  const dims = String(item.dimensions || '').trim();

  const metaZh = `${titleZh}」${eraZh}·${catZh}，藏家直供新加坡。`;
  const descZh = `「${titleZh}」${eraZh}·${catZh}，藏家直供新加坡。${titleEn}。Seller-provided; advisory reference only — no authentication, no transaction.`;
  const pageTitle = `${titleZh} | ${titleEn} | Gudong.app`;

  let html = template;
  const stats = { replaced: 0, missing: [] };
  const swap = (needle, value) => {
    if (!html.includes(needle)) { stats.missing.push(needle.slice(0, 40)); return; }
    html = html.split(needle).join(value);
    stats.replaced += 1;
  };

  // 1) 图片占位符 & id（模板里主图写成 {{MAIN_IMAGE}} / {{MAIN_IMAGE_ABS}}，
  //    不再靠猜某个藏品的文件名，换模板也不会静默丢图）
  const needImage = html.includes('{{MAIN_IMAGE}}') || html.includes('{{MAIN_IMAGE_ABS}}');
  if (!needImage) stats.missing.push('{{MAIN_IMAGE}}');
  html = html.split('{{MAIN_IMAGE_ABS}}').join(mainUrl);
  html = html.split('{{MAIN_IMAGE}}').join(mainImg);
  swap('item-ngcy-05', id);

  // 2) 先用正则整段替换 head 里的 title / description / og / twitter / JSON-LD，
  //    再把正文里的简体标题替换掉（顺序反了会让长句中的标题先被替换，导致整段匹配失败）
  const headRules = [
    [/<title>[\s\S]*?<\/title>/, `<title>${esc(pageTitle)}</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descZh)}">`],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(pageTitle)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(descZh)}">`],
    [/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(`${titleZh} | ${titleEn} | Singapore | Gudong.app`)}">`],
    [/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(descZh)}">`],
    [/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${JSON.stringify(Object.assign({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${titleZh} / ${titleEn}`,
      image: mainUrl,
      url: `${SITE}/items/${id}`,
      description: `${titleZh} / ${titleEn}. Seller-provided listing; advisory reference only. Gudong.app does not authenticate the item or handle the transaction.`,
      inLanguage: ['zh-SG', 'en-SG']
    }, (() => { const o = structuredOffer(item, id); return o ? { offers: o } : {}; })()))}</script>`]
  ];
  headRules.forEach(([re, rep]) => {
    if (!re.test(html)) { stats.missing.push(re.source.slice(0, 40)); return; }
    html = html.replace(re, rep);
    stats.replaced += 1;
  });

  // 3) 正文：标题与元信息行
  swap('明代和田玉籽料留皮佛说法山水人物玉山子', esc(titleZh));
  swap('Ming Hotan seed jade boulder carving, skin retained, Buddha preaching, landscape &amp; figures', esc(titleEn));

  // 3) 元信息行 / 规格 / 价格 / 藏家卡
  swap('明 · 玉器 · 藏家：博古斋', esc(`${eraZh} · ${catZh} · 藏家：${sellerZh}`));
  swap('Ming · Jade · Seller: Ng CY Antiques', esc(`${eraEn} · ${catEn} · Seller: ${sellerEn}`));
  swap('data-spec="era_zh">明<', `data-spec="era_zh">${esc(eraZh)}<`);
  swap('data-spec="era_en">Ming<', `data-spec="era_en">${esc(eraEn)}<`);
  swap('data-spec="category">玉器<', `data-spec="category">${esc(catZh)}<`);
  swap('data-spec="category_en">Jade<', `data-spec="category_en">${esc(catEn)}<`);
  swap('data-spec="dimensions">重量：7.8kg · 高度：28cm<', `data-spec="dimensions">${esc(dims)}<`);
  swap('data-spec="dimensions_en">Weight 7.8kg · Height 28cm<', `data-spec="dimensions_en">${esc(dims)}<`);
  swap('data-spec="condition_zh">完整 · 表面有轻微磨损<', `data-spec="condition_zh">${esc(cond.zh)}<`);
  swap('data-spec="condition_en">Intact · minor surface wear<', `data-spec="condition_en">${esc(cond.en)}<`);

  html = html.replace(
    /<div class="item-detail-price">[\s\S]*?<\/div>/,
    `<div class="item-detail-price">
                    <span class="zh">${esc(price.zh)}</span>
                    <span class="en">${esc(price.en)}</span>
                </div>`
  );

  swap('id="sellerNameZh">博古斋<', `id="sellerNameZh">${esc(sellerZh)}<`);
  swap('id="sellerNameEn">Ng CY Antiques<', `id="sellerNameEn">${esc(sellerEn)}<`);
  swap('id="sellerId">Ng-CY<', `id="sellerId">${esc(sellerKey)}<`);
  html = html.split('seller-ng-cy-antiques').join(sellerSlug);
  swap('← 返回 博古斋 私家藏馆', esc(`← 返回 ${sellerZh} 私家藏馆`));
  swap('← Back to Ng CY Antiques', esc(`← Back to ${sellerEn}`));

  // 4) 图集（去文字标签，只留图）
  const gallery = imgs.map((p) => `            { src: '${SITE}/assets/images/${p}' }`).join(',\n');
  html = html.replace(/var defaultImages = \[[\s\S]*?\];/, `var defaultImages = [\n${gallery}\n        ];`);
  html = html.replace(/<span class="image-counter" id="imageCounter">[\d\s/]+<\/span>/,
    `<span class="image-counter" id="imageCounter">1 / ${imgs.length || 1}</span>`);

  // 5) 创始卖家徽章：席号取自 listings 推导的 seats（按最早上架顺序编号），
  //    查不到席号或超出 88 席时移除徽章，避免虚构编号
  const seat = seats.get(sellerKey);
  if (seat && Number(seat) <= 88) {
    html = html.replace(/(<span class="badge-num">)[^<]*(<\/span>)/, `$1${seat}$2`);
  } else {
    html = removeFounderBadge(html);
  }

  if (stats.missing.length) {
    return { html, missing: stats.missing, id };
  }
  return { html, missing: [], id };
}

function main() {
  const { items, sellers } = loadListings(SRC);
  const seats = computeSeats(sellers);
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  let created = 0;
  const createdIds = [];
  const warnings = [];
  const skipped = [];

  for (const item of items) {
    const file = path.join(OUT_DIR, String(item.item_id).trim() + '.html');
    if (fs.existsSync(file) && !FORCE) continue;
    // 没图就不生成：Airtable 未填 img_file 时生成出来的页面主图/og:image 会是空路径
    if (!imagesOf(item).length) {
      skipped.push(`${item.item_id}: 缺少 img_file，跳过（页面主图与 og:image 会为空）`);
      continue;
    }
    const r = build(item, sellers, seats, template);
    if (r.missing.length) {
      warnings.push(`${item.item_id}: 模板片段缺失 → ${r.missing.join(' ; ')}`);
      // 缺失片段时不写文件，避免产出半成品页面
      continue;
    }
    fs.writeFileSync(file, r.html, 'utf8');
    created += 1;
    createdIds.push(item.item_id);
  }

  console.log(`build-item-pages: ${created} page(s) written from ${path.relative(ROOT, SRC)}`);
  if (createdIds.length) console.log('  ' + createdIds.join(', '));
  if (skipped.length) console.log('SKIP:\n  ' + skipped.join('\n  '));
  if (warnings.length) {
    console.log('WARN:');
    warnings.forEach((w) => console.log('  ' + w));
    // 片段缺失属于模板与数据漂移，明确失败以便发现
    process.exitCode = 1;
  }
}

main();
