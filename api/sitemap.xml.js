// /api/sitemap.xml.js
// Dynamic sitemap — static pages hardcoded, /items/ pulled from the SSG snapshot.
// Route: vercel.json rewrites /sitemap.xml -> /api/sitemap.xml
//
// v2 (2026-11-01, snapshot-first):
//  - No longer calls Airtable. Items are read from the static data/listings.json
//    that refresh-listings.js generates at build time, so sitemap generation is
//    always 0-cost and never 504s on a dead Airtable.
//  - lastmod updated for the launch-ready content refresh.
import fs from 'fs';
import path from 'path';

const SITE = 'https://www.gudong.app';
const LAUNCH = '2026-11-01';

// ---------- Static pages (no data dependency) ----------
// lastmod format: YYYY-MM-DD.
const STATIC = [
  { loc: '/',                       lastmod: LAUNCH },
  { loc: '/about',                  lastmod: LAUNCH },
  { loc: '/collection',             lastmod: LAUNCH },
  { loc: '/insights',                lastmod: LAUNCH },
  { loc: '/pricing',                 lastmod: LAUNCH },
  { loc: '/privacy',                lastmod: LAUNCH },
  { loc: '/terms',                  lastmod: LAUNCH },
  { loc: '/sellers/',                lastmod: LAUNCH },
  { loc: '/tools/',                 lastmod: LAUNCH },
  // Collector utility tools
  { loc: '/tools/era-lookup',        lastmod: LAUNCH },
  { loc: '/tools/ganzhi',            lastmod: LAUNCH },
  { loc: '/tools/year-since',        lastmod: LAUNCH },
  { loc: '/tools/mark-lookup',       lastmod: LAUNCH },
  { loc: '/tools/valuation',         lastmod: LAUNCH },
  { loc: '/tools/checklist',         lastmod: LAUNCH },
  { loc: '/tools/contract',          lastmod: LAUNCH },
  // Categories
  { loc: '/categories/bronze',     lastmod: LAUNCH },
  { loc: '/categories/coins',       lastmod: LAUNCH },
  { loc: '/categories/jade',         lastmod: LAUNCH },
  { loc: '/categories/misc',        lastmod: LAUNCH },
  { loc: '/categories/paintings',   lastmod: LAUNCH },
  { loc: '/categories/porcelain',   lastmod: LAUNCH },
  // Legacy / orphan gallery page (not in listings.json sellers)
  { loc: '/sellers/seller-lim-ck',  lastmod: LAUNCH },
  // Insights articles (static slugs)
  ...[
    'amber-baked-vs-natural','ancient-jade-stains','antique-shipping','auction-house-watch',
    'bamboo-ivory-cracks','bronze-age-copper','bronze-censer-patina','bronze-patina-soil',
    'burial-climate-north-south','canton-thirteen-hongs','coin-aging-tricks','coin-casting-dating',
    'coin-cleaning','coin-patina-types','conservator-questions','first-collection',
    'furniture-joinery-dating','furniture-patina','glaze-crackle-basics','grand-canal-porcelain',
    'hetian-seeds-vs-mountain','how-to-brief-a-sourcing','how-to-negotiate','how-to-store-collection',
    'jade-buyer-pitfalls','jade-road-hetian','jade-tool-marks','jadeite-abc',
    'jingdezhen-geography','late-qing-outflow','malacca-strait-antiques','maritime-silk-road-ports',
    'metal-jade-cleaning','ming-furniture-minimalism','ming-porcelain-dating','nyonya-ware',
    'painting-mold-rescue','painting-mounting','painting-prints-vs-hand','painting-seals-signatures',
    'porcelain-aging-tricks','porcelain-crack-repair','porcelain-marks','provenance-basics',
    'qing-porcelain-dating','qing-three-reigns-porcelain','qinghua-cobalt','quanzhou-yuan-blue',
    'republic-antique-fakes','republic-porcelain-dating','restoration-process','silver-dollar-edges',
    'silver-patina','singapore-chinese-antiques','singapore-coin-market','singapore-dealers-history',
    'singapore-flea-market-map','singapore-jade-market','singapore-painting-market','singapore-porcelain-market',
    'song-five-kilns','storage-mistakes','sumali-cobalt-origin','sumali-cobalt-zhenghe',
    'tang-ceramics-trade','what-is-jianlou','woodware-oil-damage','xuande-censer-legacy',
    'yangtze-kilns','zhushan-eight-friends',
  ].map(slug => ({ loc: `/insights/${slug}`, lastmod: LAUNCH })),
];

// ---------- Read the SSG snapshot for live item URLs ----------
// 定位 data/listings.json 所在目录。关键约束：Vercel 会把本函数打包成 CJS 运行
// （package.json 无 "type":"module"），此时 import.meta 是 ESM 专属语法，会被
// 当成 SyntaxError 导致整个函数加载失败(500)——绝不能用 import.meta.url。
// 正确做法：优先用 Vercel CJS 运行时提供的 __dirname，原生 ESM 下退回 process.cwd()。
function snapshotDir() {
  if (typeof __dirname !== 'undefined') return __dirname;
  return process.cwd();
}
function readSnapshot() {
  const here = snapshotDir();
  const candidates = [
    path.join(process.cwd(), 'data', 'listings.json'),
    path.join(here, '..', 'data', 'listings.json'),
    path.join(here, 'data', 'listings.json'),
    'data/listings.json',
    './data/listings.json',
  ];
  for (const p of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j && Array.isArray(j.newListing)) return { ok: true, data: j };
    } catch (e) { /* try next */ }
  }
  return { ok: false };
}

function toDateStr(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildXml(staticUrls, items, sellers) {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>'];
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const u of staticUrls) {
    parts.push(`  <url>`);
    parts.push(`    <loc>${esc(SITE + u.loc)}</loc>`);
    if (u.lastmod) parts.push(`    <lastmod>${esc(u.lastmod)}</lastmod>`);
    parts.push(`  </url>`);
  }
  for (const s of sellers) {
    parts.push(`  <url>`);
    parts.push(`    <loc>${esc(SITE + s.loc)}</loc>`);
    if (s.lastmod) parts.push(`    <lastmod>${esc(s.lastmod)}</lastmod>`);
    parts.push(`  </url>`);
  }
  for (const it of items) {
    parts.push(`  <url>`);
    // Use the always-resolvable SPA route. Brand-new Airtable items have no
    // pre-rendered /items/<id>.html yet, so /item?id=<id> is the safe choice.
    parts.push(`    <loc>${esc(SITE + '/item?id=' + it.item_id)}</loc>`);
    if (it.lastmod) parts.push(`    <lastmod>${esc(it.lastmod)}</lastmod>`);
    parts.push(`  </url>`);
  }
  parts.push('</urlset>');
  return parts.join('\n');
}

export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const snap = readSnapshot();
  const items = (snap.ok && Array.isArray(snap.data.newListing))
    ? snap.data.newListing
        .map(it => ({ item_id: String(it.item_id || ''), lastmod: toDateStr(it._createdTime || it.listed_at || '') }))
        .filter(it => it.item_id)
    : [];

  // 卖家（专属藏馆）：从 SSG 快照 data/listings.json.sellers 自动生成，
  // 新卖家开馆后无需再手工加链接；page_url 去 .html 即干净路由（cleanUrls）。
  const sellers = (snap.ok && Array.isArray(snap.data.sellers))
    ? snap.data.sellers
        .filter(s => s && s.seller_id)
        .map(s => {
          // page_url 在 Airtable 里可能存为相对路径（如 "../sellers/seller-xxx.html"）。
          // 统一规范为绝对路由：去 "../"、去 .html、去末尾斜杠，缺 "/" 前缀则补上。
          const raw = String(s.page_url || '').trim().replace(/^\.\.\//, '');
          const clean = raw.replace(/\.html$/, '').replace(/\/+$/g, '');
          const loc = (clean.startsWith('/') ? clean : '/' + clean)
            || `/sellers/seller-${slugify(s.seller_id)}-antiques`;
          return { loc, lastmod: toDateStr(s.since_year ? `${s.since_year}-01-01` : '') || LAUNCH };
        })
        .filter(s => s.loc.startsWith('/sellers/'))
    : [];

  const xml = buildXml(STATIC, items, sellers);
  res.status(200).send(xml);
}

function slugify(id) {
  return String(id == null ? '' : id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
