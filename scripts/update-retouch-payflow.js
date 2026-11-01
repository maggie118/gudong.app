/**
 * 精修弹窗改版：
 *   1) 删除 PayNow 区块（金额 + QR 占位 + 付款截图上传）
 *   2) 「我们怎么工作」改为先提交、后付款的流程
 *   3) 提交按钮文案改为「提交精修申请，跳转WhatsApp获取PayNow」
 *   4) 移除 JS 里对 PayNow 截图的必填校验（改为提交后由客服发二维码）
 *
 * 7 页副本同步：categories 6 页 + collection.html
 * 幂等：已改过的文件跳过，可安全重跑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'categories/bronze.html',
  'categories/coins.html',
  'categories/jade.html',
  'categories/misc.html',
  'categories/paintings.html',
  'categories/porcelain.html',
  'collection.html',
];

/* ---------- 1. 删除 PayNow 区块 ----------
   从 <div class="pr-paynow-block"> 到该区块的闭合 </div>（含 pr_paynow_count 之后那两层）。 */
const PAYNOW_START = '<div class="pr-paynow-block">';

function removePaynowBlock(html) {
  const start = html.indexOf(PAYNOW_START);
  if (start === -1) return { html, removed: false };

  // pr_paynow_count 之后：></div>(pr-file-count) + </label> + </div>(pr-paynow-block)
  const countAt = html.indexOf('id="pr_paynow_count"></div>', start);
  if (countAt === -1) throw new Error('未找到 pr_paynow_count，区块结构异常');
  const after = html.slice(countAt + 'id="pr_paynow_count"'.length);
  const m = after.match(/^>\s*<\/div>\s*<\/label>\s*<\/div>/);
  if (!m) throw new Error('未找到 PayNow 区块的闭合标签');
  const end = countAt + 'id="pr_paynow_count"'.length + m[0].length;
  // 连同其后的换行一起去掉，避免留下空行
  let tail = end;
  const nl = html.slice(tail).match(/^\r?\n/);
  if (nl) tail += nl[0].length;
  return { html: html.slice(0, start) + html.slice(tail), removed: true };
}

/* ---------- 2. 工作流程重写 ---------- */
const FLOW_NEW_LINES = [
  '<p><span class="zh">表单资料 + 原图 → 提交，跳转 WhatsApp</span><span class="en">Form details + original photos → submit, then continue on WhatsApp</span></p>',
  '<p><span class="zh">客服通过 WhatsApp 发送 PayNow 付款二维码（S$59 / 件）</span><span class="en">Our team sends the PayNow QR code (S$59 per item) via WhatsApp</span></p>',
  '<p><span class="zh">完成付款后，把 PayNow 付款截图发回 WhatsApp</span><span class="en">After payment, send the PayNow payment screenshot back to us on WhatsApp</span></p>',
  '<p><span class="zh">后台在 3 个工作日内完成人工服务并发布</span><span class="en">Our team completes the service manually within 3 business days and publishes it</span></p>',
];

// 用正则整块替换 pr-workflow，避开各页缩进/换行差异
const FLOW_BLOCK_RE = /(<div class="pr-workflow">)([\s\S]*?)(<\/div>)/;
function rewriteFlow(html) {
  const m = html.match(FLOW_BLOCK_RE);
  if (!m) return { html, hit: false };
  // 沿用原缩进（取第一段 <p> 的前导空白）
  const indentMatch = m[2].match(/^[\s]*<p>/);
  const indent = indentMatch ? indentMatch[0].replace('<p>', '') : '          ';
  const body = FLOW_NEW_LINES.map((l) => indent + l).join('\r\n');
  return { html: html.replace(FLOW_BLOCK_RE, (s, a, __, c) => a + '\r\n' + body + '\r\n        ' + c), hit: true };
}

/* ---------- 3. 提交按钮文案 ---------- */
const BTN_OLD = '<button type="button" class="pr-submit-btn" onclick="submitPhotoRetouch()"><span class="zh">提交精修申请 →</span><span class="en">Submit Request →</span></button>';
const BTN_NEW = '<button type="button" class="pr-submit-btn" onclick="submitPhotoRetouch()"><span class="zh">提交精修申请，跳转WhatsApp获取PayNow →</span><span class="en">Submit Request — continue on WhatsApp to get PayNow →</span></button>';

/* ---------- 4. JS：去掉 PayNow 必填校验 ---------- */
const JS_OLD_DECL = "      var pay=document.getElementById('pr_paynow').files;\r\n";
const JS_OLD_CHECK = "      if(!pay||pay.length===0){alert(en?'Please upload the PayNow payment screenshot':'请上传 PayNow 付款截图');return;}\r\n";

const MSG_OLD_EN = "if(en){msg='[Photo Retouching Request]\\nSeller ID: '+sid+'\\nWhatsApp: '+wa+'\\nPhotos: '+imgs.length+'\\nRemarks: '+(rk||'None')+'\\nService fee S$59, PayNow screenshot attached. Please verify and proceed.';}";
const MSG_OLD_ZH = "else{msg='【图片精修申请】\\nSeller ID：'+sid+'\\nWhatsApp：'+wa+'\\n图片数量：'+imgs.length+' 张\\n备注：'+(rk||'无')+'\\n服务费 S$59，已附 PayNow 付款截图，请核验后安排精修。';}";

const MSG_NEW_EN = "if(en){msg='[Photo Retouching Request]\\nSeller ID: '+sid+'\\nWhatsApp: '+wa+'\\nPhotos: '+imgs.length+'\\nRemarks: '+(rk||'None')+'\\nService fee S$59 per item. Please send me the PayNow QR code for payment.';}";
const MSG_NEW_ZH = "else{msg='【图片精修申请】\\nSeller ID：'+sid+'\\nWhatsApp：'+wa+'\\n图片数量：'+imgs.length+' 张\\n备注：'+(rk||'无')+'\\n服务费 S$59/件，请发送 PayNow 付款二维码，我付款后会回传付款截图。';}";

/* ---------- 5. 无用 CSS 一并清掉 ---------- */
// 用正则逐条删除，避免换行符/顺序差异导致匹配失败
const CSS_RULES = [
  /\.pr-paynow-block\{[^}]*\}/,
  /\.pr-paynow-amount\{[^}]*\}/,
  /\.pr-qr-placeholder\{[^}]*\}/,
  /\.pr-qr-placeholder svg\{[^}]*\}/,
];

let changed = 0;
let skipped = 0;

for (const rel of FILES) {
  const full = path.join(ROOT, rel);
  let html = fs.readFileSync(full, 'utf8');

  if (html.includes(MSG_NEW_ZH)) {
    console.log(`· ${rel} 已是新版流程，跳过`);
    skipped++;
    continue;
  }

  let n = 0;

  // 4) JS 先改（避免删掉区块后影响定位）
  const before = html;
  html = html.split(JS_OLD_DECL).join('');
  html = html.split(JS_OLD_CHECK).join('');
  html = html.split(MSG_OLD_EN).join(MSG_NEW_EN);
  html = html.split(MSG_OLD_ZH).join(MSG_NEW_ZH);
  html = html.split("      bindDrop('pr_paynow','pr_paynow_wrap','pr_paynow_count');\r\n").join('');
  if (html !== before) n++;

  // 2) 流程
  const fr = rewriteFlow(html);
  if (fr.hit) {
    html = fr.html;
    n++;
  }

  // 3) 按钮
  if (html.includes(BTN_OLD)) {
    html = html.replace(BTN_OLD, BTN_NEW);
    n++;
  }

  // 5) CSS
  const beforeCss = html;
  for (const re of CSS_RULES) html = html.replace(re, '');
  // 删完可能留下空行，收拾一下
  html = html.replace(/^[ \t]*\r?\n(?=[ \t]*\.pr-submit-btn\{)/m, '');
  if (html !== beforeCss) n++;

  // 1) PayNow 区块
  const r = removePaynowBlock(html);
  if (r.removed) {
    html = r.html;
    n++;
  }

  if (n === 0) {
    console.log(`· ${rel} 未找到任何目标片段，跳过`);
    skipped++;
    continue;
  }

  // 自检：改完后不应再有 PayNow 区块残留
  if (html.includes('pr_paynow') || html.includes('pr-paynow-block') || html.includes('pr-qr-placeholder')) {
    console.error(`✗ ${rel} 仍残留 PayNow 相关标记，已中止写入`);
    process.exitCode = 1;
    continue;
  }

  fs.writeFileSync(full, html, 'utf8');
  changed++;
  console.log(`✓ ${rel} —— ${n} 组改动`);
}

console.log(`\n修改 ${changed} 个文件，跳过 ${skipped} 个`);