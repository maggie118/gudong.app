/* 诊断：今日发现卡片中未加载的图片 + 行家私语移动端实际字号（注入探针） */
const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');
const CHROME = path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92',
    process.platform === 'win32' ? 'chrome.exe' : 'chrome');

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2500);

    const miss = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('#todayFindsGrid img'))
            .filter(i => i.naturalWidth === 0)
            .map(i => ({ src: i.getAttribute('src'), alt: (i.alt || '').slice(0, 40) }));
    });
    console.log('未加载图片：');
    miss.forEach(m => console.log('  - ' + m.src + '   | ' + m.alt));

    // 注入探针测量尚未出现的 .finds-reason 在 390px 的实际字号
    const probe = await page.evaluate(async () => {
        await document.fonts.ready;
        const d = document.createElement('div');
        d.className = 'finds-reason zh';
        d.textContent = '探针 / probe';
        document.getElementById('todayFindsGrid').appendChild(d);
        const cs = getComputedStyle(d);
        const r = { fontSize: cs.fontSize, lineHeight: cs.lineHeight, paddingLeft: cs.paddingLeft, width: Math.round(d.getBoundingClientRect().width) };
        d.remove();
        return r;
    });
    console.log('390px .finds-reason 探针：', JSON.stringify(probe));

    await browser.close();
})();
