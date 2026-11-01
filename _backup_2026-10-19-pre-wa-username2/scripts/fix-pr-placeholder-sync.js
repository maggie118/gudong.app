// 修补：弹窗 textarea placeholder 需随 data-lang 切换实时更新
// 原实现只在页面加载时判断一次，加载后再切语言 placeholder 不跟随。
// 改为 MutationObserver 监听 body[data-lang]。
// 幂等：已含 attributeFilter 的文件跳过；写入前反向还原自检。
const fs = require('fs');
const FILES = ['bronze', 'coins', 'jade', 'misc', 'paintings', 'porcelain']
  .map(n => `categories/${n}.html`);

const OLD = "      var rk=document.getElementById('pr_remark');\n      if(rk&&prIsEn())rk.placeholder='Anything you would like us to focus on?';";
const NEW = "      var rk=document.getElementById('pr_remark');\n      function prSyncPlaceholder(){if(rk)rk.placeholder=prIsEn()?'Anything you would like us to focus on?':'希望重点优化哪里？';}\n      prSyncPlaceholder();\n      if(rk&&window.MutationObserver)new MutationObserver(prSyncPlaceholder).observe(document.body,{attributes:true,attributeFilter:['data-lang']});";

for (const f of FILES) {
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes("attributeFilter")) { console.log(`跳过(已修补): ${f}`); continue; }

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const oldS = OLD.split('\n').join(eol);
  const newS = NEW.split('\n').join(eol);

  if (html.split(oldS).length - 1 !== 1) { console.error(`✗ ${f} 未唯一匹配到目标片段，中止`); process.exit(1); }

  const next = html.split(oldS).join(newS);
  if (next.replace(newS, oldS) !== html) { console.error(`✗ ${f} 反向还原不一致，中止`); process.exit(1); }

  fs.writeFileSync(f, next, 'utf8');
  console.log(`已修补 ${f}`);
}
console.log('完成');
