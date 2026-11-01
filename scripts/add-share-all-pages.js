/**
 * add-share-all-pages.js — 2026-10-07
 * 给除首页和 sellers/ 之外的所有 HTML 页面注入「分享」功能：
 *   1. header 右上角分享按钮（.gd-share-btn，onclick="gdSharePage()"）
 *   2. 页尾注入 gdShare 基础设施（Web Share API → navigator.clipboard → execCommand 三级降级 + Toast 反馈）
 *   3. 通用 gdSharePage：使用 document.title + canonical URL + 通用分享文案
 *
 * 约定：
 *   - 幂等：重复运行自动跳过已注入的文件
 *   - 保持各文件原有换行风格（CRLF/LF）
 *   - 写入前做「删回原文」逐字节比对自检
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Eastw Engineering/Documents/Gudong';

/* ---------- 收集目标文件 ---------- */
function collectTargets() {
    const out = [];

    // 根目录页面（排除 index.html，已有分享功能）
    ['terms.html', 'privacy.html', 'pricing.html', 'collection.html', 'about.html', 'insights.html']
        .forEach(f => out.push(path.join(ROOT, f)));

    // items/ 目录
    const itemsDir = path.join(ROOT, 'items');
    fs.readdirSync(itemsDir).filter(f => f.endsWith('.html')).forEach(f => out.push(path.join(itemsDir, f)));

    // categories/ 目录
    const catDir = path.join(ROOT, 'categories');
    fs.readdirSync(catDir).filter(f => f.endsWith('.html')).forEach(f => out.push(path.join(catDir, f)));

    // insights/ 目录（文章页）
    const insDir = path.join(ROOT, 'insights');
    fs.readdirSync(insDir).filter(f => f.endsWith('.html')).forEach(f => out.push(path.join(insDir, f)));

    // 模板页
    out.push(path.join(ROOT, 'templates', 'article.html'));

    return out;
}

/* ---------- 工具 ---------- */
function detectEol(s) {
    const crlf = (s.match(/\r\n/g) || []).length;
    const lf = (s.match(/(?<!\r)\n/g) || []).length;
    return crlf >= lf ? '\r\n' : '\n';
}

/* ---------- 分享按钮 ---------- */
const SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>';

function shareBtnHtml(indent) {
    return indent + '<button type="button" class="gd-share-btn" onclick="gdSharePage()" aria-label="分享 / Share" title="分享 / Share">' + SHARE_SVG + '</button>';
}

/* ---------- 基础设施（CSS + JS），按页注入 ---------- */
function infraBlock(eol) {
    const lines = [
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
        '</style>',
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
        '<\/script>',
        '<script>',
        'window.gdSharePage = function () {',
        '    var lang = (document.body.dataset && document.body.dataset.lang) || "zh";',
        '    window.gdShare({',
        '        text: lang === "zh" ? "来自古董圈 Gudong.app 的精选内容" : "From Gudong.app — Singapore antiques"',
        '    });',
        '};',
        '<\/script>'
    ];
    return lines.join(eol);
}

/* ---------- 注入逻辑 ---------- */
function injectHeaderBtn(html) {
    if (html.includes('gd-share-btn')) {
        return { html: html, changed: false, reason: 'header 按钮已存在' };
    }
    const m = html.match(/^([ \t]*)<div class="header-right">/m);
    if (!m) {
        return { html: html, changed: false, reason: '找不到 header-right 锚点' };
    }
    const eol = detectEol(html);
    const indent = m[1];
    const anchor = m[0];
    const insert = anchor + eol + shareBtnHtml(indent + '    ');
    const out = html.replace(anchor, insert);
    if (out.replace(insert, anchor) !== html) {
        throw new Error('header 注入自检失败');
    }
    return { html: out, changed: true, reason: 'header 按钮已注入' };
}

function injectInfra(html) {
    if (html.includes('window.gdShare')) {
        return { html: html, changed: false, reason: 'gdShare 基础设施已存在' };
    }
    const eol = detectEol(html);
    if (!html.includes('</body>')) {
        return { html: html, changed: false, reason: '找不到 </body> 锚点' };
    }
    const block = infraBlock(eol);
    const insert = block + eol + '</body>';
    const out = html.replace('</body>', insert);
    if (out.replace(insert, '</body>') !== html) {
        throw new Error('基础设施注入自检失败');
    }
    return { html: out, changed: true, reason: '基础设施已注入' };
}

/* ---------- 执行 ---------- */
const targets = collectTargets();
let touched = 0, skipped = 0, errors = 0;

for (const file of targets) {
    const rel = path.relative(ROOT, file);
    let html;
    try {
        html = fs.readFileSync(file, 'utf8');
    } catch (e) {
        console.log('✗ ' + rel + '  读取失败: ' + e.message);
        errors++;
        continue;
    }

    let changed = false, tmp;

    tmp = injectHeaderBtn(html);
    html = tmp.html;
    changed = changed || tmp.changed;

    tmp = injectInfra(html);
    html = tmp.html;
    changed = changed || tmp.changed;

    if (changed) {
        fs.writeFileSync(file, html, 'utf8');
        console.log('✓ ' + rel);
        touched++;
    } else {
        console.log('· ' + rel + '  (' + (tmp.reason || '跳过') + ')');
        skipped++;
    }
}

console.log('');
console.log('完成：写入 ' + touched + ' 个文件，跳过 ' + skipped + ' 个，错误 ' + errors + ' 个。');
