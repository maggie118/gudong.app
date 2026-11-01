/**
 * 校验：提取指定 HTML 的所有 inline <script>，逐个做语法检查。
 * 用法：node scripts/check-inline-scripts.js [file1 file2 ...]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.workbuddy', 'tmp', 'check');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('请指定至少一个 HTML 文件');
  process.exit(2);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

let total = 0;
let bad = 0;

for (const rel of files) {
  const full = path.join(ROOT, rel);
  const html = fs.readFileSync(full, 'utf8');
  const re = /<script(?![^>]*\bsrc=)(?![^>]*type=["'](?:application\/ld\+json|application\/json|importmap)["'])[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  let i = 0;
  let ok = true;

  while ((m = re.exec(html))) {
    i++;
    const code = m[1];
    if (!code.trim()) continue;
    total++;

    const safeName = rel.replace(/[\\/]/g, '_');
    const out = path.join(OUT_DIR, `${safeName}.${i}.js`);
    fs.writeFileSync(out, code, 'utf8');

    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (e) {
      ok = false;
      bad++;
      console.log(`✗ ${rel} 第 ${i} 个 inline script 语法错误：${e.message}`);
      console.log(`  已导出：${path.relative(ROOT, out)}`);
    }
  }
  console.log(`${ok ? '✓' : '✗'} ${rel} —— ${i} 个 inline script`);
}

console.log(`\n共检查 ${total} 段内联脚本，失败 ${bad} 段`);
process.exit(bad ? 1 : 0);