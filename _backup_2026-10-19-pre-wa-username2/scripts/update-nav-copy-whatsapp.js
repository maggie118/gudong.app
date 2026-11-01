/**
 * 批量更新站点导航文案 / 页脚声明 / WhatsApp 号码
 * 幂等：已替换过的文件跳过，可安全重跑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['airtable-script', 'node_modules', '.git', '.workbuddy', 'prototypes', 'scripts']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.html')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// ---- 替换规则：按顺序逐条定点替换，保留原有 EOL，不重排全文 ----
const RULES = [
  // 1) 侧栏「卖家展馆」→「藏家展馆」（中英）
  {
    zh: '<span class="zh">卖家展馆</span><span class="en">Seller Gallery</span>',
    to: '<span class="zh">藏家展馆</span><span class="en">Collector Gallery</span>',
    label: '侧栏 卖家展馆',
  },
  // 首页正文的「卖家展馆 →」入口，保持与侧栏一致
  {
    zh: '<a href="sellers/index.html" class="more zh">卖家展馆 →</a>',
    to: '<a href="sellers/index.html" class="more zh">藏家展馆 →</a>',
    label: '首页入口 卖家展馆(zh)',
  },
  {
    zh: '<a href="sellers/index.html" class="more en">Seller Gallery →</a>',
    to: '<a href="sellers/index.html" class="more en">Collector Gallery →</a>',
    label: '首页入口 Seller Gallery(en)',
  },
  // pricing.html 侧栏为纯中文（无 zh/en span），单独一条
  {
    zh: '<a href="sellers/index.html" class="sidebar-link" onclick="closeSidebar()">卖家展馆</a>',
    to: '<a href="sellers/index.html" class="sidebar-link" onclick="closeSidebar()">藏家展馆</a>',
    label: 'pricing 侧栏 卖家展馆(纯中文)',
  },

  // 2) 「刊登藏品」→「发布我的藏品」（中英），仅导航/按钮/FAQ 问句层
  {
    zh: '<span class="zh">刊登藏品</span><span class="en">List an Item</span>',
    to: '<span class="zh">发布我的藏品</span><span class="en">Publish My Item</span>',
    label: '刊登藏品→发布我的藏品(双语 span)',
  },
  {
    zh: '<span class="zh">刊登藏品信息</span><span class="en">List an Item</span>',
    to: '<span class="zh">发布我的藏品信息</span><span class="en">Publish My Item</span>',
    label: '刊登藏品信息(双语 span)',
  },
  // pricing.html 侧栏/按钮为纯中文（无 span）
  {
    zh: '<a href="pricing.html#core-services" class="btn-publish">刊登藏品</a>',
    to: '<a href="pricing.html#core-services" class="btn-publish">发布我的藏品</a>',
    label: 'pricing btn-publish 刊登藏品',
  },
  {
    zh: '<a href="pricing.html#core-services" class="sidebar-link active" onclick="closeSidebar()">刊登藏品</a>',
    to: '<a href="pricing.html#core-services" class="sidebar-link active" onclick="closeSidebar()">发布我的藏品</a>',
    label: 'pricing sidebar 刊登藏品',
  },
  // FAQ 问句：刊登藏品收费吗？
  {
    zh: '<summary><span class="zh">刊登藏品收费吗？</span><span class="en">Is listing free?</span></summary>',
    to: '<summary><span class="zh">发布我的藏品收费吗？</span><span class="en">Is listing free?</span></summary>',
    label: 'FAQ 问句(zh)',
  },
  {
    zh: '{ "@type": "Question", "name": "刊登藏品收费吗？"',
    to: '{ "@type": "Question", "name": "发布我的藏品收费吗？"',
    label: 'FAQ JSON-LD 问句',
  },

  // 3) 页脚免责声明改写（中英）
  {
    zh: '<p class="footer-disclaimer zh">gudong.app 是信息发现平台，而非交易平台。</p>',
    to: '<p class="footer-disclaimer zh">gudong.app 是高级古董发现平台，仅提供信息、展示与连接服务，不参与买卖交易。</p>',
    label: '页脚声明(zh)',
  },
  {
    zh: '<p class="footer-disclaimer en">gudong.app is an information and discovery platform for antiques and collectibles.</p>',
    to: '<p class="footer-disclaimer en">gudong.app is a premium antiques discovery platform. It provides information, display and connection services only, and does not participate in any sale or transaction.</p>',
    label: '页脚声明(en)',
  },

  // 4) WhatsApp 号码统一：占位号 6591234567 → 真实号 6591888952
  {
    zh: 'wa.me/6591234567',
    to: 'wa.me/6591888952',
    label: 'WhatsApp 号码 (wa.me)',
  },
  // 专家预约走 platformWa 变量，不带 wa.me/ 前缀
  {
    zh: 'const platformWa = "6591234567";',
    to: 'const platformWa = "6591888952";',
    label: 'WhatsApp 号码 (platformWa)',
  },
];

const files = walk(ROOT);
const stats = {};
let touched = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let html = original;
  let fileHits = 0;
  const applied = [];

  for (const rule of RULES) {
    if (!html.includes(rule.zh)) continue;
    const parts = html.split(rule.zh);
    const n = parts.length - 1;
    html = parts.join(rule.to);
    stats[rule.label] = (stats[rule.label] || 0) + n;
    fileHits += n;
    applied.push(rule);
  }

  if (html !== original) {
    // 写回前自检：只对本轮实际命中的规则做反向替换，应逐字节还原为原文
    // （不能对全部规则反向，否则会动到上一轮已改好的文案）
    let verify = html;
    for (const rule of applied) {
      verify = verify.split(rule.to).join(rule.zh);
    }
    if (verify !== original) {
      console.error('✗ 往返自检失败，已跳过：', path.relative(ROOT, file));
      process.exitCode = 1;
      continue;
    }
    fs.writeFileSync(file, html, 'utf8');
    touched++;
    console.log(`✓ ${path.relative(ROOT, file)}  (${fileHits} 处)`);
  }
}

console.log('\n===== 替换汇总 =====');
for (const [label, n] of Object.entries(stats)) {
  console.log(`${label}: ${n}`);
}
console.log(`\n扫描文件 ${files.length} 个，实际修改 ${touched} 个`);