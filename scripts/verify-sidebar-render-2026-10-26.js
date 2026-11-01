// 无头浏览器验证：各层页面侧边栏导航渲染与 index.html 一致
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');

const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const EXE = path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe');

const PAGES = [
    { rel: 'index.html', expectActive: 'index.html' },
    { rel: 'about.html', expectActive: 'about.html' },
    { rel: 'insights.html', expectActive: 'insights.html' },
    { rel: 'collection.html', expectActive: 'collection.html' },
    { rel: 'categories/jade.html', expectActive: 'categories/jade.html' },
    { rel: 'insights/qing-porcelain-dating.html', expectActive: 'insights.html' },
    { rel: 'items/item-lim-04.html', expectActive: 'collection.html' },
    { rel: 'sellers/index.html', expectActive: 'sellers/index.html' },
    { rel: 'tools/index.html', expectActive: 'tools/index.html' },
    { rel: 'tools/valuation.html', expectActive: 'tools/valuation.html' },
    { rel: 'my/saved.html', expectActive: 'my/saved.html' },
    { rel: 'pricing.html', expectActive: null }
];

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
    if (cond) { pass++; console.log('  ✓ ' + msg + (extra ? '  [' + extra + ']' : '')); }
    else { fail++; console.log('  ✗ ' + msg + '  [' + (extra || '') + ']'); }
}

(async () => {
    const browser = await chromium.launch({ executablePath: EXE, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    // 基准：首页导航的可见文案序列
    const basePage = await ctx.newPage();
    await basePage.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await basePage.evaluate(() => document.fonts.ready);
    await basePage.waitForTimeout(1500);
    const BASE_NAV = await basePage.evaluate(() =>
        Array.from(document.querySelectorAll('.sidebar-nav a')).map(a => {
            const r = a.getBoundingClientRect();
            return { href: a.getAttribute('href'), cls: a.className, w: Math.round(r.width), vis: r.width > 0 };
        }));
    await basePage.close();
    console.log('基准导航项：' + BASE_NAV.length);

    for (const p of PAGES) {
        console.log('\n=== ' + p.rel + ' ===');
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
        await page.goto(BASE + '/' + p.rel, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1200);

        // 打开侧边栏
        const opened = await page.evaluate(() => {
            if (typeof openSidebar === 'function') { openSidebar(); return true; }
            return false;
        });
        await page.waitForTimeout(600);

        const r = await page.evaluate(() => {
            const nav = document.querySelector('.sidebar-nav');
            const sidebar = document.getElementById('sidebar');
            const sb = sidebar.getBoundingClientRect();
            const items = Array.from(nav.querySelectorAll('a')).map(a => {
                const rect = a.getBoundingClientRect();
                return {
                    href: a.getAttribute('href'), cls: a.className, txt: a.innerText.trim().slice(0, 40),
                    vis: rect.width > 0 && rect.height > 0
                };
            });
            const active = items.filter(i => /active/.test(i.cls));
            return {
                navVisible: sb.width > 0 && nav.getBoundingClientRect().height > 0,
                sidebarWidth: Math.round(sb.width),
                items, active: active.map(a => a.href),
                overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
            };
        });

        ok(opened, '存在 openSidebar 并成功调用');
        ok(r.items.length === BASE_NAV.length, '导航项数量与首页一致',
            r.items.length + ' vs ' + BASE_NAV.length);
        ok(r.items.every(i => i.vis), '所有导航项可见（无塌陷/无 0 宽）',
            r.items.filter(i => !i.vis).length + ' 项不可见');
        // 文案序列比较：把首页锚点按目标页深度做等价换算后再比（去掉 active 差异）
        const depth = p.rel.split('/').length - 1;
        const pfx = '../'.repeat(depth);
        // 逐项严格比对（href+class）
        let firstDiff = '';
        for (let i = 0; i < BASE_NAV.length; i++) {
            let eh = BASE_NAV[i].href, ec = BASE_NAV[i].cls.replace(' active', '');
            if (p.rel !== 'index.html') {
                if (eh === '#insights') eh = 'insights.html';
                else if (eh.startsWith('#')) eh = 'index.html' + eh;
                eh = pfx + eh;
            }
            const a = r.items[i];
            if (!a || a.href !== eh || a.cls.replace(' active', '') !== ec) {
                firstDiff = '第' + i + '项 ' + (a ? a.href + '/' + a.cls : 'none') + ' != ' + eh + '/' + ec;
                break;
            }
        }
        ok(firstDiff === '', '链接 href/层级/顺序与首页逐项一致', firstDiff);
        if (p.expectActive) {
            ok(r.active.length === 1 && r.active[0].replace(/^\.\.\//, '') === p.expectActive,
                '高亮项指向 ' + p.expectActive, JSON.stringify(r.active));
        } else {
            ok(r.active.length === 0, '无对应栏目时不误高亮', JSON.stringify(r.active));
        }
        ok(!r.overflowX, '无横向溢出');
        const real = errs.filter(e => !/ServiceWorker|sw\.js|favicon|airtable-proxy|Failed to fetch|500|502|404/i.test(e));
        ok(real.length === 0, '无 JS 运行时错误', real.slice(0, 2).join(' | '));

        await page.close();
    }

    await browser.close();
    console.log('\n通过 ' + pass + ' / 失败 ' + fail);
    process.exit(fail ? 1 : 0);
})();
