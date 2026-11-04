// scripts/build-sellers.js
// =====================================================================
// 卖家「专属线上藏馆」自动建馆生成器（穷版 SSG）
// ---------------------------------------------------------------------
// 输入：data/listings.json（由 refresh-listings.js 在 Vercel build 时从
//       Airtable 生成；其中 sellers[] 含每位卖家的资料与 gallery 付费标志）
// 输出：
//   1) sellers/seller-<slug>-antiques.html —— 卖家专属藏馆页（静态，SEO/离线友好）
//   2) 专属网址二维码：
//        - 内嵌进藏馆页（扫码直达该藏馆）
//        - assets/qr/seller-<slug>-antiques.{svg,png}  —— 供卖家印制名片/展签
//   3) sellers/index.html —— 藏家目录页，自动同步所有已开通卖家
//
// 「自动」的含义：
//   Airtable Sellers 表把卖家的 gallery 字段置为 true（= 已付费开通）
//   -> 下一次 Vercel 部署/build 时本脚本自动为其建馆 + 生成二维码。
//   已存在页面的老卖家默认视为已开通（向后兼容），照常重建并补齐二维码。
//
// 用法：
//   node scripts/build-sellers.js                  # 为所有「已开通」卖家建馆
//   node scripts/build-sellers.js --seller <slug>  # 只重建某一家（即使未标 gallery）
//   node scripts/build-sellers.js --all            # 强制为 data 中所有卖家建馆
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const QR = require('qrcode');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'listings.json');
const SEED_FILE = path.join(__dirname, 'seller-gallery-seed.html');
const SELLERS_DIR = path.join(ROOT, 'sellers');
const INDEX_FILE = path.join(SELLERS_DIR, 'index.html');
const QR_DIR = path.join(ROOT, 'assets', 'qr');
const SITE_BASE = 'https://www.gudong.app';

const log = (...a) => console.log('[build-sellers]', ...a);

/* ---------- 工具 ---------- */
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// seller_id 'Lim-KW' -> slug 'lim-kw'
function slugify(id) {
  return String(id == null ? '' : id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// 精确替换（对中文/符号安全，避免正则转义问题）
function replaceAll(h, oldStr, newStr) {
  if (oldStr === newStr) return h;
  return h.split(oldStr).join(newStr);
}

/* ---------- 藏馆展示期（与 refresh-listings.js 一致） ---------- */
const GALLERY_DISPLAY_MONTHS = 12;
function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
// 到期日：显式 gallery_expires_at 优先，否则 gallery_started_at +1 年
function galleryExpiry(s) {
  if (s.gallery_expires_at) return s.gallery_expires_at;
  if (!s.gallery_started_at) return '';
  return addMonths(new Date(s.gallery_started_at), GALLERY_DISPLAY_MONTHS).toISOString().slice(0, 10);
}
function isGalleryExpired(s, todayStr) {
  const e = galleryExpiry(s);
  return !!(e && e <= todayStr);
}

/* ---------- 种子模板中所有「卖家相关」锚点的精确原文 ---------- */
// 以 scripts/templates/seller-gallery-seed.html（Lim-KW 页快照）为种子，
// 下列字符串与种子完全一致；生成时逐条替换。
const SEED = {
  TITLE: '林记古玩 Lim KW Antiques｜新加坡高古青铜与明清瓷器 | Gudong.app',
  DESC: '林记古玩（Lim KW Antiques）私家藏馆，高古青铜与明清瓷器。直连藏家看馆藏、WhatsApp 议价。Gudong.app 仅展示信息，不鉴定、不经手交易。',
  CANON: 'https://www.gudong.app/sellers/seller-lim-kw-antiques',
  JSONLD: '{"@context":"https://schema.org","@type":"Organization","name":"林记古玩 | Lim KW Antiques","description":"高古青铜与明清瓷器，多年收藏心得。 Archaic bronzes and Ming-Qing porcelain — years of collecting experience.","url":"https://www.gudong.app/sellers/seller-lim-kw-antiques","address":{"@type":"PostalAddress","addressLocality":"Singapore","addressCountry":"SG"},"areaServed":["SG","MY","SEA"],"inLanguage":["zh-SG","en-SG"]}',
  TW_TITLE: '林记古玩 | Lim KW Antiques | Antique ga | Singapore | Gudong.app',
  TW_DESC: '古董圈「林记古玩」私家藏馆，面向新加坡及海外藏家，浏览藏品并通过 WhatsApp 联系发布者；平台不提供古董鉴定，不参与藏品交易。 Gudong.app is a listing platform, does not authenticate antiques or participate in transactions. For collectors.',
  BREAD_ZH: '> / 林记古玩<',
  BREAD_EN: '> / Lim KW Antiques<',
  NAME_ZH: 'id="sellerNameZh">林记古玩<',
  NAME_EN: 'id="sellerNameEn">Lim KW Antiques<',
  SID: 'id="sellerId">Lim-KW<',
  BIO_ZH: 'id="bioZh">专注高古青铜与明清瓷器，多年古董收藏经验。<',
  BIO_EN: 'id="bioEn">Specialising in archaic bronzes and Ming-Qing porcelain with years of antique expertise.<',
  CONST_SID: "const SELLER_ID = 'Lim-KW';",
  CONST_SINCE: "let SELLER_SINCE = '2026';",
  CONST_IMG: "const SELLER_IMG_DIR = 'lim-kw';",
  // 创始藏家编号占位（seed 中两处，均以 001 为占位；生成时按卖家 founding_no 注入或整段移除。注意 seed 为 CRLF 行尾）
  FOUNDER_BADGE: '                    <!-- 创始藏家编号：按分配表填该藏家的号，如 001/002/003…（全局唯一，勿与他人重复） -->\r\n                    <span class="badge-num">001</span>',
  FOUNDER_META: '                <!-- 创始藏家编号：与上方徽章同号 -->\r\n                <span><span class="zh">创始藏家编号</span><span class="en">Founding No.</span>：<b id="founderNo">001</b></span>',
};

// 每家卖家的替换值（基于数据计算）
function valuesFor(seller) {
  const slug = slugify(seller.seller_id);
  const nameZh = seller.display_zh || seller.seller_name_zh || slug;
  const nameEn = seller.display_en || seller.seller_name_en || '';
  const focusZh = seller.title_focus || '新加坡古董藏家私家藏馆';
  const introZh = seller.intro_zh || '古董收藏爱好者，欢迎交流。';
  const introEn = seller.intro_en || 'Antique collector. Welcome to connect.';
  const since = seller.since_year || '2026';
  const pageFile = `seller-${slug}-antiques.html`;
  const canon = `${SITE_BASE}/sellers/seller-${slug}-antiques`;
  const title = `${nameZh} ${nameEn}｜${focusZh} | Gudong.app`;
  const desc = `${nameZh}（${nameEn}）私家藏馆。${introZh} 直连藏家看馆藏、WhatsApp 议价。Gudong.app 仅展示信息，不鉴定、不经手交易。`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: `${nameZh} | ${nameEn}`,
    description: `${introZh} ${introEn}`,
    url: canon,
    address: { '@type': 'PostalAddress', addressLocality: 'Singapore', addressCountry: 'SG' },
    areaServed: ['SG', 'MY', 'SEA'],
    inLanguage: ['zh-SG', 'en-SG'],
  });
  return {
    slug, nameZh, nameEn, introZh, introEn, since, pageFile, canon, title, desc, jsonld,
    twTitle: `${nameZh} | ${nameEn} | Singapore Antique Collector | Gudong.app`,
    twDesc: `古董圈「${nameZh}」私家藏馆，面向新加坡及海外藏家，浏览藏品并通过 WhatsApp 联系发布者；平台不提供古董鉴定，不参与藏品交易。 Gudong.app is a listing platform, does not authenticate antiques or participate in transactions. For collectors.`,
  };
}

/* ---------- 生成单家藏馆页 ---------- */
function buildPage(seller, seedHtml) {
  const v = valuesFor(seller);
  let h = seedHtml;
  // 先替换 JSON-LD（其字符串内嵌原 url，必须先于 CANON 替换，否则整串失配）
  h = replaceAll(h, SEED.JSONLD, v.jsonld);
  h = replaceAll(h, SEED.TITLE, v.title);
  h = replaceAll(h, SEED.DESC, v.desc);
  h = replaceAll(h, SEED.CANON, v.canon); // canonical + og:url 同步
  h = replaceAll(h, SEED.TW_TITLE, v.twTitle);
  h = replaceAll(h, SEED.TW_DESC, v.twDesc);
  h = replaceAll(h, SEED.BREAD_ZH, `> / ${escHtml(v.nameZh)}<`);
  h = replaceAll(h, SEED.BREAD_EN, `> / ${escHtml(v.nameEn)}<`);
  h = replaceAll(h, SEED.NAME_ZH, `id="sellerNameZh">${escHtml(v.nameZh)}<`);
  h = replaceAll(h, SEED.NAME_EN, `id="sellerNameEn">${escHtml(v.nameEn)}<`);
  h = replaceAll(h, SEED.SID, `id="sellerId">${escHtml(seller.seller_id)}<`);
  h = replaceAll(h, SEED.BIO_ZH, `id="bioZh">${escHtml(v.introZh)}<`);
  h = replaceAll(h, SEED.BIO_EN, `id="bioEn">${escHtml(v.introEn)}<`);
  h = replaceAll(h, SEED.CONST_SID, `const SELLER_ID = '${seller.seller_id}';`);
  h = replaceAll(h, SEED.CONST_SINCE, `let SELLER_SINCE = '${v.since}';`);
  h = replaceAll(h, SEED.CONST_IMG, `const SELLER_IMG_DIR = '${v.slug}';`);

  // 创始藏家编号：按卖家数据注入（未分配则整段移除，避免所有卖家都显示占位号）
  const foundingNo = String(seller.founding_no == null ? '' : seller.founding_no).trim();
  if (foundingNo) {
    h = replaceAll(h, SEED.FOUNDER_BADGE, `                    <!-- 创始藏家编号：${escHtml(foundingNo)} -->\r\n                    <span class="badge-num">${escHtml(foundingNo)}</span>`);
    h = replaceAll(h, SEED.FOUNDER_META, `                <span><span class="zh">创始藏家编号</span><span class="en">Founding No.</span>：<b id="founderNo">${escHtml(foundingNo)}</b></span>`);
  } else {
    h = replaceAll(h, SEED.FOUNDER_BADGE, '');
    h = replaceAll(h, SEED.FOUNDER_META, '');
  }

  // 注入「专属网址 + 二维码」区块
  h = injectQrSection(h, v);
  return h;
}

/* ---------- 生成二维码区块（内嵌 SVG + 专属网址） ---------- */
function injectQrSection(h, v) {
  const svg = fs.readFileSync(path.join(QR_DIR, `seller-${v.slug}-antiques.svg`), 'utf8');
  const style = `
<style>
.museum-qr { margin-top: 1.6rem; }
.qr-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--card-radius); padding: 1.6rem 1.8rem;
  display: flex; flex-direction: column; align-items: center; gap: .7rem;
  text-align: center;
}
.qr-eyebrow { font-size: .72rem; letter-spacing: .22em; text-transform: uppercase; color: var(--color-gold); font-weight: 700; }
.qr-title { font-size: 1.05rem; font-weight: 700; color: var(--color-text); }
.qr-img { width: min(188px, 100%); height: auto; max-width: 100%; border: 1px solid var(--color-border); border-radius: 8px; padding: 6px; background: #fff; }
.qr-url { font-size: .82rem; color: var(--color-text-secondary); word-break: break-all; }
.qr-note { font-size: .76rem; color: var(--color-text-muted); line-height: 1.6; max-width: 480px; }
@media (max-width: 560px) { .qr-img { width: min(168px, 100%); height: auto; } }
</style>
<section class="museum-qr">
  <div class="qr-card">
    <span class="qr-eyebrow">Scan to open</span>
    <div class="qr-title"><span class="zh">专属网址 · 扫码直达本藏馆</span><span class="en">Your gallery · scan to open</span></div>
    ${svg.replace(/<svg/, '<svg class="qr-img"')}
    <div class="qr-url">${escHtml(v.canon)}</div>
    <div class="qr-note"><span class="zh">将此二维码印在名片、展柜或展签上，买家扫码即可直达您的专属藏馆。</span><span class="en">Print this QR on your card, case or label — collectors scan to open your private gallery instantly.</span></div>
  </div>
</section>`;
  return h.replace('</main>', style + '\n    </main>');
}

/* ---------- 生成卖家目录页 index.html ---------- */
function buildIndex(seedIndex, enabled, items) {
  const cards = enabled.map(s => {
    const v = valuesFor(s);
    const count = items.filter(f => {
      const sid = String(f.seller_id || '').replace(/[^A-Za-z0-9-]/g, '-');
      return slugify(sid) === v.slug || sid === s.seller_id;
    }).length;
    const foundingNo = String(s.founding_no == null ? '' : s.founding_no).trim();
    const founderBadge = foundingNo ? `                        <span class="badge-num">${escHtml(foundingNo)}</span>` : '';
    return `            <a href="${v.canon}" class="gallery-card" data-seller-id="${escHtml(s.seller_id)}">
                <div class="gallery-badge zh">新入驻</div><div class="gallery-badge en">New</div>
                <div class="gallery-name">
                    <span class="zh">${escHtml(v.nameZh)}</span><span class="en">${escHtml(v.nameEn)}</span>
                    <span class="founder-badge" title="创始藏家 · ${escHtml(String(v.since))}" aria-label="Founding Collector ${escHtml(String(v.since))}">
                        <img class="founder-badge-icon" src="../assets/images/founder-crown-badge.webp" alt="创始藏家 Founder Collector">
${founderBadge}
                    </span>
                </div>
                <div class="gallery-desc zh">${escHtml(v.introZh)}</div>
                <div class="gallery-desc en">${escHtml(v.introEn)}</div>
                <div class="gallery-stats zh">藏品数：${count} · 入驻：${escHtml(String(v.since))}年</div>
                <div class="gallery-stats en">${count} ${count === 1 ? 'item' : 'items'} · Joined ${escHtml(String(v.since))}</div>
                <div class="gallery-link zh">进入藏馆 →</div><div class="gallery-link en">Enter Gallery →</div>
            </a>`;
  }).join('\n');

  // 只替换目录网格块（<div class="gallery-grid"> ... </main>）
  const start = seedIndex.indexOf('<div class="gallery-grid">');
  if (start < 0) {
    throw new Error('index.html 中找不到 .gallery-grid 块');
  }
  const end = seedIndex.indexOf('</main>', start);
  if (end < 0) throw new Error('index.html 中找不到 </main>');
  const rebuilt =
    '        <div class="gallery-grid">\n' + cards + '\n        </div>\n    </main>';
  return seedIndex.slice(0, start) + rebuilt + seedIndex.slice(end + '</main>'.length);
}

/* ---------- 主流程 ---------- */
async function main() {
  const argv = process.argv.slice(2);
  const only = (() => {
    const i = argv.indexOf('--seller');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  })();
  const forceAll = argv.includes('--all');

  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    log('无法读取 data/listings.json:', e.message);
    process.exit(1);
  }
  const sellers = Array.isArray(data.sellers) ? data.sellers : [];
  const items = Array.isArray(data.newListing) ? data.newListing : [];

  if (!sellers.length) {
    log('listings.json 中没有卖家数据，跳过建馆。');
    process.exit(0);
  }

  const seedHtml = fs.readFileSync(SEED_FILE, 'utf8');
  const seedIndex = fs.readFileSync(INDEX_FILE, 'utf8');

  fs.mkdirSync(QR_DIR, { recursive: true });

  const todayStr = new Date().toISOString().slice(0, 10);
  // 有效卖家 slug 集合：展示期未到的全部卖家（含未标 gallery 的），用于孤儿页清理
  const activeSlugs = new Set(
    sellers.filter(s => !isGalleryExpired(s, todayStr)).map(s => slugify(s.seller_id))
  );
  const enabled = [];
  let built = 0;
  let skippedExpired = 0;
  for (const s of sellers) {
    const slug = slugify(s.seller_id);
    const pageFile = path.join(SELLERS_DIR, `seller-${slug}-antiques.html`);
    const isFlagged = s.gallery === true || s.gallery === 'true' || s.gallery === 1;
    const pageExists = fs.existsSync(pageFile);
    // 展示期已到的藏馆一律不再对外建馆（业务规则，优先于 --all/--seller）
    if (isGalleryExpired(s, todayStr)) {
      log(`藏馆展示期已到，跳过并待清理: ${s.seller_id}（${galleryExpiry(s)}）`);
      skippedExpired++;
      continue;
    }
    const shouldBuild = forceAll || (only && only === slug) || isFlagged || pageExists;
    if (!shouldBuild) continue;

    // 生成二维码资产（SVG 内嵌用 + PNG 印制用）
    const canon = `${SITE_BASE}/sellers/seller-${slug}-antiques`;
    const svg = await QR.toString(canon, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, width: 480 });
    fs.writeFileSync(path.join(QR_DIR, `seller-${slug}-antiques.svg`), svg, 'utf8');
    await QR.toFile(path.join(QR_DIR, `seller-${slug}-antiques.png`), canon, { width: 480, errorCorrectionLevel: 'M', margin: 2 });
    log(`生成二维码: assets/qr/seller-${slug}-antiques.{svg,png}`);

    const pageHtml = buildPage(s, seedHtml);
    fs.writeFileSync(pageFile, pageHtml, 'utf8');
    log(`生成藏馆页: ${path.relative(ROOT, pageFile)}  (专属网址 ${canon})`);
    enabled.push(s);
    built++;
  }

  if (only) {
    log(`已重建指定卖家: ${only}`);
    return;
  }

  // 目录页：所有「已开通」卖家（已生成页面的）
  if (enabled.length) {
    fs.writeFileSync(INDEX_FILE, buildIndex(seedIndex, enabled, items), 'utf8');
    log(`更新目录页: sellers/index.html（${enabled.length} 家）`);
  } else {
    log('本轮没有需要建馆/更新的卖家（gallery 未开启且页面不存在）。');
  }

  // —— 到期/下架清理：删除已不在有效卖家集合内的藏馆页 + 二维码 ——
  // 有效卖家 = 当前数据中展示期未到的卖家 slug；过期藏馆（refresh 已从
  // data.sellers 移除）或手动下架者，其旧页面与二维码在此删除，避免残留访问。
  cleanupOrphanGalleries(activeSlugs);

  log(`完成：新建/重建 ${built} 家藏馆${skippedExpired ? `，跳过到期 ${skippedExpired} 家` : ''}。`);
}

/* ---------- 清理孤儿藏馆页 + 二维码 ---------- */
function cleanupOrphanGalleries(activeSlugs) {
  let removed = 0;
  let files;
  try {
    files = fs.readdirSync(SELLERS_DIR);
  } catch (e) {
    log('无法读取 sellers/ 目录，跳过清理:', e.message);
    return;
  }
  for (const f of files) {
    // 只处理自动生成的藏馆页模式 seller-<slug>-antiques.html，绝不动手写页
    const m = /^seller-(.+?)-antiques\.html$/.exec(f);
    if (!m) continue;
    const slug = m[1];
    if (activeSlugs.has(slug)) continue;
    const page = path.join(SELLERS_DIR, f);
    try {
      fs.unlinkSync(page);
      removed++;
      log(`下架删除藏馆页: ${f}`);
    } catch (e) { log('删除藏馆页失败:', f, e.message); }
    // 同步删除对应二维码资产
    for (const ext of ['svg', 'png']) {
      const qr = path.join(QR_DIR, `seller-${slug}-antiques.${ext}`);
      try {
        if (fs.existsSync(qr)) { fs.unlinkSync(qr); log(`下架删除二维码: seller-${slug}-antiques.${ext}`); }
      } catch (e) { log('删除二维码失败:', qr, e.message); }
    }
  }
  if (removed) log(`已下架清理 ${removed} 家过期/失效藏馆。`);
}

main().catch(e => {
  log('建馆失败:', e && e.message);
  process.exit(1);
});
