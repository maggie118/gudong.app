// 全面诊断：安装按钮 + 弹窗组件完整性
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const skip = ['node_modules', 'airtable-script', '.git', '.workbuddy'];
function walk(d, o) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (!skip.includes(e.name)) walk(path.join(d, e.name), o); }
        else if (e.name.endsWith('.html')) o.push(path.join(d, e.name));
    }
    return o;
}
const files = walk(root, []);
const checks = {
    'btn-css': /\.app-install-btn\s*\{/,
    'btn-svg-css': /\.app-install-btn\s+svg\s*\{/,
    'modal-markup': /id="gdInstallModal"/,
    'modal-css': /\.gd-install-modal\s*\{/,
    'modal-js': /gdCloseInstall/,
    'install-btn-markup': /app-install-btn/
};
const rows = [];
for (const fp of files) {
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    const html = fs.readFileSync(fp, 'utf8');
    const r = { rel, missing: [] };
    for (const [name, re] of Object.entries(checks)) {
        if (!re.test(html)) r.missing.push(name);
    }
    if (r.missing.length) rows.push(r);
}
for (const r of rows) console.log(r.rel + '\n    missing: ' + r.missing.join(', '));
console.log('\n--- files with missing pieces: ' + rows.length + ' / scanned ' + files.length);
