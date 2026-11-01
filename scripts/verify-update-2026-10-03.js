/**
 * 静态断言：核对本轮 7 项改动的落地情况。
 * 只读文件、不修改，纯校验。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['airtable-script', 'node_modules', '.git', '.workbuddy', 'prototypes']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.html')) out.push(path.join(dir, e.name));
  }
  return out;
}

const files = walk(ROOT);
const read = (f) => fs.readFileSync(f, 'utf8');
let fail = 0;

function check(name, cond, detail = '') {
  const mark = cond ? '✓' : '✗';
  if (!cond) fail++;
  console.log(`${mark} ${name}${detail ? ' —— ' + detail : ''}`);
}

// 1. 卖家展馆 → 藏家展馆
{
  let oldCn = 0, oldEn = 0, newCn = 0, newEn = 0;
  for (const f of files) {
    const s = read(f);
    oldCn += (s.match(/卖家展馆/g) || []).length;
    oldEn += (s.match(/Seller Gallery/g) || []).length;
    newCn += (s.match(/藏家展馆/g) || []).length;
    newEn += (s.match(/Collector Gallery/g) || []).length;
  }
  check('1. 卖家展馆/ Seller Gallery 已清零', oldCn === 0 && oldEn === 0, `残留 ${oldCn}/${oldEn}`);
  check('   藏家展馆 / Collector Gallery 已铺开', newCn > 0 && newEn > 0, `zh ${newCn} 处 / en ${newEn} 处`);
}

// 2. 刊登藏品 → 发布我的藏品
{
  let navOld = 0, navNew = 0, navNewEn = 0;
  for (const f of files) {
    const s = read(f);
    // 导航/按钮形态才算需要改的；条款正文里的「所刊登藏品」等语义用法不计
    navOld += (s.match(/<span class="zh">刊登藏品<\/span>/g) || []).length;
    navOld += (s.match(/>刊登藏品<\/a>/g) || []).length;
    navNew += (s.match(/<span class="zh">发布我的藏品(?:信息)?<\/span>/g) || []).length;
    navNewEn += (s.match(/<span class="en">Publish My Item<\/span>/g) || []).length;
  }
  check('2. 导航层「刊登藏品」已清零', navOld === 0, `残留 ${navOld}`);
  check('   发布我的藏品 / Publish My Item 中英成对', navNew === navNewEn && navNew > 0, `zh ${navNew} / en ${navNewEn}`);
}

// 3. collection.html 精修入口 + 弹窗
{
  const s = read(path.join(ROOT, 'collection.html'));
  check('3a. collection.html 有「想要同款图片效果？」入口', s.includes('想要同款图片效果？'));
  check('3b. collection.html 有英文入口', s.includes('Want the Same Photo Finish?'));
  check('3c. 弹窗结构完整（CSS+HTML+JS）',
    s.includes('id="photoRetouchModal"') &&
    s.includes('.pr-modal-overlay') &&
    s.includes('function openPhotoRetouchModal()') &&
    s.includes('function submitPhotoRetouch()'));
  check('3d. 入口绑定弹窗打开函数', s.includes('onclick="openPhotoRetouchModal()"'));
}

// 4. 精修申请提交 → wa.me/6591888952
{
  const targets = ['collection.html', ...files.filter((f) => f.includes('categories')).map((f) => path.relative(ROOT, f))];
  let bad = [];
  let hit = 0;
  for (const t of targets) {
    const s = read(path.join(ROOT, t));
    if (!s.includes('function submitPhotoRetouch()')) continue;
    hit++;
    if (!s.includes('wa.me/6591888952')) bad.push(t);
  }
  check('4. 精修申请跳转 wa.me/6591888952', bad.length === 0 && hit >= 7, `覆盖 ${hit} 页，异常 ${bad.length} ${bad.join(',')}`);
}

// 4b. 精修弹窗「先提交、后付款」改版（2026-10-03 第二批）
{
  const prPages = [
    'categories/bronze.html', 'categories/coins.html', 'categories/jade.html',
    'categories/misc.html', 'categories/paintings.html', 'categories/porcelain.html',
    'collection.html',
  ];
  const leftover = [];
  const btnBad = [];
  const flowBad = [];
  const msgBad = [];

  for (const rel of prPages) {
    const s = read(path.join(ROOT, rel));
    // PayNow 区块（金额 + QR 占位 + 付款截图上传）应完全移除
    if (s.includes('pr_paynow') || s.includes('pr-paynow-block') || s.includes('pr-qr-placeholder')) {
      leftover.push(rel);
    }
    if (!s.includes('提交精修申请，跳转WhatsApp获取PayNow')) btnBad.push(rel);
    if (!s.includes('3 个工作日') || !s.includes('付款二维码')) flowBad.push(rel);
    // 提交消息应改为「请发送 PayNow 付款二维码」，不再说已附截图
    if (!s.includes('请发送 PayNow 付款二维码') || s.includes('已附 PayNow 付款截图')) msgBad.push(rel);
  }
  check('4b-1. PayNow 区块已从 7 页移除', leftover.length === 0, leftover.join(', '));
  check('4b-2. 按钮文案为「跳转WhatsApp获取PayNow」', btnBad.length === 0, btnBad.join(', '));
  check('4b-3. 流程含「发二维码 → 回传截图 → 3 个工作日」', flowBad.length === 0, flowBad.join(', '));
  check('4b-4. 提交消息改为索取 PayNow 二维码', msgBad.length === 0, msgBad.join(', '));

  // JS 里不应再有 PayNow 截图必填校验
  const jsBad = prPages.filter((rel) => {
    const s = read(path.join(ROOT, rel));
    return /if\s*\(\s*!pay\s*\|\|/.test(s) || /getElementById\('pr_paynow'\)/.test(s);
  });
  check('4b-5. JS 已移除付款截图必填校验', jsBad.length === 0, jsBad.join(', '));
}

// 5. 专家预约提交 → platformWa = 6591888952
{
  let hit = 0, bad = [];
  for (const f of files) {
    const s = read(f);
    if (!s.includes('function submitExpertBooking')) continue;
    hit++;
    if (!s.includes('const platformWa = "6591888952";')) bad.push(path.relative(ROOT, f));
  }
  check('5. 专家预约跳转 6591888952', bad.length === 0 && hit >= 15, `覆盖 ${hit} 页，异常 ${bad.length} ${bad.join(',')}`);
}

// 6. 首页「实时剩余席位」
{
  const s = read(path.join(ROOT, 'index.html'));
  check('6a. 首页有「实时剩余席位：」', s.includes('实时剩余席位：'));
  check('6b. 英文版 Seats remaining', s.includes('Seats remaining:'));
  check('6c. 位于「名额有限，按申请顺序审核。」下方',
    s.indexOf('实时剩余席位：') > s.indexOf('名额有限，按申请顺序审核。'));
  check('6d. 计数逻辑存在（88 席 / 基准 5）',
    s.includes('SEATS_TOTAL = 88') && s.includes('SEATS_BASELINE_ADMITTED = 5') && s.includes('function renderSeats'));
  check('6e. 加载失败也有兜底数字', /renderSeats\(null\)/.test(s));
  // 模板同步
  const t = read(path.join(ROOT, 'templates', 'article.html'));
  check('6f. article.html 模板同步', t.includes('实时剩余席位：') && t.includes('function renderSeats'));
}

// 7. 页脚免责声明
{
  let oldZh = 0, oldEn = 0, newZh = 0, newEn = 0;
  for (const f of files) {
    const s = read(f);
    // 只统计页脚 disclaimer 区块内的旧文案。
    // privacy.html / terms.html 正文里的 "is an information and discovery platform..."
    // 属于法律条款表述，不在本次改动范围，应保留。
    oldZh += (s.match(/footer-disclaimer zh">gudong\.app 是信息发现平台/g) || []).length;
    oldEn += (s.match(/footer-disclaimer en">gudong\.app is an information and discovery platform/g) || []).length;
    newZh += (s.match(/footer-disclaimer zh">gudong\.app 是高级古董发现平台/g) || []).length;
    newEn += (s.match(/footer-disclaimer en">gudong\.app is a premium antiques discovery platform/g) || []).length;
  }
  check('7a. 页脚旧文案已清零', oldZh === 0 && oldEn === 0, `残留 zh ${oldZh} / en ${oldEn}`);
  check('   页脚新文案中英成对', newZh === newEn && newZh > 0, `zh ${newZh} / en ${newEn}`);
}

console.log(`\n扫描 ${files.length} 个 HTML，断言失败 ${fail} 项`);
process.exit(fail ? 1 : 0);