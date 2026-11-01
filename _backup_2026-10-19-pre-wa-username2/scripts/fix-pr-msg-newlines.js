// 修复 bilingual-retouch-modal.js 产出的 bug：msg 字符串里的 \n 被写成真实换行，
// 导致 <script> 语法错误、openPhotoRetouchModal 未定义。
// 做法：把断行的两条 msg 语句整行替换回含字面量 \n 的正确写法。
// 幂等：找不到断行模式（已修好）即跳过。写入前自检：替换结果可反向还原。
const fs = require('fs');
const FILES = ['bronze', 'coins', 'jade', 'misc', 'paintings', 'porcelain']
  .map(n => `categories/${n}.html`);

const EN_OK = "if(en){msg='[Photo Retouching Request]\\nSeller ID: '+sid+'\\nWhatsApp: '+wa+'\\nPhotos: '+imgs.length+'\\nRemarks: '+(rk||'None')+'\\nService fee S$59, PayNow screenshot attached. Please verify and proceed.';}";
const ZH_OK = "else{msg='【图片精修申请】\\nSeller ID：'+sid+'\\nWhatsApp：'+wa+'\\n图片数量：'+imgs.length+' 张\\n备注：'+(rk||'无')+'\\n服务费 S$59，已附 PayNow 付款截图，请核验后安排精修。';}";

for (const f of FILES) {
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes(EN_OK) && html.includes(ZH_OK)) { console.log(`跳过(已修好): ${f}`); continue; }

  const reEn = /if\(en\)\{msg='\[Photo Retouching Request\][\s\S]*?proceed\.';\}/;
  const reZh = /else\{msg='【图片精修申请】[\s\S]*?精修。';\}/;
  const mEn = html.match(reEn), mZh = html.match(reZh);
  if (!mEn || !mZh) { console.error(`✗ ${f} 未匹配到断行 msg（en=${!!mEn} zh=${!!mZh}），中止`); process.exit(1); }

  const next = html.replace(reEn, EN_OK).replace(reZh, ZH_OK);
  // 自检：反向替换（新串换回旧串）应还原原文
  const revert = next.replace(EN_OK, mEn[0]).replace(ZH_OK, mZh[0]);
  if (revert !== html) { console.error(`✗ ${f} 反向还原不一致，中止`); process.exit(1); }

  fs.writeFileSync(f, next, 'utf8');
  console.log(`已修复 ${f}（en 段 ${mEn[0].length}B → ${EN_OK.length}B，zh 段 ${mZh[0].length}B → ${ZH_OK.length}B）`);
}
console.log('完成');
