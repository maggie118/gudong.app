#!/usr/bin/env node
/**
 * Generate item detail HTML pages from data/listings.json snapshot.
 * Template: items/item-lim-04.html
 * Data:    data/listings.json
 * Output:  items/{item_id}.html
 *
 * Usage:
 *   node scripts/generate-items.js               # generate only missing files
 *   node scripts/generate-items.js --force       # overwrite all files
 *   node scripts/generate-items.js item-yak-01   # generate specific item only
 *
 * Static content filled from listings.json; runtime Airtable JS overrides remain intact.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'items', 'item-lim-04.html');
const DATA_PATH = path.join(ROOT, 'data', 'listings.json');
const OUTPUT_DIR = path.join(ROOT, 'items');

const CAT_EN = {
    '瓷器': 'Porcelain',
    '玉器': 'Jade',
    '钱币': 'Coins',
    '书画': 'Paintings & Calligraphy',
    '铜器': 'Bronze',
    '佛像': 'Buddhist Sculpture',
    '木器': 'Woodwork',
    '杂项': 'Miscellaneous'
};

// ---- 尺寸中英转换（复刻自 items/item-lim-04.html 的 dimZh / dimEn）----
const DIM_ZH = {
    '高度': '高度', '高': '高度', '直径': '直径', '径': '直径',
    '宽度': '宽度', '宽': '宽度', '长度': '长度', '长': '长度',
    '深度': '深度', '深': '深度', '口径': '口径', '底径': '底径',
    '重量': '重量', '重': '重量'
};
const DIM_EN = {
    '高度': 'Height', '直径': 'Diameter', '宽度': 'Width', '长度': 'Length',
    '深度': 'Depth', '口径': 'Mouth diameter', '底径': 'Base diameter', '重量': 'Weight'
};
const DIM_SRC = /(高度|高|口径|底径|直径|重量|重|长度|长|宽度|宽|深度|深)\s*[:：]?\s*(\d+(?:\.\d+)?\s*(?:cm|mm|kg|g|m)?)/g;

function dimPairs(s) {
    const out = [];
    const str = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const re = new RegExp(DIM_SRC.source, 'g');
    let m;
    while ((m = re.exec(str))) out.push([DIM_ZH[m[1]] || m[1], m[2].trim()]);
    return { pairs: out, raw: str };
}

function dimZh(s) {
    const d = dimPairs(s);
    return d.pairs.length ? d.pairs.map(p => p[0] + '：' + p[1]).join(' · ') : d.raw;
}

function dimEn(s) {
    const d = dimPairs(s);
    return d.pairs.length ? d.pairs.map(p => (DIM_EN[p[0]] || p[0]) + ' ' + p[1]).join(' · ') : d.raw;
}

const PLATFORM_WHATSAPP = 'gudong.app';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function sellerPageUrl(sellerEn) {
    if (!sellerEn) return '#';
    const slug = sellerEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `seller-${slug}.html`;
}

function generateHTML(template, item, seller) {
    let html = template;

    const itemId   = item.item_id || '';
    const titleZh  = item.title_zh || '';
    const titleEn  = item.title_en || '';
    const eraZh    = item.era_zh || '';
    const eraEn    = item.era_en || '';
    const category = item.category || '';
    const catEn    = CAT_EN[category] || category;
    const priceZh  = item.price_display_zh || '私聊询价';
    const priceEn  = item.price_display_en || 'Enquire';
    const descZh   = item.desc_zh || '';
    const descEn   = item.desc_en || '';
    const sellerId = item.seller_id || '';
    // Fallback chain: seller table display_zh/display_en → item's seller_name_en → seller_id
    const sellerZh = seller.display_zh || seller.display_en || item.seller_name_en || sellerId;
    const sellerEn = seller.display_en || seller.display_zh || item.seller_name_en || sellerId;
    // page_url from Airtable is already a relative path like "../sellers/xxx.html"
    const slPage   = seller.page_url || `../sellers/${sellerPageUrl(sellerEn)}`;
    const imgFile    = item.img_file || '';
    const imgSrc     = imgFile ? `../assets/images/${imgFile}` : '../assets/images/placeholder.jpg';
    const dimensions = item.dimensions || '—';
    // Compute condition the same way the runtime JS does
    const wear   = item.has_surface_wear === true;
    const damage = item.has_surface_damage === true;
    const condZh = (wear && damage) ? '表面有磨损及破损' : wear ? '完整 · 表面有轻微磨损' : damage ? '表面有破损' : '完整';
    const condEn = (wear && damage) ? 'Surface wear and damage' : wear ? 'Intact · minor surface wear' : damage ? 'Surface damage' : 'Intact';

    // 1. <title>
    html = html.replace(
        /<title>[^<]*<\/title>/,
        `<title>${escapeHtml(titleZh)} | ${escapeHtml(sellerEn)} | Gudong</title>`
    );

    // 2. Back-links text
    html = html.replace(
        /(<a[^>]*class="back-link zh"[^>]*>)[\s\S]*?(<\/a>)/,
        `$1← 返回 ${escapeHtml(sellerZh)} 私家藏馆$2`
    );
    html = html.replace(
        /(<a[^>]*class="back-link en"[^>]*>)[\s\S]*?(<\/a>)/,
        `$1← Back to ${escapeHtml(sellerEn)}$2`
    );
    // Replace all seller page hrefs (back-link + seller-card-link)
    html = html.replace(
        // 模板里两种写法都要覆盖：相对 "../sellers/xxx.html" 和 绝对
        // "https://www.gudong.app/sellers/xxx"（无扩展名，cleanUrls）
        /href="[^"]*seller-lim-kw-antiques[^"]*"/g,
        `href="${slPage}"`
    );

    // 3. Image src + alt
    // ⚠️ 必须精确锁定 #mainImage —— 模板里第一个 <img> 是 header 的 brand-logo-img，
    //    用无锚点的 /(<img src=").../ 会把 LOGO 换成藏品图，主图反而留在原样。
    html = html.replace(
        /(<img id="mainImage" src=")[^"]*(" alt=")[^"]*(")/,
        `$1${imgSrc}$2${escapeHtml(titleZh)}$3`
    );
    // SEO 图字段（og / twitter / JSON-LD）同步换成本件藏品
    const IMG_ABS_BASE = 'https://www.gudong.app/assets/images/';
    const imgAbs = imgFile ? IMG_ABS_BASE + imgFile : IMG_ABS_BASE + 'placeholder.jpg';
    html = html.replace(
        /(<meta property="og:image" content=")[^"]*(")/,
        `$1${imgAbs}$2`
    );
    html = html.replace(
        /(<meta name="twitter:image" content=")[^"]*(")/,
        `$1${imgAbs}$2`
    );
    html = html.replace(
        /("image":\[")[^"]*("\])/,
        `$1${imgAbs}$2`
    );

    // 4. Meta lines
    html = html.replace(
        /(<p class="item-detail-meta zh">)[\s\S]*?(<\/p>)/,
        `$1${escapeHtml(eraZh)} · ${escapeHtml(category)} · 卖家：${escapeHtml(sellerZh)}$2`
    );
    html = html.replace(
        /(<p class="item-detail-meta en">)[\s\S]*?(<\/p>)/,
        `$1${escapeHtml(eraEn)} · ${escapeHtml(catEn)} · Seller: ${escapeHtml(sellerEn)}$2`
    );

    // 5. Item detail titles
    html = html.replace(
        /(<h1 class="item-detail-title zh">)[\s\S]*?(<\/h1>)/,
        `$1${escapeHtml(titleZh)}$2`
    );
    html = html.replace(
        /(<h1 class="item-detail-title en">)[\s\S]*?(<\/h1>)/,
        `$1${escapeHtml(titleEn)}$2`
    );

    // 6. Price spans — use function replacement to avoid $ being treated as backreference
    html = html.replace(
        /(<span class="zh">)S\$[\d,]+(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(priceZh) + p2
    );
    html = html.replace(
        /(<span class="en">)S\$[\d,]+(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(priceEn) + p2
    );

    // 7. Descriptions
    html = html.replace(
        /(<p class="item-detail-desc zh">)[\s\S]*?(<\/p>)/,
        `$1${escapeHtml(descZh)}$2`
    );
    html = html.replace(
        /(<p class="item-detail-desc en">)[\s\S]*?(<\/p>)/,
        `$1${escapeHtml(descEn)}$2`
    );

    // 8. Specs
    html = html.replace(
        /(<span class="spec-value zh" data-spec="era_zh">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(eraZh)}$2`
    );
    html = html.replace(
        /(<span class="spec-value en" data-spec="era_en">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(eraEn)}$2`
    );
    html = html.replace(
        /(<span class="spec-value zh" data-spec="category">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(category)}$2`
    );
    html = html.replace(
        /(<span class="spec-value en" data-spec="category_en">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(catEn)}$2`
    );
    // ⚠️ 模板里是 class="spec-value zh"（带 zh），正则必须带上，否则匹配不到会静默留原值
    html = html.replace(
        /(<span class="spec-value zh" data-spec="dimensions">)[\s\S]*?(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(dimZh(item.dimensions)) + p2
    );
    html = html.replace(
        /(<span class="spec-value en" data-spec="dimensions_en">)[\s\S]*?(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(dimEn(item.dimensions)) + p2
    );
    html = html.replace(
        /(<span class="spec-value zh" data-spec="condition_zh">)[\s\S]*?(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(condZh) + p2
    );
    html = html.replace(
        /(<span class="spec-value en" data-spec="condition_en">)[\s\S]*?(<\/span>)/,
        (m, p1, p2) => p1 + escapeHtml(condEn) + p2
    );

    // 9. Seller card
    html = html.replace(
        /(<span class="zh" id="sellerNameZh">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(sellerZh)}$2`
    );
    html = html.replace(
        /(<span class="en" id="sellerNameEn">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(sellerEn)}$2`
    );
    html = html.replace(
        /(<span id="sellerId">)[\s\S]*?(<\/span>)/,
        `$1${escapeHtml(sellerId)}$2`
    );
    html = html.replace(
        /(<div class="gd-chat"[^>]*data-item-id=")[^"]*(")/,
        `$1${escapeHtml(itemId)}$2`
    );
    html = html.replace(
        /(<div class="gd-chat"[^>]*data-seller-id=")[^"]*(")/,
        `$1${escapeHtml(sellerId)}$2`
    );

    // 10. WhatsApp contact buttons — rebuild full URL with new item_id
    const waTextZh = `你好，我在Gudong上看到你的藏品：${itemId}`;
    const waTextEn = `Hi, I'm interested in this item on Gudong: ${itemId}`;
    const waUrlZh = `https://wa.me/${PLATFORM_WHATSAPP}?text=${encodeURIComponent(waTextZh)}`;
    const waUrlEn = `https://wa.me/${PLATFORM_WHATSAPP}?text=${encodeURIComponent(waTextEn)}`;
    html = html.replace(
        /(href=")https:\/\/wa\.me\/\d+\?text=[^"]*(" class="contact-btn zh")/,
        `$1${waUrlZh}$2`
    );
    html = html.replace(
        /(href=")https:\/\/wa\.me\/\d+\?text=[^"]*(" class="contact-btn en")/,
        `$1${waUrlEn}$2`
    );

    // 11. JS comment + itemId constant
    html = html.replace(
        /(\/\/====专家预约弹窗JS )item-lim-04(====)/,
        `$1${itemId}$2`
    );
    html = html.replace(
        /const itemId = "item-lim-04";/,
        `const itemId = "${itemId}";`
    );

    return html;
}

function main() {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const specificItem = args.find(a => !a.startsWith('--'));

    if (!fs.existsSync(TEMPLATE_PATH)) {
        console.error(`Error: Template not found: ${TEMPLATE_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(DATA_PATH)) {
        console.error(`Error: Data file not found: ${DATA_PATH}`);
        process.exit(1);
    }

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

    // Deduplicate items by item_id across all arrays
    const itemsMap = new Map();
    [...(data.todayFinds || []), ...(data.editorPicks || []), ...(data.newListing || [])].forEach(item => {
        if (item.item_id && !itemsMap.has(item.item_id)) {
            itemsMap.set(item.item_id, item);
        }
    });

    const sellers = data.sellers || [];
    let generated = 0, skipped = 0, failed = 0;

    for (const [itemId, item] of itemsMap) {
        if (specificItem && itemId !== specificItem) continue;

        const outputPath = path.join(OUTPUT_DIR, `${itemId}.html`);

        if (fs.existsSync(outputPath) && !force) {
            console.log(`SKIP  ${itemId}.html (exists, use --force to overwrite)`);
            skipped++;
            continue;
        }

        try {
            const seller = sellers.find(s => s.seller_id === item.seller_id) || {};
            const html = generateHTML(template, item, seller);
            fs.writeFileSync(outputPath, html, 'utf8');
            console.log(`GEN   ${itemId}.html`);
            generated++;
        } catch (err) {
            console.error(`FAIL  ${itemId}.html: ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
}

main();

