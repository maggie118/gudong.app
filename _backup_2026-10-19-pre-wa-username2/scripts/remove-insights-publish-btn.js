/**
 * 删除 insights/*.html（及 templates/article.html）header 右上角的
 * 「发布藏品 / Publish」按钮（<a class="btn-publish-text">）及其 CSS 规则。
 *
 * - 幂等：没有命中的文件直接跳过，不产生写入。
 * - 定点正则替换，不 split/join 整篇，避免破坏混合换行符（\r\n / \n）。
 * - 写入前断言替换后不再含 btn-publish-text；写后回读逐字节校验。
 *
 * 用法：node scripts/remove-insights-publish-btn.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const targets = [];

const insightsDir = path.join(ROOT, 'insights');
for (const f of fs.readdirSync(insightsDir).sort()) {
  if (f.endsWith('.html')) targets.push(path.join(insightsDir, f));
}
const template = path.join(ROOT, 'templates', 'article.html');
if (fs.existsSync(template)) targets.push(template);

// 1) 按钮元素（单行或三行两种写法），连同行首缩进与行尾换行一起删
const reAnchor =
  /[ \t]*<a href="\.\.\/pricing\.html#seller-services" class="btn-publish-text">[\s\S]*?<\/a>(?:\r?\n)?/g;

// 2) 两条相邻 CSS 规则：.btn-publish-text {...} 与 .btn-publish-text:hover {...}
const reCss =
  /[ \t]*\.btn-publish-text \{[\s\S]*?\}\r?\n[ \t]*\.btn-publish-text:hover \{[^}]*\}(?:\r?\n)?/g;

let changed = 0;
let alreadyClean = 0;
const problems = [];
const details = [];

for (const file of targets) {
  const src = fs.readFileSync(file, 'utf8');
  const anchors = src.match(reAnchor) || [];
  const css = src.match(reCss) || [];
  let html = src.replace(reAnchor, '').replace(reCss, '');

  if (html === src) {
    if (src.includes('btn-publish-text')) {
      problems.push(`${rel(file)}: 存在 btn-publish-text 但两个正则均未命中，需人工处理`);
    } else {
      alreadyClean++;
    }
    continue;
  }

  if (html.includes('btn-publish-text')) {
    problems.push(`${rel(file)}: 替换后仍残留 btn-publish-text（CSS 规则可能不相邻），需人工处理`);
    continue;
  }

  fs.writeFileSync(file, html);

  const back = fs.readFileSync(file, 'utf8');
  if (back !== html || back.includes('btn-publish-text')) {
    problems.push(`${rel(file)}: 写入回读校验失败`);
    continue;
  }

  changed++;
  details.push(`${rel(file)}: anchor x${anchors.length}, css x${css.length}`);
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

console.log(`共 ${targets.length} 个文件；本次修改 ${changed} 个；已干净跳过 ${alreadyClean} 个`);
for (const d of details) console.log('  - ' + d);
if (problems.length) {
  console.error('\n⚠️ 未处理干净：');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\n✅ 全部通过：所有目标文件已不含 btn-publish-text');
