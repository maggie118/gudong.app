/**
 * verify-share-feature.js — 2026-10-07（一次性验证脚本）
 * 无头浏览器实测分享功能：
 *   1. header 分享按钮渲染且尺寸正常（不会变巨型/裸块）
 *   2. 语言切换后按钮仍在且未被改写（gd-share-btn 独立类的意义）
 *   3. 桌面无 navigator.share → 走剪贴板降级，点击后 Toast 出现且文案正确
 *   4. 复制到的 URL 等于 canonical
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const { chromium } = require('playwright-core');

function findChrome() {
    const base = path.join(os.homedir(), '.agent-browser', 'browsers');
    const versions = fs.readdirSync(base).sort().reverse();
    for (const v of versions) {
        const exe = path.join(base, v, 'chrome.exe');
        if (fs.existsSync(exe)) return exe;
    }
    throw new Error('未找到 agent-browser Chrome');
}

const ROOT = 'C:/Users/Eastw Engineering/Documents/Gudong';
const PAGES = [
    { file: 'index.html', click: 'gdSharePage' },
    { file: 'sellers/index.html', click: 'gdSharePage' },
    { file: 'sellers/seller-lim-kw-antiques.html', click: 'shareMuseum' }
];

(async () => {
    const browser = await chromium.launch({
        executablePath: findChrome(),
        headless: true,
        args: ['--disable-features=ChromeTips', '--no-first-run']
    });
    let failures = 0;

    for (const p of PAGES) {
        const url = 'file:///' + path.join(ROOT, p.file).replace(/\\/g, '/');
        const ctx = await browser.newContext({
            permissions: ['clipboard-read', 'clipboard-write']
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(300);

        const label = p.file;
        const checks = [];
        const push = (name, ok) => checks.push([name, ok]);

        // 1. 按钮渲染
        const btn = await page.$('.gd-share-btn');
        push('header 分享按钮存在', !!btn);
        if (btn) {
            const box = await btn.boundingBox();
            const svgOk = await btn.$eval('svg', el => {
                const r = el.getBoundingClientRect();
                return r.width > 8 && r.width < 40 && r.height > 8 && r.height < 40;
            }).catch(() => false);
            push('SVG 图标尺寸正常(8~40px)', svgOk && !!box && box.width > 30 && box.width < 80);
            const vis = await btn.evaluate(el => getComputedStyle(el).display !== 'none');
            push('按钮可见', vis);
        }

        // 2. 语言切换后按钮仍完好（applyLang 用 querySelector('.lang-btn')，不能误伤分享按钮）
        await page.evaluate(() => { window.toggleLang(); });
        await page.waitForTimeout(200);
        const langOk = await page.evaluate(() => {
            const b = document.querySelector('.gd-share-btn');
            const lang = document.querySelector('.lang-btn');
            return b && b.querySelector('svg') && lang && /^[EN中]$/.test(lang.textContent.trim());
        });
        push('切换语言后按钮图标完好', langOk);
        await page.evaluate(() => { window.toggleLang(); }); // 切回 zh
        await page.waitForTimeout(200);

        // 3. 桌面端无 navigator.share → 点击走剪贴板降级 + Toast
        const hasNative = await page.evaluate(() => !!navigator.share);
        push('桌面端无原生分享(符合预期)', !hasNative);
        if (btn && !hasNative) {
            await btn.click();
            await page.waitForTimeout(500);
            const toast = await page.evaluate(() => {
                const t = document.querySelector('.gd-toast');
                if (!t) return null;
                const cs = getComputedStyle(t);
                return { text: t.textContent, shown: t.classList.contains('show'), opacity: cs.opacity };
            });
            push('Toast 弹出', !!toast && toast.shown === true);
            push('Toast 文案为中文', !!toast && toast.text.indexOf('链接已复制') >= 0);
            // 4. 剪贴板 URL = canonical
            const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
            const canon = await page.evaluate(() => {
                const c = document.querySelector('link[rel="canonical"]');
                return c ? c.href : null;
            });
            push('剪贴板 URL = canonical', clip !== null && clip === canon);
        }

        // 5. 无 JS 运行时错误
        push('无页面 JS 错误', errors.length === 0);

        const bad = checks.filter(c => !c[1]).map(c => c[0]);
        console.log((bad.length ? '✗ ' : '✓ ') + label + (bad.length ? '  失败: ' + bad.join(', ') : '  全部通过'));
        if (bad.length) failures++;
        if (errors.length) console.log('    JS errors:', errors.join(' | '));
        await ctx.close();
    }

    await browser.close();
    console.log(failures ? ('验证失败 ' + failures + ' 页') : '无头浏览器验证全部通过');
    process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
