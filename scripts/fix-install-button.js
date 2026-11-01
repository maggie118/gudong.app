// 修复：为缺失安装按钮样式/弹窗组件的 HTML 补齐 CSS + 标记 + JS，
// 并给安装按钮内联 SVG 加上 width/height 兜底属性（防止 CSS 失效时渲染成巨型图标）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// ---------- 待补的 CSS：按钮样式（3 条） ----------
const CSS_BTN = `.app-install-btn { display: inline-flex; align-items: center; gap: .3rem; margin-left: .6rem; padding: .3rem .7rem; border: 1px solid #e3d9cf; border-radius: 999px; color: #7a6a5c; font-size: .78rem; text-decoration: none; vertical-align: middle; transition: .2s; }
.app-install-btn:hover { border-color: #8A5A3B; color: #8A5A3B; background: #f0e4d8; }
.app-install-btn svg { width: 12px; height: 12px; flex-shrink: 0; fill: currentColor; }`;

// ---------- 待补的 CSS：安装引导弹窗 ----------
const CSS_MODAL = `.gd-install-modal { position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.45); padding: 1.2rem; }
.gd-install-modal.open { display: flex; }
.gd-install-card { background: #fff; border-radius: 14px; max-width: 350px; width: 100%; padding: 1.6rem 1.4rem 1.2rem; text-align: center; box-shadow: 0 18px 50px rgba(0,0,0,.25); position: relative; }
.gd-install-close { position: absolute; top: .5rem; right: .7rem; border: 0; background: none; font-size: 1.4rem; color: #999; cursor: pointer; padding: .3rem; line-height: 1; }
.gd-install-title { font-size: 1.08rem; font-weight: 700; color: #3d2b1f; margin: .2rem 0 1rem; }
.gd-install-steps { text-align: left; margin: 0 auto 1rem; max-width: 290px; }
.gd-install-step { display: flex; align-items: flex-start; gap: .6rem; padding: .5rem 0; color: #5a4636; font-size: .9rem; line-height: 1.5; }
.gd-install-step .n { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; background: #f0e4d8; color: #8A5A3B; font-weight: 700; font-size: .78rem; display: flex; align-items: center; justify-content: center; margin-top: .1rem; }
.gd-install-step svg { flex-shrink: 0; width: 22px; height: 22px; fill: #007AFF; margin-top: .1rem; }
.gd-install-note { font-size: .78rem; color: #9a8d80; margin-top: .5rem; line-height: 1.5; }
.gd-install-modal [data-lang="en"] .zh, body[data-lang="en"] .gd-install-modal .zh { display: none; }
.gd-install-modal [data-lang="zh"] .en, body[data-lang="zh"] .gd-install-modal .en { display: none; }`;

// ---------- 待补的弹窗标记 + JS ----------
const MODAL_BLOCK = `
<!-- 安装引导弹窗 -->
<div class="gd-install-modal" id="gdInstallModal" role="dialog" aria-modal="true" aria-label="Install guide">
    <div class="gd-install-card">
        <button type="button" class="gd-install-close" onclick="gdCloseInstall()" aria-label="close">×</button>
        <div class="gd-install-title zh">安装 古董.app 到主屏幕</div>
        <div class="gd-install-title en">Add Gudong.app to Home Screen</div>
        <div class="gd-install-steps" id="gdStepsIos">
            <div class="gd-install-step"><svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18.2c-4.5 0-8.2-3.7-8.2-8.2S7.5 3.8 12 3.8s8.2 3.7 8.2 8.2-3.7 8.2-8.2 8.2zM11 7l-4 4h3v6h2v-6h3l-4-4z"/></svg><span class="zh">点击 Safari 底部工具栏的「分享」按钮</span><span class="en">Tap the Share button in Safari's bottom toolbar</span></div>
            <div class="gd-install-step"><span class="n">2</span><span class="zh">在分享菜单中选择「添加到主屏幕」</span><span class="en">Choose "Add to Home Screen" in the share menu</span></div>
            <div class="gd-install-step"><span class="n">3</span><span class="zh">点击右上角「添加」，桌面即出现古董.app 图标</span><span class="en">Tap "Add" — the Gudong.app icon appears on your Home Screen</span></div>
        </div>
        <div class="gd-install-steps" id="gdStepsOther" style="display:none;">
            <div class="gd-install-step"><span class="n">1</span><span class="zh">点击浏览器地址栏右侧的「安装」图标</span><span class="en">Click the install icon at the right of the address bar</span></div>
            <div class="gd-install-step"><span class="n">2</span><span class="zh">或通过浏览器菜单 →「安装古董圈」</span><span class="en">Or open the browser menu → "Install Gudong"</span></div>
        </div>
        <div class="gd-install-note zh">安装后可像原生 App 一样全屏使用，无需应用商店。</div>
        <div class="gd-install-note en">Runs full-screen like a native app. No app store needed.</div>
    </div>
</div>
<script>
(function () {
    var modal = document.getElementById('gdInstallModal');
    if (!modal) return;
    window.gdCloseInstall = function () { modal.classList.remove('open'); };
    modal.addEventListener('click', function (e) { if (e.target === modal) gdCloseInstall(); });

    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
    window.addEventListener('appinstalled', function () {
        document.querySelectorAll('.app-install-btn').forEach(function (b) { b.style.display = 'none'; });
    });

    document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.app-install-btn') : null;
        if (!btn) return;
        e.preventDefault();
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(function () { deferredPrompt = null; }).catch(function () {});
            return;
        }
        var ua = navigator.userAgent;
        var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        document.getElementById('gdStepsIos').style.display = isIOS ? '' : 'none';
        document.getElementById('gdStepsOther').style.display = isIOS ? 'none' : '';
        modal.classList.add('open');
    });
})();
</script>
</body>`;

// 目标文件：缺安装组件的 insights 页面 + 模板
const targets = [
    'insights/ancient-jade-stains.html', 'insights/auction-house-watch.html',
    'insights/bamboo-ivory-cracks.html', 'insights/bronze-age-copper.html',
    'insights/bronze-censer-patina.html', 'insights/bronze-patina-soil.html',
    'insights/burial-climate-north-south.html', 'insights/canton-thirteen-hongs.html',
    'insights/coin-aging-tricks.html', 'insights/coin-casting-dating.html',
    'insights/coin-cleaning.html', 'insights/coin-patina-types.html',
    'insights/first-collection.html', 'templates/article.html'
];

let fixed = 0;
for (const rel of targets) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) { console.error('MISSING FILE: ' + rel); continue; }
    let html = fs.readFileSync(fp, 'utf8');
    const before = html;

    // 1) 补按钮 CSS（若缺失）
    if (!/\.app-install-btn\s*\{/.test(html)) {
        html = html.replace(/\s*<\/style>/i, '\n' + CSS_BTN + '\n</style>');
    }
    // 2) 补弹窗 CSS（若缺失）
    if (!/\.gd-install-modal\s*\{/.test(html)) {
        html = html.replace(/\s*<\/style>/i, '\n' + CSS_MODAL + '\n</style>');
    }
    // 3) 补弹窗标记 + JS（若缺失）
    if (!/id="gdInstallModal"/.test(html)) {
        if (!/<\/body>/i.test(html)) { console.error('NO </body>: ' + rel); continue; }
        html = html.replace(/<\/body>/i, MODAL_BLOCK);
    }
    if (html !== before) { fs.writeFileSync(fp, html, 'utf8'); fixed++; }
}
console.log('Component fix applied to ' + fixed + ' / ' + targets.length + ' files');

// ---------- 兜底加固：给所有安装按钮 SVG 加 width/height ----------
const skip = ['node_modules', 'airtable-script', '.git', '.workbuddy'];
function walk(d, o) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!skip.includes(e.name)) walk(path.join(d, e.name), o); }
        else if (e.name.endsWith('.html')) o.push(path.join(d, e.name));
    }
    return o;
}
const SVG_OLD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>';
const SVG_NEW = '<svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>';
let svgFiles = 0, svgCount = 0;
for (const fp of walk(root, [])) {
    const html = fs.readFileSync(fp, 'utf8');
    const n = html.split(SVG_OLD).length - 1;
    if (n === 0) continue;
    fs.writeFileSync(fp, html.split(SVG_OLD).join(SVG_NEW), 'utf8');
    svgFiles++; svgCount += n;
}
console.log('SVG hardening: ' + svgCount + ' icons in ' + svgFiles + ' files');
