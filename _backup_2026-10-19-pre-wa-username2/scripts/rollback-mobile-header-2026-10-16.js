/**
 * 回滚：移除 fix-mobile-header-2026-10-16.js 注入的 CSS 块（幂等）
 * 用法: node scripts/rollback-mobile-header-2026-10-16.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const MARK = 'gd-mobile-header-fix-2026-10-16';
const SKIP_DIR = /^(_backup_[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP_DIR.test(e.name)) continue; walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}
const files = walk(ROOT);
let removed = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const a = html.indexOf('/*<<<' + MARK + '>>>');
  if (a === -1) continue;
  const b = html.indexOf('/*<<</' + MARK + '>>>*/', a);
  if (b === -1) { console.log('⚠️ 找不到结束标记:', path.relative(ROOT, f)); continue; }
  const end = b + ('/*<<</' + MARK + '>>>*/').length;
  // 连同尾部换行一起删，避免留下空行
  let cut = end;
  if (html[cut] === '\r') cut++;
  if (html[cut] === '\n') cut++;
  fs.writeFileSync(f, html.slice(0, a) + html.slice(cut), 'utf8');
  removed++;
}
console.log(`回滚完成：清理 ${removed} / ${files.length} 页`);
let left = 0;
for (const f of files) if (fs.readFileSync(f, 'utf8').includes('/*<<<' + MARK + '>>>')) left++;
console.log(left === 0 ? '✅ 全部清理干净' : `❌ 仍残留 ${left} 页`);
