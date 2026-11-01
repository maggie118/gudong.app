// 图片精修弹窗 → 中英双语版（6 个分类页）
// 机制：沿用站内 [data-lang="en"] .zh{display:none} 显隐，文案成对写成 zh/en span。
// 幂等：已含双语标记的文件跳过；写入前做「新块唯一 + 旧块消失 + 反向还原」三项自检。
// 用法：node scripts/bilingual-retouch-modal.js [--dry]
const fs = require('fs');

const FILES = ['bronze', 'coins', 'jade', 'misc', 'paintings', 'porcelain']
  .map(n => `categories/${n}.html`);
const NEW_MARKER = '图片精修服务弹窗（创始卖家专属福利，中英双语）';
const OLD_MARKER = '图片精修服务弹窗（创始卖家专属福利） -->';
const DRY = process.argv.includes('--dry');

// 新弹窗整块（\n 换行，写入时按各文件原换行风格转换）
const RAW = `<!-- ${NEW_MARKER} -->
    <style>
    .pr-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:120;display:none;align-items:center;justify-content:center;padding:1rem;}
    .pr-modal-overlay.show{display:flex;}
    .pr-modal-box{background:#fff;border-radius:12px;max-width:560px;width:100%;padding:1.7rem 1.5rem;position:relative;max-height:90vh;overflow-y:auto;box-shadow:0 18px 50px rgba(0,0,0,.22);animation:pr-in .2s ease;}
    @keyframes pr-in{from{opacity:0;transform:translateY(8px) scale(.98);}to{opacity:1;transform:none;}}
    .pr-modal-close{position:absolute;top:.7rem;right:.9rem;border:none;background:none;font-size:1.5rem;cursor:pointer;color:var(--color-text-secondary);line-height:1;}
    .pr-modal-close:hover{color:var(--color-text);}
    .pr-badge{display:inline-block;padding:.28rem .72rem;background:var(--color-gold-soft);color:var(--color-gold);border-radius:6px;font-size:.78rem;font-weight:700;margin-bottom:.75rem;}
    .pr-title{font-size:1.22rem;font-weight:700;color:var(--color-text);margin-bottom:.9rem;line-height:1.4;}
    .pr-price-block{background:var(--color-primary-light);border-radius:10px;padding:1rem 1.1rem;margin-bottom:1rem;}
    .pr-price-main{font-size:1.1rem;font-weight:800;color:var(--color-primary);margin-bottom:.4rem;}
    .pr-price-main .amt{font-size:1.5rem;}
    .pr-example{font-size:.82rem;color:var(--color-text-secondary);line-height:1.6;margin-bottom:.5rem;}
    .pr-checklist{list-style:none;padding:0;margin:.4rem 0;}
    .pr-checklist li{display:flex;align-items:flex-start;gap:.5rem;font-size:.85rem;color:var(--color-text);padding:.2rem 0;}
    .pr-checklist li svg{flex-shrink:0;width:16px;height:16px;color:var(--color-success);margin-top:.12rem;}
    .pr-checklist li div{flex:1;}
    .pr-li-sub{display:block;font-size:.75rem;color:var(--color-text-secondary);font-weight:400;margin-top:.15rem;line-height:1.5;}
    .pr-note{font-size:.78rem;color:var(--color-text-secondary);line-height:1.6;margin-top:.5rem;}
    .pr-price-sub{font-size:.88rem;font-weight:700;color:var(--color-primary);margin-top:.6rem;line-height:1.5;}
    .pr-warning{background:#FDF6EC;border:1px solid #F0E0C0;border-radius:8px;padding:.8rem 1rem;font-size:.78rem;color:#8A6D3B;line-height:1.6;margin-bottom:1rem;}
    .pr-section-title{font-size:.95rem;font-weight:700;color:var(--color-text);margin:1rem 0 .5rem;}
    .pr-workflow{font-size:.83rem;color:var(--color-text-secondary);line-height:1.7;background:#FAFAF7;border-radius:8px;padding:.8rem 1rem;margin-bottom:.3rem;}
    .pr-workflow p{margin:.3rem 0;}
    .pr-form-row{margin-top:.9rem;}
    .pr-form-row label{display:block;font-size:.82rem;margin-bottom:.35rem;color:var(--color-text-secondary);font-weight:600;}
    .pr-input,.pr-textarea{width:100%;padding:.65rem .8rem;border:1px solid var(--color-border);border-radius:8px;font-size:.88rem;font-family:inherit;color:var(--color-text);background:#fff;transition:.2s;}
    .pr-input:focus,.pr-textarea:focus{outline:none;border-color:var(--color-gold);box-shadow:0 0 0 4px var(--color-gold-soft);}
    .pr-textarea{min-height:80px;resize:vertical;}
    .pr-file-wrap{border:1.5px dashed var(--color-border);border-radius:8px;padding:1rem;text-align:center;cursor:pointer;transition:.2s;background:#FAFAF7;display:block;}
    .pr-file-wrap:hover{border-color:var(--color-primary);background:var(--color-primary-light);}
    .pr-file-wrap input{display:none;}
    .pr-file-plus{font-size:1.3rem;color:var(--color-primary);font-weight:700;line-height:1;}
    .pr-file-text{font-size:.8rem;color:var(--color-text-secondary);margin-top:.25rem;}
    .pr-file-count{font-size:.75rem;color:var(--color-success);margin-top:.2rem;display:none;}
    .pr-file-wrap.has .pr-file-count{display:block;}
    .pr-paynow-block{background:var(--color-primary-light);border-radius:10px;padding:1rem 1.1rem;margin-top:.9rem;}
    .pr-paynow-amount{font-size:1.05rem;font-weight:800;color:var(--color-primary);margin-bottom:.5rem;}
    .pr-qr-placeholder{width:150px;height:150px;margin:.5rem auto;background:#fff;border:1px solid var(--color-border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--color-text-muted);}
    .pr-qr-placeholder svg{width:80px;height:80px;opacity:.25;}
    .pr-submit-btn{width:100%;padding:.9rem;background:var(--color-primary);color:#fff;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;margin-top:1.2rem;transition:.2s;}
    .pr-submit-btn:hover{background:var(--color-primary-dark);}
    .pr-submit-btn:active{transform:translateY(1px);}
    </style>
    <div class="pr-modal-overlay" id="photoRetouchModal" role="dialog" aria-modal="true" aria-label="图片精修申请">
      <div class="pr-modal-box">
        <button type="button" class="pr-modal-close" onclick="closePhotoRetouchModal()" aria-label="关闭">×</button>
        <div class="pr-badge">⭐ <span class="zh">创始卖家专属福利</span><span class="en">Founding Seller Exclusive</span></div>
        <h3 class="pr-title"><span class="zh">想让你的图片也有这样的效果？</span><span class="en">Want your photos to look like this?</span></h3>
        <div class="pr-price-block">
          <div class="pr-price-main"><span class="zh">图片精修 <span class="amt">S$59</span> / 件</span><span class="en">Photo Retouching <span class="amt">S$59</span> / item</span></div>
          <div class="pr-example"><span class="zh">古董圈帮你完成：<b>图片优化 · 标题 · 描述 · 标签 · 发布</b></span><span class="en">Gudong handles it all: <b>Image Enhancement · Title · Description · Tags · Publishing</b></span></div>
          <ul class="pr-checklist">
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><span class="zh">图片优化</span><span class="en">Image Enhancement</span><span class="pr-li-sub zh">光影与亮度 · 色彩与白平衡 · 裁剪与构图 · 背景清理</span><span class="pr-li-sub en">Lighting &amp; brightness · colour &amp; white balance · cropping &amp; composition · background clean-up</span></div></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><span class="zh">标题</span><span class="en">Title</span><span class="pr-li-sub zh">品类、年代、器型一目了然</span><span class="pr-li-sub en">Category, era and form at a glance</span></div></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><span class="zh">描述</span><span class="en">Description</span><span class="pr-li-sub zh">来源与品相如实陈述</span><span class="pr-li-sub en">Origin and condition, honestly stated</span></div></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><span class="zh">标签</span><span class="en">Tags</span><span class="pr-li-sub zh">便于买家按关键词检索</span><span class="pr-li-sub en">Easy for buyers to search by keyword</span></div></li>
            <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div><span class="zh">发布</span><span class="en">Publishing</span><span class="pr-li-sub zh">确认后直接上架到藏品页面</span><span class="pr-li-sub en">Listed on your item page once you approve</span></div></li>
          </ul>
          <div class="pr-note"><span class="zh">不会改变器物真实颜色、形状或实际品相。</span><span class="en">We never alter the true colour, shape or actual condition of your item.</span></div>
          <div class="pr-price-sub"><span class="zh">S$59 / 件（1 件藏品，可上传最多 4 张图片）<br>一次精修最多 4 张 = S$59</span><span class="en">S$59 per item (one item, up to 4 photos)<br>Max 4 photos per order = S$59</span></div>
        </div>
        <div class="pr-warning"><span class="zh">⚠️ 温馨提示：本套餐包含图片精修（光影、调色、裁剪、背景清理）与标题、描述、标签整理，并在确认后发布上架；不含重度修图、创意美化、器物修补、绘图重构等高阶效果，标题与描述将依据你提供的资料如实整理，平台不作真伪鉴定。</span><span class="en">⚠️ Please note: this package covers photo enhancement (lighting, colour, cropping, background clean-up) plus title, description and tag preparation, and publishing after your confirmation. It excludes heavy retouching, creative beautification, object restoration or repainting. Titles and descriptions are prepared faithfully from the information you provide — the platform does not authenticate items.</span></div>
        <div class="pr-section-title"><span class="zh">我们怎么工作：</span><span class="en">How we work</span></div>
        <div class="pr-workflow">
          <p><span class="zh">表单资料 + 原图 + PayNow 截图 → 一次性提交</span><span class="en">Form details + original photos + PayNow screenshot → submit once</span></p>
          <p><span class="zh">后台人工核验 5 项：1. 付款 2. 客户身份 3. 对应藏品 4. 提交原图 5. 客户基础需求</span><span class="en">We manually verify 5 things: 1. payment · 2. your identity · 3. the matching item · 4. the original photos · 5. your basic needs</span></p>
          <p><span class="zh">处理完成后通过 WhatsApp 发送成品给客户确认, 客户认可后，上传部署到藏品页面。</span><span class="en">Once done, we send the finished photos via WhatsApp for your approval; after you confirm, they go live on the item page.</span></p>
        </div>
        <div class="pr-section-title"><span class="zh">图片精修申请表</span><span class="en">Photo Retouching Request Form</span></div>
        <div class="pr-form-row">
          <label><span class="zh">Seller ID（藏家古董网站 ID）</span><span class="en">Seller ID (your Gudong.app ID)</span></label>
          <input class="pr-input" id="pr_seller_id" placeholder="seller-lim-kw-antiques">
        </div>
        <div class="pr-form-row">
          <label>WhatsApp</label>
          <input class="pr-input" id="pr_whatsapp" placeholder="+65 xxxxxxxx">
        </div>
        <div class="pr-form-row">
          <label><span class="zh">上传图片（可多选，最多 4 张）</span><span class="en">Upload photos (multiple allowed, max 4)</span></label>
          <label class="pr-file-wrap" id="pr_images_wrap">
            <input type="file" id="pr_images" multiple accept="image/*">
            <div class="pr-file-plus">＋</div>
            <div class="pr-file-text"><span class="zh">上传图片</span><span class="en">Upload photos</span></div>
            <div class="pr-file-count" id="pr_images_count"></div>
          </label>
        </div>
        <div class="pr-paynow-block">
          <div class="pr-paynow-amount">PayNow S$59</div>
          <div class="pr-qr-placeholder" aria-label="PayNow QR Code">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="18" y1="14" x2="18" y2="21"/><line x1="21" y1="18" x2="14" y2="18"/></svg>
          </div>
          <div class="pr-note" style="margin-top:.6rem;"><span class="zh">完成付款后，请上传付款截图</span><span class="en">After payment, please upload the payment screenshot</span></div>
          <label class="pr-file-wrap" style="margin-top:.6rem;" id="pr_paynow_wrap">
            <input type="file" id="pr_paynow" accept="image/*">
            <div class="pr-file-plus">＋</div>
            <div class="pr-file-text"><span class="zh">上传 PayNow 付款截图</span><span class="en">Upload PayNow payment screenshot</span></div>
            <div class="pr-file-count" id="pr_paynow_count"></div>
          </label>
        </div>
        <div class="pr-form-row">
          <label><span class="zh">备注（可选 · 填写你的基础需求：仅限光影、调色、构图、背景清理）</span><span class="en">Remarks (optional · basic requests only: lighting, colour, composition, background clean-up)</span></label>
          <textarea class="pr-textarea" id="pr_remark" placeholder="希望重点优化哪里？"></textarea>
        </div>
        <button type="button" class="pr-submit-btn" onclick="submitPhotoRetouch()"><span class="zh">提交精修申请 →</span><span class="en">Submit Request →</span></button>
      </div>
    </div>
    <script>
    function openPhotoRetouchModal(){var m=document.getElementById('photoRetouchModal');if(m){m.classList.add('show');document.body.style.overflow='hidden';}}
    function closePhotoRetouchModal(){var m=document.getElementById('photoRetouchModal');if(m){m.classList.remove('show');document.body.style.overflow='';}}
    function prIsEn(){return document.body.getAttribute('data-lang')==='en';}
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePhotoRetouchModal();});
    (function(){var m=document.getElementById('photoRetouchModal');if(m)m.addEventListener('click',function(e){if(e.target===m)closePhotoRetouchModal();});})();
    (function(){
      var rk=document.getElementById('pr_remark');
      function prSyncPlaceholder(){if(rk)rk.placeholder=prIsEn()?'Anything you would like us to focus on?':'希望重点优化哪里？';}
      prSyncPlaceholder();
      if(rk&&window.MutationObserver)new MutationObserver(prSyncPlaceholder).observe(document.body,{attributes:true,attributeFilter:['data-lang']});
      function bindDrop(fileId,wrapId,countId){
        var input=document.getElementById(fileId);var wrap=document.getElementById(wrapId);var count=document.getElementById(countId);
        if(!input||!wrap||!count)return;
        input.addEventListener('change',function(){
          var n=input.files?input.files.length:0;
          if(n>0){wrap.classList.add('has');count.textContent=prIsEn()?(n+(n>1?' files':' file')+' selected'):('已选择 '+n+' 个文件');}
          else{wrap.classList.remove('has');count.textContent='';}
        });
      }
      bindDrop('pr_images','pr_images_wrap','pr_images_count');
      bindDrop('pr_paynow','pr_paynow_wrap','pr_paynow_count');
    })();
    function submitPhotoRetouch(){
      var sid=document.getElementById('pr_seller_id').value.trim();
      var wa=document.getElementById('pr_whatsapp').value.trim();
      var rk=document.getElementById('pr_remark').value.trim();
      var imgs=document.getElementById('pr_images').files;
      var pay=document.getElementById('pr_paynow').files;
      var en=prIsEn();
      if(!sid){alert(en?'Please enter your Seller ID':'请填写 Seller ID');return;}
      if(!wa){alert(en?'Please enter your WhatsApp number':'请填写 WhatsApp 联系方式');return;}
      if(!imgs||imgs.length===0){alert(en?'Please upload the photos to retouch':'请上传需要精修的图片');return;}
      if(imgs.length>4){alert(en?'A maximum of 4 photos per order':'一次精修最多上传 4 张图片');return;}
      if(!pay||pay.length===0){alert(en?'Please upload the PayNow payment screenshot':'请上传 PayNow 付款截图');return;}
      var msg;
      if(en){msg='[Photo Retouching Request]\\nSeller ID: '+sid+'\\nWhatsApp: '+wa+'\\nPhotos: '+imgs.length+'\\nRemarks: '+(rk||'None')+'\\nService fee S$59, PayNow screenshot attached. Please verify and proceed.';}
      else{msg='【图片精修申请】\\nSeller ID：'+sid+'\\nWhatsApp：'+wa+'\\n图片数量：'+imgs.length+' 张\\n备注：'+(rk||'无')+'\\n服务费 S$59，已附 PayNow 付款截图，请核验后安排精修。';}
      window.open('https://wa.me/6591888952?text='+encodeURIComponent(msg),'_blank');
      closePhotoRetouchModal();
    }
    </script>`;

let done = 0, skipped = 0;
for (const f of FILES) {
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes(NEW_MARKER)) { console.log(`跳过(已是双语版): ${f}`); skipped++; continue; }

  const s = html.indexOf('<!-- 图片精修服务弹窗');
  if (s < 0) { console.error(`✗ ${f} 未找到弹窗区块，中止`); process.exit(1); }
  const e = html.indexOf('</script>', s);
  if (e < 0) { console.error(`✗ ${f} 未找到区块结束，中止`); process.exit(1); }
  const end = e + '</script>'.length;
  const oldBlock = html.slice(s, end);
  const eol = oldBlock.includes('\r\n') ? '\r\n' : '\n';
  const newBlock = RAW.split('\n').join(eol);
  const next = html.slice(0, s) + newBlock + html.slice(end);

  // 自检 1：旧标记消失、新标记恰好一次
  if (next.includes(OLD_MARKER)) { console.error(`✗ ${f} 旧标记仍存在，中止`); process.exit(1); }
  if (next.split(NEW_MARKER).length - 1 !== 1) { console.error(`✗ ${f} 新标记计数异常，中止`); process.exit(1); }
  // 自检 2：把新块换回旧块必须逐字节还原原文
  if (next.replace(newBlock, oldBlock) !== html) { console.error(`✗ ${f} 反向还原不一致，中止`); process.exit(1); }
  // 自检 3：区块之外的字节不变
  if (html.slice(0, s) + html.slice(end) !== next.replace(newBlock, '')) { console.error(`✗ ${f} 区块外内容被改动，中止`); process.exit(1); }

  if (!DRY) fs.writeFileSync(f, next, 'utf8');
  console.log(`${DRY ? '[dry] ' : ''}已更新 ${f}（弹窗 ${oldBlock.length}B → ${newBlock.length}B，${eol === '\r\n' ? 'CRLF' : 'LF'}）`);
  done++;
}
console.log(`完成: 更新 ${done} 个, 跳过 ${skipped} 个`);
