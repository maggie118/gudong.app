// 为 insights/*.html 文章开头署名后追加"未经授权禁止转载"（中英）
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'insights');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const variants = [
    // 变体1：古董圈编辑整理 / Gudong editorial
    {
        from: '<span class="zh">古董圈编辑整理</span><span class="en">Gudong editorial</span>',
        to: '<span class="zh">古董圈编辑整理 · 未经授权禁止转载</span><span class="en">Gudong editorial · No reposting without permission</span>'
    },
    // 变体2：古董圈编辑部 / Gudong Editorial
    {
        from: '<span class="zh">古董圈编辑部</span><span class="en">Gudong Editorial</span>',
        to: '<span class="zh">古董圈编辑部 · 未经授权禁止转载</span><span class="en">Gudong Editorial · No reposting without permission</span>'
    }
];

let ok = 0, skip = 0, fail = 0;
for (const f of files) {
    const fp = path.join(dir, f);
    try {
        let html = fs.readFileSync(fp, 'utf8');
        if (html.includes('未经授权禁止转载')) { skip++; continue; }
        let changed = false;
        for (const v of variants) {
            if (html.includes(v.from)) {
                html = html.split(v.from).join(v.to);
                changed = true;
            }
        }
        if (!changed) { console.error('NO BYLINE FOUND: ' + f); fail++; continue; }
        fs.writeFileSync(fp, html, 'utf8');
        ok++;
    } catch (err) {
        console.error('FAIL ' + f + ': ' + err.message);
        fail++;
    }
}
console.log('Total: ' + files.length + ' | Modified: ' + ok + ' | Skipped: ' + skip + ' | Failed: ' + fail);
