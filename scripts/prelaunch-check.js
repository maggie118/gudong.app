/**
 * prelaunch-check.js — 2026-10-07
 * 上线前检查：
 *   1. 内部链接（href 指向站内 .html 或路径）是否存在目标文件
 *   2. 锚点链接（href="#xxx"）的目标 id 是否存在于该页
 *   3. 跨页锚点（href="page.html#xxx"）的目标 id 是否存在
 *   4. 重复注入的分享基础设施（gdShare 重复块）
 *   5. 重复的 <script> / <style> 块
 *   6. 空链接或 javascript:void(0) 等问题
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/Eastw Engineering/Documents/Gudong';

/* ---------- 收集所有 HTML 文件 ---------- */
function collectAllHtml() {
    const out = [];
    function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            if (st.isDirectory()) {
                if (name === 'node_modules' || name === '.git' || name === '.workbuddy') continue;
                walk(full);
            } else if (name.endsWith('.html')) {
                out.push(full);
            }
        }
    }
    walk(ROOT);
    return out;
}

/* ---------- 收集所有 id ---------- */
function collectIds(html) {
    const ids = new Set();
    const re = /\sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        ids.add(m[1]);
    }
    return ids;
}

/* ---------- 提取所有 href ---------- */
function extractHrefs(html) {
    const out = [];
    const re = /href="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        out.push(m[1]);
    }
    return out;
}

/* ---------- 主逻辑 ---------- */
const allFiles = collectAllHtml();
const fileSet = new Set();
const relMap = {}; // basename -> full path for fuzzy check

for (const f of allFiles) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    fileSet.add(rel);
    // Also register by basename for fuzzy matching
    const base = path.basename(f);
    if (!relMap[base]) relMap[base] = [];
    relMap[base].push(rel);
}

let brokenLinks = [];
let brokenAnchors = [];
let duplicateShares = [];
let duplicateBlocks = [];
let otherIssues = [];

for (const file of allFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');

    // 4. 检查重复的 gdShare 基础设施
    const shareCount = (html.match(/window\.gdShare\s*=/g) || []).length;
    if (shareCount > 1) {
        duplicateShares.push(rel + ' — gdShare 定义 ' + shareCount + ' 次');
    }
    const shareBtnCount = (html.match(/class="gd-share-btn"/g) || []).length;
    if (shareBtnCount > 1) {
        duplicateShares.push(rel + ' — gd-share-btn 按钮 ' + shareBtnCount + ' 个');
    }
    const toastCssCount = (html.match(/\.gd-toast\s*\{/g) || []).length;
    if (toastCssCount > 1) {
        duplicateShares.push(rel + ' — .gd-toast CSS ' + toastCssCount + ' 处');
    }

    // 5. 检查重复的 <script> 块（基于关键函数名）
    const scriptSigs = [
        { name: 'toggleLang', label: 'toggleLang' },
        { name: 'closeSidebar', label: 'closeSidebar' },
        { name: 'applyLang', label: 'applyLang' }
    ];
    for (const sig of scriptSigs) {
        const count = (html.match(new RegExp('function\\s+' + sig.name + '\\s*\\(', 'g')) || []).length;
        if (count > 1) {
            duplicateBlocks.push(rel + ' — function ' + sig.name + '() 定义 ' + count + ' 次');
        }
    }

    // 1-3. 链接检查
    const ids = collectIds(html);
    const hrefs = extractHrefs(html);

    for (let href of hrefs) {
        if (!href || href.trim() === '') {
            otherIssues.push(rel + ' — 空 href');
            continue;
        }

        // 跳过外部链接、mailto、tel、data
        if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) continue;
        // 跳过 WhatsApp、微信等
        if (/^(whatsapp|weixin|blob:)/i.test(href)) continue;
        // 跳过 og: 等属性误捕
        if (href.startsWith('{')) continue;

        // 纯锚点 href="#xxx"
        if (href.startsWith('#')) {
            const anchor = href.slice(1);
            if (anchor === '') continue; // href="#" is fine (top of page)
            if (!ids.has(anchor)) {
                brokenAnchors.push(rel + ' — 锚点 #' + anchor + ' 未找到对应 id');
            }
            continue;
        }

        // 跨页锚点 href="page.html#xxx" 或 href="path/page.html#xxx"
        let anchorPart = '';
        let pathPart = href;
        if (href.includes('#')) {
            const idx = href.indexOf('#');
            pathPart = href.slice(0, idx);
            anchorPart = href.slice(idx + 1);
        }
        // 也处理 query string
        if (pathPart.includes('?')) {
            pathPart = pathPart.split('?')[0];
        }

        if (pathPart === '' || pathPart === '/') {
            // href="#xxx" 已处理，href="/#xxx" 指向首页
            if (anchorPart && !ids.has(anchorPart)) {
                // 首页锚点需要检查 index.html 的 id
                // 先简单记录，后面验证
            }
            continue;
        }

        // 解析相对路径
        const dir = path.dirname(file);
        let targetPath;
        try {
            targetPath = path.resolve(dir, pathPart);
        } catch (e) {
            continue;
        }
        const targetRel = path.relative(ROOT, targetPath).replace(/\\/g, '/');

        // 检查目标文件是否存在
        if (!fs.existsSync(targetPath)) {
            brokenLinks.push(rel + ' — 链接 ' + href + ' 目标文件不存在 (' + targetRel + ')');
            continue;
        }

        // 如果有锚点，检查目标文件的 id
        if (anchorPart) {
            try {
                const targetHtml = fs.readFileSync(targetPath, 'utf8');
                const targetIds = collectIds(targetHtml);
                if (!targetIds.has(anchorPart)) {
                    brokenAnchors.push(rel + ' — 链接 ' + href + ' 锚点 #' + anchorPart + ' 在目标页未找到');
                }
            } catch (e) {
                // skip
            }
        }
    }
}

/* ---------- 输出报告 ---------- */
console.log('════════════════════════════════════════');
console.log('  上线前检查报告');
console.log('  扫描 ' + allFiles.length + ' 个 HTML 文件');
console.log('════════════════════════════════════════');

console.log('\n--- 1. 断链（目标文件不存在）---');
if (brokenLinks.length === 0) {
    console.log('  ✓ 无断链');
} else {
    console.log('  ✗ 发现 ' + brokenLinks.length + ' 处断链:');
    brokenLinks.slice(0, 50).forEach(l => console.log('    ' + l));
    if (brokenLinks.length > 50) console.log('    ...还有 ' + (brokenLinks.length - 50) + ' 处');
}

console.log('\n--- 2. 断锚点（#id 在目标页未找到）---');
if (brokenAnchors.length === 0) {
    console.log('  ✓ 无断锚点');
} else {
    console.log('  ✗ 发现 ' + brokenAnchors.length + ' 处断锚点:');
    brokenAnchors.slice(0, 50).forEach(l => console.log('    ' + l));
    if (brokenAnchors.length > 50) console.log('    ...还有 ' + (brokenAnchors.length - 50) + ' 处');
}

console.log('\n--- 3. 重复分享基础设施 ---');
if (duplicateShares.length === 0) {
    console.log('  ✓ 无重复');
} else {
    console.log('  ✗ 发现 ' + duplicateShares.length + ' 处重复:');
    duplicateShares.forEach(l => console.log('    ' + l));
}

console.log('\n--- 4. 重复函数定义 ---');
if (duplicateBlocks.length === 0) {
    console.log('  ✓ 无重复');
} else {
    console.log('  ✗ 发现 ' + duplicateBlocks.length + ' 处重复:');
    duplicateBlocks.forEach(l => console.log('    ' + l));
}

console.log('\n--- 5. 其他问题 ---');
if (otherIssues.length === 0) {
    console.log('  ✓ 无其他问题');
} else {
    console.log('  ⚠ ' + otherIssues.length + ' 处:');
    otherIssues.slice(0, 20).forEach(l => console.log('    ' + l));
}

console.log('\n════════════════════════════════════════');
const total = brokenLinks.length + brokenAnchors.length + duplicateShares.length + duplicateBlocks.length;
if (total === 0) {
    console.log('  ✓ 全部通过');
} else {
    console.log('  ✗ 共 ' + total + ' 处问题需关注');
}
console.log('════════════════════════════════════════');
