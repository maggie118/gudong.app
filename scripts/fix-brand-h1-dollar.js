// 修复 add-brand-logo.js 留下的字面量 $3（应为 .brand h1 {）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'airtable-script', 'content', 'prototypes'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : e.name.endsWith('.html') && files.push(p);
  }
})(ROOT);

const re = /(@media \(max-width: 640px\) \{ \.brand-logo-img \{ height: 30px; \} \})(\r?\n)([ \t]*)\$3/;
let fixed = 0;
for (const f of files) {
  let h = fs.readFileSync(f, 'utf8');
  if (re.test(h)) {
    h = h.replace(re, '$1$2$3.brand h1 {');
    fs.writeFileSync(f, h);
    fixed++;
  }
}
console.log('fixed:', fixed);
