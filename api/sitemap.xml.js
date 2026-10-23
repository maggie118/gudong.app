// /api/sitemap.xml.js
// Dynamic sitemap — static pages hardcoded, /items/ pulled live from Airtable.
// Route: vercel.json rewrites /sitemap.xml -> /api/sitemap.xml
//
// Behavior:
//  - Static pages (about/categories/insights/tools/sellers/etc.) are listed below.
//  - /items/<item_id> URLs are fetched from Airtable every request (edge-cached 1h).
//  - If Airtable is unreachable, falls back to the known 15 seed item IDs so
//    Google always receives a valid, non-empty sitemap.
//
// Env: reuses AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN (same as airtable-proxy.js).

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;

const SITE = 'https://www.gudong.app';

// ---------- Static pages (no Airtable dependency) ----------
// lastmod format: YYYY-MM-DD. Update when a static page's content changes.
const STATIC = [
  { loc: '/',                       lastmod: '2026-10-14' },
  { loc: '/about',                  lastmod: '2026-10-15' },
  { loc: '/collection',             lastmod: '2026-10-15' },
  { loc: '/insights',                lastmod: '2026-10-15' },
  { loc: '/pricing',                 lastmod: '2026-10-15' },
  { loc: '/privacy',                lastmod: '2026-10-15' },
  { loc: '/terms',                  lastmod: '2026-10-15' },
  { loc: '/sellers/',                lastmod: '2026-10-15' },
  { loc: '/tools/',                 lastmod: '2026-10-15' },
  { loc: '/tools/currency-convert', lastmod: '2026-10-15' },
  { loc: '/tools/era-lookup',        lastmod: '2026-10-15' },
  { loc: '/tools/ganzhi',            lastmod: '2026-10-15' },
  { loc: '/tools/year-since',        lastmod: '2026-10-15' },
  { loc: '/tools/mark-lookup',       lastmod: '2026-10-23' },
  { loc: '/tools/valuation',         lastmod: '2026-10-23' },
  { loc: '/tools/contract',          lastmod: '2026-10-23' },
  // Categories
  { loc: '/categories/bronze',     lastmod: '2026-10-15' },
  { loc: '/categories/coins',       lastmod: '2026-10-15' },
  { loc: '/categories/jade',         lastmod: '2026-10-15' },
  { loc: '/categories/misc',        lastmod: '2026-10-15' },
  { loc: '/categories/paintings',   lastmod: '2026-10-15' },
  { loc: '/categories/porcelain',   lastmod: '2026-10-15' },
  // Sellers
  { loc: '/sellers/seller-lim-kw-antiques',  lastmod: '2026-10-15' },
  { loc: '/sellers/seller-ng-cy-antiques',   lastmod: '2026-10-15' },
  { loc: '/sellers/seller-ng-lk-antiques',   lastmod: '2026-10-15' },
  { loc: '/sellers/seller-yak-bc-antiques',  lastmod: '2026-10-15' },
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
  ].map(slug => ({ loc: `/insights/${slug}`, lastmod: '2026-10-15' })),
];

// Fallback item IDs used when Airtable is unreachable.
const FALLBACK_ITEM_IDS = [
  'item-lim-01','item-lim-02','item-lim-03','item-lim-04',
  'item-ng-01','item-ng-02','item-ng-03',
  'item-ngcy-01','item-ngcy-02','item-ngcy-03','item-ngcy-04','item-ngcy-05',
  'item-yak-01','item-yak-02','item-yak-03',
];

const HYPHEN_VARIANTS = /[‐‑‒–—―−﹘－]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

function toDateStr(v) {
  if (!v) return '';
  // Airtable dates come as YYYY-MM-DD or ISO datetime; take first 10 chars.
  return String(v).slice(0, 10);
}

// Hard budget for the whole Airtable pull. We must respond well under Vercel's
// function timeout so a slow/dead Airtable never surfaces as a 504 to Google
// (this was the root cause of GSC "无法抓取" on first cold fetch).
const UPSTREAM_BUDGET_MS = 4000;
const PER_PAGE_TIMEOUT_MS = 2500;
const MAX_PAGES = 5; // 5 x 100 = 500 records is plenty for this catalog.

async function fetchActiveItemIds() {
  if (!BASE || !TABLE || !TOKEN) return null; // signal "upstream unavailable"
  const startedAt = Date.now();
  const records = [];
  let offset = null;
  let pages = 0;
  do {
    // Stop early if we are running out of budget — partial results are fine,
    // the caller merges with the seed fallback below.
    if (Date.now() - startedAt > UPSTREAM_BUDGET_MS) break;
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PER_PAGE_TIMEOUT_MS);
    let r;
    try {
      r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${TOKEN}` }, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) throw new Error(`airtable ${r.status}`);
    const j = await r.json();
    records.push(...(j.records || []));
    offset = j.offset || null;
    pages += 1;
  } while (offset && pages < MAX_PAGES);

  // Keep only active items with a non-empty item_id; dedupe.
  const seen = new Set();
  const out = [];
  for (const rec of records) {
    const f = rec.fields || {};
    const status = String(f.status || '').trim().toLowerCase();
    if (status !== 'active') continue;
    const id = normHyphen(f.item_id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ item_id: id, lastmod: toDateStr(f.listed_at || rec.createdTime) });
  }
  return out;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildXml(staticUrls, items) {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>'];
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const u of staticUrls) {
    parts.push(`  <url>`);
    parts.push(`    <loc>${esc(SITE + u.loc)}</loc>`);
    if (u.lastmod) parts.push(`    <lastmod>${esc(u.lastmod)}</lastmod>`);
    parts.push(`  </url>`);
  }
  for (const it of items) {
    parts.push(`  <url>`);
    // Use the live SPA route /item?id=<id>. The /items/<id> pretty URL only
    // works for pre-rendered static pages in /items/*; brand-new Airtable items
    // have no static html yet and 404 there. Since this sitemap pulls items
    // LIVE from Airtable, every item must point to the route that always resolves.
    parts.push(`    <loc>${esc(SITE + '/item?id=' + it.item_id)}</loc>`);
    if (it.lastmod) parts.push(`    <lastmod>${esc(it.lastmod)}</lastmod>`);
    parts.push(`  </url>`);
  }
  parts.push('</urlset>');
  return parts.join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Edge-cached 1h; serve stale for 1 day while revalidating.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  let items = null;
  let upstreamFailed = false;
  try {
    items = await fetchActiveItemIds();
  } catch (e) {
    upstreamFailed = true;
    console.warn('[sitemap] airtable fetch failed, using fallback:', e.message);
  }
  if (!items) {
    upstreamFailed = true;
    items = FALLBACK_ITEM_IDS.map(id => ({ item_id: id, lastmod: '' }));
  }

  const xml = buildXml(STATIC, items);
  res.status(200).send(xml);
}
