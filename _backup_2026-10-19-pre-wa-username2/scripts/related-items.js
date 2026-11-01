/**
 * 古董圈 · 文章页转化闭环共享模块
 * ------------------------------------------------
 * 1. related-items：每篇文章底部"看看相关藏品"CTA（文章 → listing 最短成交路径）
 * 2. monthly-brief：本地行情系列"月度行情简报"回访锚点
 *
 * 使用方：
 *   - scripts/apply-related-items.js   （批量修补现有 insights/*.html）
 *   - build-insights.js                （重建文章时经模板占位符注入，防止功能回退）
 */

'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ============ 藏品库（与 items/*.html、data/listings.json 保持一致） ============ */
const ITEMS = {
  'lim-01':  { id: 'item-lim-01',  img: 'lim-kw/item-lim-01.jpg',  titleZh: '大明宣德青花描金云龙纹扁瓶',            titleEn: 'Ming Xuande Blue-and-White Gilt Dragon Flat Vase',   eraZh: '明宣德',  eraEn: 'Ming Xuande',    catZh: '瓷器', catEn: 'Porcelain', priceZh: '一口价 S$5000',      priceEn: 'S$5000' },
  'lim-02':  { id: 'item-lim-02',  img: 'lim-kw/item-lim-02.jpg',  titleZh: '战国青铜错金乳钉双耳四足方鼎',            titleEn: 'Warring-States Gold-Inlaid Bronze Ding',            eraZh: '战国',    eraEn: 'Warring States', catZh: '铜器', catEn: 'Bronze',   priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'lim-03':  { id: 'item-lim-03',  img: 'lim-kw/item-lim-03.jpg',  titleZh: '战国错金银青铜瑞兽摆件',                  titleEn: 'Warring-States Gold-Silver Inlaid Bronze Beast',     eraZh: '战国',    eraEn: 'Warring States', catZh: '铜器', catEn: 'Bronze',   priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'lim-04':  { id: 'item-lim-04',  img: 'lim-kw/item-lim-04.jpg',  titleZh: '大清雍正年制款窑变釉贯耳瓶',              titleEn: 'Yongzheng Flambe-Glaze Vase',                        eraZh: '清雍正',  eraEn: 'Qing Yongzheng', catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ng-01':   { id: 'item-ng-01',   img: 'ng-lk/item-ng-01.jpg',   titleZh: '商周青铜饕餮纹方罍',                      titleEn: 'Shang-Zhou Bronze Square Lei',                       eraZh: '商周',    eraEn: 'Shang-Zhou',     catZh: '铜器', catEn: 'Bronze',   priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ng-02':   { id: 'item-ng-02',   img: 'ng-lk/item-ng-02.jpg',   titleZh: '汉代鎏金神人车马纹青铜镜',                titleEn: 'Han Gilt Bronze Mirror',                              eraZh: '汉',      eraEn: 'Han',            catZh: '铜器', catEn: 'Bronze',   priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ng-03':   { id: 'item-ng-03',   img: 'ng-lk/item-ng-03.jpg',   titleZh: '清乾隆黄地粉彩龙凤穿花纹赏瓶',            titleEn: 'Qianlong Famille-Rose Reward Vase',                   eraZh: '清乾隆',  eraEn: 'Qing Qianlong',  catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ngcy-01': { id: 'item-ngcy-01', img: 'ng-cy/item-ngcy-01.jpg', titleZh: '清代和田玉兽面纹卧兽钮双环耳盖瓶',          titleEn: 'Qing Hetian Jade Covered Vase',                       eraZh: '清',      eraEn: 'Qing',           catZh: '玉器', catEn: 'Jade',     priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ngcy-02': { id: 'item-ngcy-02', img: 'ng-cy/item-ngcy-02.jpg', titleZh: '清代黄地绿彩折枝花卉三多纹盘（一对）',      titleEn: 'Qing Yellow-Ground Green Plates (Pair)',             eraZh: '清',      eraEn: 'Qing',           catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ngcy-03': { id: 'item-ngcy-03', img: 'ng-cy/item-ngcy-03.jpg', titleZh: '清代哥釉天球瓶',                          titleEn: 'Qing Ge-Glaze Globe Vase',                            eraZh: '清',      eraEn: 'Qing',           catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ngcy-04': { id: 'item-ngcy-04', img: 'ng-cy/item-ngcy-04.jpg', titleZh: '清代铜弦纹桥耳三足炉（宣德款）',            titleEn: 'Qing Bronze Tripod Censer, Xuande Mark',             eraZh: '清',      eraEn: 'Qing',           catZh: '铜器', catEn: 'Bronze',   priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'ngcy-05': { id: 'item-ngcy-05', img: 'ng-cy/item-ngcy-05.jpg', titleZh: '明代和田玉籽料留皮佛说法山水人物玉山子',    titleEn: 'Ming Hetian Seed-Jade Boulder Carving',               eraZh: '明',      eraEn: 'Ming',           catZh: '玉器', catEn: 'Jade',     priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'yak-01':  { id: 'item-yak-01',  img: 'yak-bc/item-yak-01.jpg', titleZh: '唐三彩伎乐舞俑',                          titleEn: 'Tang Sancai Musician Figurines',                      eraZh: '唐',      eraEn: 'Tang',           catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'yak-02':  { id: 'item-yak-02',  img: 'yak-bc/item-yak-02.jpg', titleZh: '清雍正胭脂红釉盘',                        titleEn: 'Yongzheng Rouge-Red Dish',                            eraZh: '清雍正',  eraEn: 'Qing Yongzheng', catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' },
  'yak-03':  { id: 'item-yak-03',  img: 'yak-bc/item-yak-03.jpg', titleZh: '明代甜白釉暗刻青花内府人物故事纹碗',        titleEn: 'Ming Sweet-White Incised Bowl',                       eraZh: '明',      eraEn: 'Ming',           catZh: '瓷器', catEn: 'Porcelain', priceZh: '价格面议',            priceEn: 'Price on inquiry' }
};

/* 常用组合 */
const PORCELAIN = ['lim-01', 'yak-03', 'lim-04', 'ng-03', 'ngcy-03', 'yak-02', 'ngcy-02'];
const BRONZE    = ['ngcy-04', 'lim-02', 'lim-03', 'ng-01', 'ng-02'];
const JADE      = ['ngcy-05', 'ngcy-01'];
const LATEST    = ['yak-01', 'lim-04', 'lim-02', 'lim-03', 'ng-01'];
const MIXED     = ['lim-01', 'ng-01', 'ngcy-05', 'yak-01', 'ngcy-01'];

/* 缺货品类的"委托找货"引导语 */
const SOURCING_NOTE = {
  coins:    { zh: '钱币类藏品正在陆续上架。想找特定钱币？',              en: 'Coins are being listed gradually. Looking for a specific one?' },
  paintings:{ zh: '书画类藏品正在陆续上架。想找特定作品？',              en: 'Paintings are being listed gradually. Looking for a specific work?' },
  furniture:{ zh: '硬木家具类藏品正在陆续上架。想要一件老家具？',        en: 'Hardwood furniture is coming soon. After a specific piece?' },
  misc:     { zh: '竹木牙角、蜜蜡类藏品正在陆续上架。有特定目标？',      en: 'Bamboo, ivory and amber pieces are coming soon. After something specific?' },
  jade:     { zh: '更多玉器正在陆续上架。有特定目标？',                  en: 'More jade pieces are on the way. After something specific?' }
};

/* ============ 每篇文章 → 相关藏品映射 ============ */
const ARTICLE_ITEMS = {
  /* 瓷器系列 */
  'qing-porcelain-dating':       ['lim-01', 'yak-03', 'lim-04', 'ng-03', 'yak-02'],
  'ming-porcelain-dating':       ['lim-01', 'yak-03', 'ngcy-03', 'ngcy-02', 'lim-04'],
  'republic-porcelain-dating':   ['ng-03', 'ngcy-02', 'lim-04', 'yak-02', 'ngcy-03'],
  'qinghua-cobalt':              ['lim-01', 'yak-03', 'ng-03', 'ngcy-02', 'lim-04'],
  'porcelain-marks':             ['lim-01', 'lim-04', 'ng-03', 'yak-02', 'ngcy-02'],
  'glaze-crackle-basics':        ['ngcy-03', 'lim-04', 'ng-03', 'ngcy-02', 'yak-02'],
  'porcelain-aging-tricks':      ['yak-03', 'ngcy-03', 'lim-04', 'ng-03', 'yak-02'],
  /* 玉器系列 */
  'jade-tool-marks':             { items: JADE, note: 'jade' },
  'jadeite-abc':                 { items: JADE, note: 'jade' },
  'jade-buyer-pitfalls':         { items: JADE, note: 'jade' },
  'ancient-jade-stains':         { items: JADE, note: 'jade' },
  'hetian-seeds-vs-mountain':    { items: JADE, note: 'jade' },
  /* 钱币系列 */
  'coin-casting-dating':         { items: LATEST, note: 'coins' },
  'coin-patina-types':           { items: LATEST, note: 'coins' },
  'silver-patina':               { items: LATEST, note: 'coins' },
  'coin-aging-tricks':           { items: LATEST, note: 'coins' },
  'coin-cleaning':               { items: LATEST, note: 'coins' },
  'silver-dollar-edges':         { items: LATEST, note: 'coins' },
  /* 书画系列 */
  'painting-seals-signatures':   { items: LATEST, note: 'paintings' },
  'painting-mounting':           { items: LATEST, note: 'paintings' },
  'painting-prints-vs-hand':     { items: LATEST, note: 'paintings' },
  /* 器物与杂项 */
  'furniture-joinery-dating':    { items: LATEST, note: 'furniture' },
  'furniture-patina':            { items: LATEST, note: 'furniture' },
  'bronze-censer-patina':       BRONZE,
  'bamboo-ivory-cracks':         { items: LATEST, note: 'misc' },
  'amber-baked-vs-natural':      { items: LATEST, note: 'misc' },
  /* 新加坡本地（行情） */
  'singapore-coin-market':       { items: LATEST, note: 'coins' },
  'singapore-flea-market-map':   LATEST,
  'auction-house-watch':         ['lim-01', 'ng-01', 'ngcy-05', 'lim-04', 'yak-01'],
  'singapore-porcelain-market':  ['lim-01', 'lim-04', 'yak-02', 'yak-03', 'ng-03'],
  'singapore-jade-market':       { items: JADE, note: 'jade' },
  'singapore-painting-market':   { items: LATEST, note: 'paintings' },
  /* 收藏与保存 */
  'how-to-store-collection':     ['lim-01', 'ng-01', 'ngcy-05', 'ngcy-01', 'yak-01'],
  'first-collection':            ['yak-02', 'ngcy-02', 'ngcy-01', 'lim-04', 'yak-03'],
  /* 捡漏与策略 */
  'what-is-jianlou':             ['yak-01', 'lim-02', 'ng-01', 'ngcy-05', 'lim-03'],
  'how-to-brief-a-sourcing':     ['ngcy-05', 'lim-01', 'ng-01', 'ngcy-01', 'yak-01'],
  'how-to-negotiate':            ['lim-04', 'yak-02', 'ngcy-02', 'lim-03', 'ng-02'],
  'provenance-basics':           ['lim-01', 'ng-01', 'ngcy-04', 'ngcy-05', 'lim-02'],
  /* 透过历史看古董 */
  'sumali-cobalt-zhenghe':       ['lim-01', 'yak-03', 'ng-03', 'ngcy-02', 'lim-04'],
  'tang-ceramics-trade':         ['yak-01', 'yak-03', 'ngcy-03', 'lim-01', 'lim-04'],
  'song-five-kilns':             ['ngcy-03', 'ngcy-02', 'yak-03', 'lim-01', 'lim-04'],
  'qing-three-reigns-porcelain': ['ng-03', 'lim-04', 'yak-02', 'ngcy-02', 'lim-01'],
  'ming-furniture-minimalism':    { items: LATEST, note: 'furniture' },
  'xuande-censer-legacy':        ['ngcy-04', 'lim-01', 'lim-02', 'lim-03', 'ng-01'],
  'late-qing-outflow':           ['lim-01', 'ng-03', 'ngcy-05', 'yak-01', 'ng-01'],
  'republic-antique-fakes':      ['ng-03', 'ngcy-02', 'lim-04', 'yak-02', 'ngcy-03'],
  'zhushan-eight-friends':       ['ng-03', 'ngcy-02', 'ngcy-03', 'lim-04', 'yak-02'],
  'singapore-chinese-antiques':  MIXED,
  'nyonya-ware':                 ['yak-01', 'lim-01', 'yak-03', 'ngcy-02', 'lim-04'],
  /* 透过地理看古董 */
  'jingdezhen-geography':        PORCELAIN,
  'jade-road-hetian':            { items: JADE, note: 'jade' },
  'sumali-cobalt-origin':        ['lim-01', 'yak-03', 'ng-03', 'ngcy-02', 'lim-04'],
  'bronze-age-copper':           BRONZE,
  'grand-canal-porcelain':       PORCELAIN,
  'yangtze-kilns':               ['ngcy-03', 'yak-03', 'lim-01', 'lim-04', 'ng-03'],
  'maritime-silk-road-ports':    ['yak-01', 'yak-03', 'lim-01', 'ngcy-02', 'ng-03'],
  'canton-thirteen-hongs':       ['lim-01', 'ng-03', 'ngcy-02', 'yak-02', 'lim-04'],
  'quanzhou-yuan-blue':          ['lim-01', 'yak-03', 'ng-03', 'ngcy-02', 'lim-04'],
  'burial-climate-north-south':  BRONZE,
  'malacca-strait-antiques':     MIXED
};

/* ============ 本地行情系列 · 月度简报配置 ============ */
const MONTHLY_BRIEFS = {
  'singapore-coin-market':       { zh: '新加坡钱币月度行情简报',       en: 'Singapore Coin Market Monthly Brief' },
  'singapore-flea-market-map':   { zh: '新加坡市集月度情报',           en: 'Singapore Flea Market Monthly Intel' },
  'auction-house-watch':         { zh: '新加坡拍卖月度观察',           en: 'Singapore Auction Monthly Watch' },
  'singapore-porcelain-market':  { zh: '新加坡瓷器月度行情简报',       en: 'Singapore Porcelain Market Monthly Brief' },
  'singapore-jade-market':       { zh: '新加坡玉器月度行情简报',       en: 'Singapore Jade Market Monthly Brief' },
  'singapore-painting-market':   { zh: '新加坡书画月度行情简报',       en: 'Singapore Painting Market Monthly Brief' }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function currentEdition() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const enM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
  return { zh: y + ' 年 ' + m + ' 月版', en: enM + ' ' + y + ' edition' };
}

/* ============ CSS（注入文章页，勿依赖模板特有变量） ============ */
const CSS_BLOCK = `
        /* ===== 相关藏品 CTA ===== */
        .related-items { margin-top: 3.5rem; }
        .ri-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1.1rem; border-bottom: 1px solid var(--color-border); padding-bottom: .7rem; }
        .ri-title { font-size: 1.15rem; font-weight: 700; color: var(--color-text); }
        .ri-more { font-size: .82rem; font-weight: 600; color: var(--color-primary); text-decoration: none; white-space: nowrap; }
        .ri-more:hover { color: var(--color-primary-dark); text-decoration: underline; }
        .ri-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 1.1rem; }
        .ri-card { display: flex; flex-direction: column; text-decoration: none; color: var(--color-text); background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-card, 12px); overflow: hidden; transition: .25s; box-shadow: var(--shadow-soft, 0 6px 20px rgba(37,34,30,.05)); }
        .ri-card:hover { border-color: var(--color-gold); transform: translateY(-3px); box-shadow: var(--shadow-hover, 0 12px 28px rgba(138,90,59,.10)); }
        .ri-img { aspect-ratio: 1 / 1; background: #EFEAE2; overflow: hidden; }
        .ri-img img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
        .ri-card:hover .ri-img img { transform: scale(1.05); }
        .ri-body { padding: .8rem .9rem .95rem; display: flex; flex-direction: column; gap: .28rem; }
        .ri-name { font-size: .88rem; font-weight: 700; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .ri-meta { font-size: .72rem; color: var(--color-bronze-muted); letter-spacing: .03em; }
        .ri-price { font-size: .8rem; font-weight: 700; color: var(--color-primary-dark); }
        .ri-foot { margin-top: 1.1rem; font-size: .84rem; color: var(--color-text-secondary); line-height: 1.7; }
        .ri-foot a { color: var(--color-primary); font-weight: 700; text-decoration: none; }
        .ri-foot a:hover { text-decoration: underline; }
        .ri-foot .ri-cat-note { display: block; margin-bottom: .15rem; color: var(--color-bronze-muted); }

        /* ===== 月度简报徽章 ===== */
        .monthly-badge { display: inline-flex; align-items: center; gap: .5rem; margin: -1.2rem 0 1.8rem; padding: .42rem .95rem; border-radius: 999px; background: rgba(176,138,69,.12); border: 1px solid rgba(176,138,69,.38); font-size: .76rem; font-weight: 700; color: var(--color-primary-dark); letter-spacing: .02em; }
        .monthly-badge .mb-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-gold); flex-shrink: 0; }

        /* ===== 月度回访提示 ===== */
        .monthly-return { margin-top: 3rem; padding: 1.4rem 1.6rem; border-radius: var(--radius-card, 12px); background: linear-gradient(145deg, #FDF9F2 0%, #F8F1E6 100%); border: 1px solid rgba(176,138,69,.38); box-shadow: var(--shadow-soft, 0 6px 20px rgba(37,34,30,.05)); }
        .monthly-return .mr-title { font-size: 1.02rem; font-weight: 700; color: var(--color-primary-dark); margin-bottom: .5rem; }
        .monthly-return .mr-text { font-size: .86rem; color: var(--color-text-secondary); line-height: 1.7; margin-bottom: .8rem; }
        .monthly-return .mr-links a { font-size: .85rem; font-weight: 700; color: var(--color-primary); text-decoration: none; }
        .monthly-return .mr-links a:hover { text-decoration: underline; }

        @media (max-width: 560px) {
            .ri-grid { grid-template-columns: repeat(2, 1fr); gap: .8rem; }
            .ri-body { padding: .6rem .7rem .75rem; }
            .ri-name { font-size: .8rem; }
            .ri-foot { font-size: .8rem; }
            .monthly-return { padding: 1.1rem 1.2rem; }
        }
`;

/* ============ HTML 生成 ============ */

function itemCardHtml(key) {
  const it = ITEMS[key];
  if (!it) return '';
  const img = '../assets/images/' + it.img;
  return [
    '                <a class="ri-card" href="../items/' + it.id + '.html">',
    '                    <div class="ri-img"><img src="' + img + '" alt="' + esc(it.titleZh) + '" loading="lazy"></div>',
    '                    <div class="ri-body">',
    '                        <div class="ri-name zh">' + esc(it.titleZh) + '</div>',
    '                        <div class="ri-name en">' + esc(it.titleEn) + '</div>',
    '                        <div class="ri-meta"><span class="zh">' + esc(it.eraZh) + ' · ' + esc(it.catZh) + '</span><span class="en">' + esc(it.eraEn) + ' · ' + esc(it.catEn) + '</span></div>',
    '                        <div class="ri-price"><span class="zh">' + esc(it.priceZh) + '</span><span class="en">' + esc(it.priceEn) + '</span></div>',
    '                    </div>',
    '                </a>'
  ].join('\n');
}

function relatedItemsSectionHtml(slug) {
  const conf = ARTICLE_ITEMS[slug];
  if (!conf) return '';
  const keys = Array.isArray(conf) ? conf : conf.items;
  const note = !Array.isArray(conf) && conf.note ? SOURCING_NOTE[conf.note] : null;

  const cards = keys.map(itemCardHtml).filter(Boolean).join('\n');
  const noteHtml = note
    ? '<span class="ri-cat-note zh">' + esc(note.zh) + '</span>\n            <span class="ri-cat-note en">' + esc(note.en) + '</span>\n            '
    : '';

  return [
    '',
    '        <!-- 相关藏品：内容 → 成交最短路径 -->',
    '        <section class="related-items" id="relatedItems">',
    '            <div class="ri-head">',
    '                <div class="ri-title zh">看看相关藏品</div>',
    '                <div class="ri-title en">Related pieces on offer</div>',
    '                <a class="ri-more" href="../collection.html"><span class="zh">全部藏品 →</span><span class="en">All listings →</span></a>',
    '            </div>',
    '            <div class="ri-grid">',
    cards,
    '            </div>',
    '            <div class="ri-foot">',
    '            ' + noteHtml + '<span class="zh">没找到心仪的？<a href="../collection.html">浏览全部藏品</a>，或<a href="../pricing.html#buyer-services">委托找货 →</a></span>',
    '                <span class="en">Can\'t find the one? <a href="../collection.html">Browse all listings</a> or <a href="../pricing.html#buyer-services">request sourcing →</a></span>',
    '            </div>',
    '        </section>',
    ''
  ].join('\n');
}

function monthlyBadgeHtml(slug) {
  const brief = MONTHLY_BRIEFS[slug];
  if (!brief) return '';
  const ed = currentEdition();
  return [
    '',
    '        <!-- 月度简报徽章：固定回访锚点 -->',
    '        <div class="monthly-badge">',
    '            <span class="mb-dot"></span>',
    '            <span class="zh">月度简报 · ' + ed.zh + ' · 每月更新</span>',
    '            <span class="en">Monthly brief · ' + ed.en + ' · updated monthly</span>',
    '        </div>',
    ''
  ].join('\n');
}

function monthlyReturnHtml(slug) {
  const brief = MONTHLY_BRIEFS[slug];
  if (!brief) return '';
  return [
    '',
    '        <!-- 月度回访提示 -->',
    '        <section class="monthly-return" id="monthlyUpdate">',
    '            <div class="mr-title zh">📌 本文属于《' + esc(brief.zh) + '》系列</div>',
    '            <div class="mr-title en">📌 Part of the "' + esc(brief.en) + '" series</div>',
    '            <div class="mr-text zh">每月初更新一版——行情走势、价格区间、渠道变化都会刷新。把这一页加入收藏，下个月回来看最新一期。</div>',
    '            <div class="mr-text en">A fresh edition ships at the start of every month — trends, price ranges and channels all get refreshed. Bookmark this page and check back next month.</div>',
    '            <div class="mr-links">',
    '                <a href="../insights.html#series-local"><span class="zh">查看全部本地行情系列 →</span><span class="en">All local market briefs →</span></a>',
    '            </div>',
    '        </section>',
    ''
  ].join('\n');
}

/* 文章名 → 系列（供报告用） */
function seriesOf(slug) {
  if (MONTHLY_BRIEFS[slug]) return 'local-market';
  if (BRONZE.indexOf(slug) >= 0) return '';
  return '';
}

module.exports = {
  ROOT,
  ITEMS,
  ARTICLE_ITEMS,
  MONTHLY_BRIEFS,
  CSS_BLOCK,
  relatedItemsSectionHtml,
  monthlyBadgeHtml,
  monthlyReturnHtml
};
