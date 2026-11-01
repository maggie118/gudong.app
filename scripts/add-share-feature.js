/**
 * add-share-feature.js — 2026-10-07
 * 给首页 + sellers/ 全部 5 页注入「分享」功能：
 *   1. header 右上角分享按钮（.gd-share-btn，独立类，避免被 querySelector('.lang-btn') 误改写）
 *   2. 页尾注入 gdShare 基础设施（Web Share API → navigator.clipboard → execCommand 三级降级 + Toast 反馈）
 *   3. sellers 4 个卖家页：重写既有 shareMuseum()，改为按当前语言生成标题并委托 gdShare
 *
 * 约定：
 *   - 幂等：重复运行自动跳过已注入的文件
 *   - 保持各文件原有换行风格（CRLF/LF），插入内容统一用该文件的 EOL
 *   - 写入前做「删回原文」逐字节比对自检
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Eastw Engineering/Documents/Gudong';
const FILES = {
    home: path.join(ROOT, 'index.html'),
    sellersIndex: path.join(ROOT, 'sellers/index.html'),
    limKw: path.join(ROOT, 'sellers/seller-lim-kw-antiques.html'),
    yakBc: path.join(ROOT, 'sellers/seller-yak-bc-antiques.html'),
    ngLk: path.join(ROOT, 'sellers/seller-ng-lk-antiques.html'),
    ngCy: path.join(ROOT, 'sellers/seller-ng-cy-antiques.html')
};

/* ---------- 工具 ---------- */
function detectEol(s) {
    const crlf = (s.match(/\r\n/g) || []).length;
    const lf = (s.match(/(?<!\r)\n/g) || []).length;
    return crlf >= lf ? '\r\n' : '\n';
}
function eolJoin(lines, eol) { return lines.join(eol); }

/* ---------- 分享按钮 ---------- */
const SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';

function shareBtnHtml(onclick) {
    return '<button type="button" class="gd-share-btn" onclick="' + onclick + '" aria-label="分享 / Share" title="分享 / Share">' + SHARE_SVG + '</button>';
}

/* ---------- 基础设施（CSS + JS），按页注入 ---------- */
function infraCssLines() {
    return [
        '<!-- 2026-10-07：分享功能（Web Share API + 剪贴板降级 + Toast 反馈），全站统一 -->',
        '<style>',
        '.gd-share-btn {',
        '    border: 1px solid var(--color-border); background: transparent;',
        '    color: var(--color-text-secondary); padding: .55rem .7rem; min-height: 44px; min-width: 44px;',
        '    border-radius: var(--btn-radius); cursor: pointer; display: inline-flex;',
        '    align-items: center; justify-content: center; flex-shrink: 0;',
        '    transition: all var(--dur) var(--ease);',
        '}',
        '.gd-share-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }',
        '.gd-share-btn svg { width: 16px; height: 16px; fill: currentColor; display: block; }',
        '.gd-toast {',
        '    position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%) translateY(10px);',
        '    background: rgba(36,31,26,.92); color: #fff; font-size: .85rem;',
        '    padding: .62rem 1.15rem; border-radius: 999px; z-index: 10000;',
        '    opacity: 0; pointer-events: none; transition: opacity .3s ease, transform .3s ease;',
        '    box-shadow: 0 8px 24px rgba(36,31,26,.25); white-space: nowrap;',
        '    max-width: 88vw; overflow: hidden; text-overflow: ellipsis;',
        '}',
        '.gd-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }',
        '</style>'
    ];
}

function infraJsLines() {
    return [
        '<script>',
        '/* 分享：Web Share API（原生分享面板）→ navigator.clipboard → execCommand 三级降级 */',
        '(function () {',
        '    var toastEl = null, toastTimer = null;',
        '    function gdToast(msg) {',
        '        if (!toastEl) {',
        '            toastEl = document.createElement("div");',
        '            toastEl.className = "gd-toast";',
        '            document.body.appendChild(toastEl);',
        '        }',
        '        toastEl.textContent = msg;',
        '        toastEl.classList.add("show");',
        '        clearTimeout(toastTimer);',
        '        toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);',
        '    }',
        '    function gdCopyText(text, done, fail) {',
        '        function legacy() {',
        '            var ta = document.createElement("textarea");',
        '            ta.value = text;',
        '            ta.setAttribute("readonly", "");',
        '            ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";',
        '            document.body.appendChild(ta);',
        '            ta.select();',
        '            if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);',
        '            var ok = false;',
        '            try { ok = document.execCommand("copy"); } catch (e) {}',
        '            document.body.removeChild(ta);',
        '            if (ok) { done(); } else if (fail) { fail(); }',
        '        }',
        '        if (navigator.clipboard && window.isSecureContext) {',
        '            navigator.clipboard.writeText(text).then(done, function () { legacy(); });',
        '        } else { legacy(); }',
        '    }',
        '    window.gdShare = function (opts) {',
        '        opts = opts || {};',
        '        var can = document.querySelector(\'link[rel="canonical"]\');',
        '        var url = opts.url || (can ? can.href : location.href);',
        '        var lang = (document.body.dataset && document.body.dataset.lang) || "zh";',
        '        var title = opts.title || document.title;',
        '        var text = opts.text || "";',
        '        if (navigator.share) {',
        '            navigator.share({ title: title, text: text, url: url }).then(function () {}, function () {});',
        '            return;',
        '        }',
        '        gdCopyText(url, function () {',
        '            gdToast(lang === "zh" ? "链接已复制，去分享给朋友吧" : "Link copied — share it with friends");',
        '        }, function () {',
        '            gdToast(lang === "zh" ? "复制失败，请手动复制地址栏链接" : "Copy failed — please copy the URL from the address bar");',
        '        });',
        '    };',
        '})();',
        '</scr' + 'ipt>'
    ];
}

/* 各页 gdSharePage：分享文案按语言切换 */
function homeSharePageLines() {
    return [
        '<script>',
        'window.gdSharePage = function () {',
        '    var lang = (document.body.dataset && document.body.dataset.lang) || "zh";',
        '    window.gdShare({',
        '        title: lang === "zh" ? "古董圈 Gudong.app · 新加坡古董捡漏情报站" : "Gudong.app · Singapore Antiques Daily Radar",',
        '        text: lang === "zh" ? "每天 5 分钟，看看今天有什么漏可捡" : "5 minutes a day. See what\'s undervalued today."',
        '    });',
        '};',
        '</scr' + 'ipt>'
    ];
}

function sellersIndexSharePageLines() {
    return [
        '<script>',
        'window.gdSharePage = function () {',
        '    var lang = (document.body.dataset && document.body.dataset.lang) || "zh";',
        '    window.gdShare({',
        '        title: lang === "zh" ? "古董圈 · 私家藏馆" : "Gudong · Private Collection Gallery",',
        '        text: lang === "zh" ? "来古董圈逛逛藏家们的私家藏馆" : "Browse private collector galleries on gudong.app"',
        '    });',
        '};',
        '</scr' + 'ipt>'
    ];
}

/* ---------- sellers 4 页：shareMuseum 重写 ---------- */
function newShareMuseumLines() {
    return [
        'function shareMuseum() {',
        '    var lang = (document.body.dataset && document.body.dataset.lang) || "zh";',
        '    var nameEl = document.getElementById(lang === "en" ? "sellerNameEn" : "sellerNameZh");',
        '    var name = (nameEl && nameEl.textContent) || "Gudong";',
        '    window.gdShare({',
        '        title: lang === "en" ? name + " · Gudong Private Gallery" : name + " · 古董圈私家藏馆",',
        '        text: lang === "en" ? "Browse this private collector gallery on gudong.app" : "来古董圈逛逛这家私家藏馆"',
        '    });',
        '}'
    ];
}

/* ---------- 注入逻辑 ---------- */
function injectHeaderBtn(html, onclick) {
    if (html.includes('gd-share-btn')) { console.log('    · header 按钮已存在，跳过'); return { html: html, changed: false }; }
    const m = html.match(/^([ \t]*)<div class="header-right">/m);
    if (!m) throw new Error('找不到 header-right 锚点');
    const eol = detectEol(html);
    const anchor = m[0];
    const insert = anchor + eol + m[1] + '    ' + shareBtnHtml(onclick);
    const out = html.replace(anchor, insert);
    // 自检：把插入串换回锚点应逐字节还原
    if (out.replace(insert, anchor) !== html) throw new Error('header 注入自检失败');
    return { html: out, changed: true };
}

function injectInfra(html, extraLines) {
    if (html.includes('window.gdShare')) { console.log('    · gdShare 基础设施已存在，跳过'); return { html: html, changed: false }; }
    const eol = detectEol(html);
    const lines = [].concat(infraCssLines(), infraJsLines(), extraLines || []);
    const block = eolJoin(lines, eol);
    if (!html.includes('</body>')) throw new Error('找不到 </body> 锚点');
    const insert = block + eol + '</body>';
    const out = html.replace('</body>', insert);
    if (out.replace(insert, '</body>') !== html) throw new Error('基础设施注入自检失败');
    return { html: out, changed: true };
}

function rewriteShareMuseum(html) {
    const eol = detectEol(html);
    if (!/^([ \t]*)function shareMuseum\(\) \{/m.test(html)) {
        console.log('    · 未找到 shareMuseum()（可能已是新版），跳过');
        return { html: html, changed: false };
    }
    // 从函数起点匹配到「行首恰好 8 空格 + } 且该行到此结束」的闭括号。
    // 注意 (?![^\r\n]) 保证行尾结束 —— 否则懒惰匹配会在 "} else {" 的 } 处提前收尾（首轮踩过的坑）。
    const re = /function shareMuseum\(\) \{[\s\S]*?\r?\n {8}\}(?![^\r\n])/;
    const m = html.match(re);
    if (!m) throw new Error('shareMuseum 区块匹配失败，中止');
    const region = m[0];
    const hasNew = region.includes('window.gdShare');
    const hasLeftover = region.includes('} else {');
    if (hasNew && !hasLeftover) { console.log('    · shareMuseum 已是新版，跳过'); return { html: html, changed: false }; }
    const isOriginal = !hasNew && region.includes('navigator.share');
    const isBroken = hasNew && hasLeftover && region.includes('navigator.clipboard');
    if (!isOriginal && !isBroken) throw new Error('shareMuseum 区块内容异常，中止');
    // 目标缩进固定 8 空格，与文件内其他函数一致（损坏态的新函数是 12 空格，一并纠正）
    const targetIndent = '        ';
    const newFn = newShareMuseumLines()
        .map(function (l) {
            return (l === 'function shareMuseum() {' || l === '}') ? targetIndent + l : targetIndent + '    ' + l;
        })
        .join(eol);
    const out = html.replace(region, newFn);
    // 自检：换回原区块应逐字节还原
    if (out.replace(newFn, region) !== html) throw new Error('shareMuseum 重写自检失败');
    return { html: out, changed: true };
}

/* ---------- 执行 ---------- */
const plans = [
    { key: 'home',         headerOnclick: 'gdSharePage()',  extra: homeSharePageLines(),        seller: false },
    { key: 'sellersIndex', headerOnclick: 'gdSharePage()',  extra: sellersIndexSharePageLines(), seller: false },
    { key: 'limKw', headerOnclick: 'shareMuseum()', extra: null, seller: true },
    { key: 'yakBc', headerOnclick: 'shareMuseum()', extra: null, seller: true },
    { key: 'ngLk',  headerOnclick: 'shareMuseum()', extra: null, seller: true },
    { key: 'ngCy',  headerOnclick: 'shareMuseum()', extra: null, seller: true }
];

let touched = 0, skipped = 0;
for (const p of plans) {
    const file = FILES[p.key];
    let html = fs.readFileSync(file, 'utf8');
    const orig = html;
    let changed = false, tmp;

    console.log('== ' + path.relative(ROOT, file));

    tmp = injectHeaderBtn(html, p.headerOnclick);
    html = tmp.html; changed = changed || tmp.changed;

    tmp = injectInfra(html, p.extra);
    html = tmp.html; changed = changed || tmp.changed;

    if (p.seller) {
        tmp = rewriteShareMuseum(html);
        html = tmp.html; changed = changed || tmp.changed;
    }

    if (changed) {
        fs.writeFileSync(file, html, 'utf8');
        console.log('    ✓ 已写入');
        touched++;
    } else {
        console.log('    · 无改动（幂等跳过）');
        skipped++;
    }
}

console.log('');
console.log('完成：写入 ' + touched + ' 个文件，跳过 ' + skipped + ' 个。');
