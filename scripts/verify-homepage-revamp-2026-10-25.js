/* 2026-10-25 首页优化：无头浏览器渲染断言
   用法： NODE_PATH=<workspace>/node_modules node scripts/verify-homepage-revamp-2026-10-25.js
*/
const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');

const CHROME = path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92',
    process.platform === 'win32' ? 'chrome.exe' : 'chrome');
const URL = 'http://127.0.0.1:8123/index.html';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✔ ' + name + (extra ? '  ' + extra : '')); }
    else { fail++; console.log('  ✖ ' + name + (extra ? '  ' + extra : '')); }
}
const vis = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);

    console.log('\n— 桌面 1280px —');
    const hero = await page.evaluate(() => {
        const b = document.querySelector('.hero-privacy-badge');
        const r = b && b.getBoundingClientRect();
        return {
            badge: !!b,
            badgeBox: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null,
            badgeText: b ? b.innerText.replace(/\s+/g, ' ').trim() : null,
            oldPromise: !!document.querySelector('.hero-promise'),
            titleTop: Math.round(document.querySelector('.hero-title-main').getBoundingClientRect().top),
            badgeTop: r ? Math.round(r.top) : null
        };
    });
    ok('隐私徽章存在', hero.badge, hero.badgeBox);
    ok('徽章位于主标题上方', hero.badge !== null && hero.badgeTop < hero.titleTop, 'badge=' + hero.badgeTop + ' title=' + hero.titleTop);
    ok('旧 hero-promise 已移除（避免重复）', hero.oldPromise === false);

    const stats = await page.evaluate(() => ({
        sellers: (document.getElementById('statSellers') || {}).textContent,
        items: (document.getElementById('statItems') || {}).textContent,
        commission: !!document.querySelector('.hero-stat--accent')
    }));
    ok('首屏藏馆数已填充', /^\d+$/.test(stats.sellers || ''), 'sellers=' + stats.sellers);
    ok('首屏在售件数已填充', /^\d+$/.test(stats.items || ''), 'items=' + stats.items);
    ok('0% 佣金数据条存在', stats.commission);

    const tags = await page.evaluate(() => {
        const pro = Array.from(document.querySelectorAll('#hotTagsPro .hot-tag'));
        return { count: pro.length, kws: pro.map(b => b.dataset.kw) };
    });
    ok('行家术语标签 6 个', tags.count === 6, tags.kws.join('/'));

    // 点击「行家术语」标签是否写入搜索框并过滤
    await page.click('#hotTagsPro .hot-tag[data-kw="高古"]');
    await page.waitForTimeout(400);
    const kwAfter = await page.inputValue('#searchInput');
    ok('术语标签点击写入搜索框', kwAfter === '高古', 'value=' + kwAfter);
    await page.click('#hotTagsPro .hot-tag[data-kw="官窑"]');
    await page.waitForTimeout(400);
    const kwAfter2 = await page.inputValue('#searchInput');
    ok('第二个术语标签同样生效', kwAfter2 === '官窑', 'value=' + kwAfter2);
    await page.evaluate(() => { const i = document.getElementById('searchInput'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);

    const order = await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('main section[id]')).map(s => s.id);
        return ids;
    });
    const fi = order.indexOf('insights'), di = order.indexOf('daily-intel');
    ok('Insights 已上浮到「今日情报」之前', fi > -1 && di > -1 && fi < di, order.join(' → '));

    const intel = await page.evaluate(() => ({
        cards: document.querySelectorAll('.intel-card').length,
        editorialHidden: (() => {
            const w = document.querySelector('.intel-editorial');
            return !w || w.style.display === 'none' || w.getBoundingClientRect().height === 0;
        })(),
        stats: ['statToday', 'statWeek', 'statSellers'].map(id => {
            const el = document.getElementById(id);
            return el ? el.textContent : null;
        }),
        feedRows: document.querySelectorAll('.intel-ticker .tick-row, [class*="tick-"]').length
    }));
    ok('写死的 INTEL_FEED 兜底已移除（无接口数据时不渲染假情报）',
        intel.cards === 0 && intel.editorialHidden,
        'cards=' + intel.cards + ' editorialHidden=' + intel.editorialHidden);
    ok('实时统计卡仍存在（今日/本周/藏家）', intel.stats.every(v => /^\d+$/.test(v || '')),
        intel.stats.join('/'));

    const trust = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('.trust-chip'));
        return {
            n: chips.length,
            sizes: chips.map(c => Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height)),
            tagline: !!document.querySelector('.trust-tagline')
        };
    });
    ok('信任三件套 3 个', trust.n === 3, trust.sizes.join(' | '));
    ok('信任金句仍在', trust.tagline);

    const faq = await page.evaluate(() => document.querySelectorAll('.faq-item').length);
    ok('FAQ 6 条（含新增佣金问答）', faq === 6, 'count=' + faq);

    const seatsGone = await page.evaluate(() => !document.querySelector('.seats-meter'));
    ok('席位倒计时条已按用户要求移除', seatsGone);

    // 逐屏滚动，确保 lazy 图片全部进入视口后再统计
    await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);

    const finds = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('#todayFindsGrid .finds-card'));
        return {
            n: cards.length,
            related: document.querySelectorAll('.finds-related').length,
            imgsLoaded: Array.from(document.querySelectorAll('#todayFindsGrid img')).filter(i => i.naturalWidth > 0).length,
            imgsTotal: document.querySelectorAll('#todayFindsGrid img').length,
            decoding: (document.querySelector('#todayFindsGrid img') || {}).getAttribute('decoding'),
            lazy: (document.querySelector('#todayFindsGrid img') || {}).getAttribute('loading')
        };
    });
    ok('今日发现卡片渲染', finds.n > 0, 'n=' + finds.n);
    ok('卡片关联科普已注入', finds.related > 0, finds.related + ' 条');
    ok('卡片图片全部加载', finds.imgsTotal > 0 && finds.imgsLoaded === finds.imgsTotal, finds.imgsLoaded + '/' + finds.imgsTotal);
    ok('图片 loading=lazy + decoding=async', finds.lazy === 'lazy' && finds.decoding === 'async');

    await page.screenshot({ path: path.join(__dirname, 'home-revamp-desktop-1280.png'), fullPage: false });

    console.log('\n— 移动端 390px —');
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(600);

    const mob = await page.evaluate(async () => {
        await document.fonts.ready;
        // 快照数据没有 reason 字段时页面不会出现 .finds-reason，注入探针测真实计算值
        const probe = document.createElement('div');
        probe.className = 'finds-reason zh';
        probe.textContent = 'probe';
        document.getElementById('todayFindsGrid').appendChild(probe);
        const pcs = getComputedStyle(probe);
        const probeFont = pcs.fontSize, probeLh = pcs.lineHeight;
        probe.remove();
        return {
            barNodes: document.querySelectorAll('.gd-mobar, #gdMobar').length,
            mobarOn: document.body.classList.contains('mobar-on'),
            reasonFont: probeFont,
            reasonLh: probeLh,
            statCols: document.querySelectorAll('.hero-stat').length,
            badgeWrap: !!document.querySelector('.hero-privacy-badge')
        };
    });
    ok('移动端底部行动条已移除（0 个节点）', mob.barNodes === 0, 'nodes=' + mob.barNodes);
    ok('body 未残留 mobar-on 状态类', mob.mobarOn === false);
    ok('移动端行家私语放大到 .84rem（13.44px）', parseFloat(mob.reasonFont) >= 13.4,
        mob.reasonFont + ' / lh ' + mob.reasonLh);

    // 滚动后确认没有任何浮层弹出
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(700);
    const scrolled = await page.evaluate(() => {
        const vh = window.innerHeight;
        // 排除侧边栏抽屉/遮罩（页面既有结构，非新增浮层）
        const isOwnChrome = el => el.closest('.sidebar, .sidebar-overlay, #sidebar, #sidebarOverlay, header, .site-header');
        const floating = Array.from(document.querySelectorAll('body *')).filter(el => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
            if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
            if (isOwnChrome(el)) return false;
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.bottom > vh - 100;   // 贴视口底部的浮层
        }).map(el => el.id || el.className);
        return {
            floating: floating,
            bodyPad: getComputedStyle(document.body).paddingBottom
        };
    });
    ok('滚动后无底部浮层弹出', scrolled.floating.length === 0, scrolled.floating.join(' | '));
    ok('body 无补偿性底部留白', parseFloat(scrolled.bodyPad) < 40, scrolled.bodyPad);

    await page.screenshot({ path: path.join(__dirname, 'home-revamp-mobile-390.png'), fullPage: false });

    console.log('\n— 窄屏 320px —');
    await page.setViewportSize({ width: 320, height: 700 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const narrow = await page.evaluate(() => {
        const b = document.querySelector('.hero-privacy-badge').getBoundingClientRect();
        const chips = Array.from(document.querySelectorAll('.trust-chip')).map(c => Math.round(c.getBoundingClientRect().width));
        return {
            badgeRight: Math.round(b.right), badgeLeft: Math.round(b.left), winW: window.innerWidth,
            maxChip: Math.max.apply(null, chips),
            overflow: document.documentElement.scrollWidth - window.innerWidth
        };
    });
    ok('320px 隐私徽章不溢出', narrow.badgeRight <= narrow.winW && narrow.badgeLeft >= 0,
        'left=' + narrow.badgeLeft + ' right=' + narrow.badgeRight + ' win=' + narrow.winW);
    ok('320px 无横向溢出', narrow.overflow <= 1, 'overflow=' + narrow.overflow + 'px');

    await page.screenshot({ path: path.join(__dirname, 'home-revamp-narrow-320.png'), fullPage: false });

    console.log('\n— 桌面端回归 —');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    const deskBar = await page.evaluate(() => document.querySelectorAll('.gd-mobar, #gdMobar').length);
    ok('桌面端无行动条残留', deskBar === 0, 'nodes=' + deskBar);

    // 过滤已知的外部环境噪声：Airtable 代理 502（2026-11-01 才恢复额度）、
    // GitHub 字体 CORS（仅本地 http server 下触发）、懒加载图片的 ERR_FAILED
    const realErrors = errors.filter(e =>
        !/ServiceWorker|sw\.js|favicon/i.test(e) &&
        !/502|airtable/i.test(e) &&
        !/qiji-combo\.woff2|Access-Control-Allow-Origin/i.test(e) &&
        !/net::ERR_FAILED|net::ERR_ABORTED/i.test(e)
    );
    ok('无 JS 运行时错误（已过滤外部网络噪声）', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
    await browser.close();
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
