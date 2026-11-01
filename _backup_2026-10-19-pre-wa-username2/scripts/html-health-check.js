// 全站 HTML 结构体检：标签平衡、CSS/JS 完整性、常见问题
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skipDirs = ['node_modules', 'airtable-script', '.git', '.workbuddy'];

function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (skipDirs.includes(entry.name)) continue;
            walk(path.join(dir, entry.name), out);
        } else if (entry.name.endsWith('.html')) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

const files = walk(root, []);
const count = (str, re) => (str.match(re) || []).length;

let issues = 0;
for (const fp of files) {
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    const html = fs.readFileSync(fp, 'utf8');
    const probs = [];

    const tags = [
        ['style', /<style\b/gi, /<\/style>/gi],
        ['body', /<body\b/gi, /<\/body>/gi],
        ['html', /<html\b/gi, /<\/html>/gi],
        ['head', /<head\b/gi, /<\/head>/gi],
        ['script', /<script\b/gi, /<\/script>/gi],
        ['div', /<div\b/gi, /<\/div>/gi],
        ['footer', /<footer\b/gi, /<\/footer>/gi],
        ['header', /<header\b/gi, /<\/header>/gi],
        ['article', /<article\b/gi, /<\/article>/gi]
    ];
    for (const [name, openRe, closeRe] of tags) {
        const o = count(html, openRe), c = count(html, closeRe);
        if (o !== c) probs.push(`${name}: ${o}/${c}`);
    }
    // 自闭合/未转义检测
    if (!html.trimEnd().endsWith('</html>')) probs.push('EOF not </html>');
    if (html.includes('undefined">')) probs.push('literal undefined attr');
    if (/<span class="zh">\s*<\/span>/.test(html)) probs.push('empty zh span');
    if (count(html, /<style\b/gi) === 0) probs.push('NO inline style');

    if (probs.length) {
        issues++;
        console.log(rel + '  ->  ' + probs.join(' | '));
    }
}
console.log('\nScanned: ' + files.length + ' files | Files with issues: ' + issues);
