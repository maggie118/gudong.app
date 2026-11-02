/* gd-install.js — 全站统一 PWA 安装引导（iOS 安全）
 * 自包含：注入弹窗 HTML + CSS，捕获阶段拦截 .app-install-btn 点击。
 * 非 iOS：有 beforeinstallprompt 时直接调起安装；不可用时仅显示一行提示。
 * iOS 无安装 API → 弹窗引导「分享→添加到主屏幕」；
 * 微信等应用内浏览器 → 红字提示「请先用 Safari 打开」。 */
(function () {
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });

  // 确保 PWA 可安装（部分页面未内联注册 Service Worker）
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

  function injectCSS() {
    if (document.getElementById('gd-install-css')) return;
    var s = document.createElement('style');
    s.id = 'gd-install-css';
    s.textContent = [
      '.gd-install-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:1.2rem;}',
      '.gd-install-modal.open{display:flex;}',
      '.gd-install-card{background:#fff;border-radius:var(--card-radius,14px);max-width:350px;width:100%;padding:1.6rem 1.4rem 1.2rem;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.25);position:relative;}',
      '.gd-install-close{position:absolute;top:.5rem;right:.7rem;border:0;background:none;font-size:1.4rem;color:#999;cursor:pointer;padding:.5rem;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;line-height:1;}',
      '.gd-install-title{font-size:1.08rem;font-weight:700;color:#3d2b1f;margin:.2rem 0 1rem;}',
      '.gd-install-steps{text-align:left;margin:0 auto 1rem;max-width:290px;}',
      '.gd-install-step{display:flex;align-items:flex-start;gap:.6rem;padding:.5rem 0;color:#5a4636;font-size:.9rem;line-height:1.5;}',
      '.gd-install-step .n{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#f0e4d8;color:#7A4E33;font-weight:700;font-size:.78rem;display:flex;align-items:center;justify-content:center;margin-top:.1rem;}',
      '.gd-install-step svg{flex-shrink:0;width:22px;height:22px;fill:#007AFF;margin-top:.1rem;}',
      '.gd-install-note{font-size:.78rem;color:#9a8d80;margin-top:.5rem;line-height:1.5;}',
      '.gd-install-warning{background:#F3EAE0;border-radius:10px;padding:.8rem;color:#7A4E33;font-size:.85rem;line-height:1.55;margin-bottom:.8rem;text-align:left;}',
      'body[data-lang="en"] .gd-install-modal .zh{display:none;}',
      'body[data-lang="zh"] .gd-install-modal .en{display:none;}',
      '.gd-install-modal[data-lang="en"] .zh{display:none;}',
      '.gd-install-modal[data-lang="zh"] .en{display:none;}',
      '.gd-install-hint{text-align:center;color:#5a4636;font-size:.9rem;line-height:1.6;margin:.2rem 0 1rem;}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function injectModal() {
    var existing = document.getElementById('gdInstallModal');
    if (existing) return existing;
    var d = document.createElement('div');
    d.className = 'gd-install-modal';
    d.id = 'gdInstallModal';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.innerHTML =
      '<div class="gd-install-card">' +
        '<button type="button" class="gd-install-close" id="gdInstallClose" aria-label="close">&times;</button>' +
        '<div class="gd-install-title zh">安装 古董.app 到主屏幕</div>' +
        '<div class="gd-install-title en">Add Gudong.app to Home Screen</div>' +
        '<div class="gd-install-warning" id="gdInAppWarning" style="display:none;">' +
          '<div class="zh">你当前使用的应用内浏览器（如微信、微博等）不支持直接安装。请先用 Safari 打开本页，再按下方步骤操作。</div>' +
          '<div class="en">Your current in-app browser doesn&apos;t support Add to Home Screen. Please open this page in Safari first, then follow the steps below.</div>' +
        '</div>' +
        '<div class="gd-install-steps" id="gdStepsIos">' +
          '<div class="gd-install-step"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C12 2 8 6 8 6h3v6h2V6h3l-4-4zM5 9v9c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V9h-2v9H7V9H5z"/></svg><span class="zh">点击 Safari 底部工具栏的「分享」按钮</span><span class="en">Tap the Share button in Safari&apos;s bottom toolbar</span></div>' +
          '<div class="gd-install-step"><span class="n">2</span><span class="zh">上滑分享菜单，选择「添加到主屏幕」</span><span class="en">Scroll the share sheet and choose &quot;Add to Home Screen&quot;</span></div>' +
          '<div class="gd-install-step"><span class="n">3</span><span class="zh">点击右上角「添加」，古董.app 即出现在桌面</span><span class="en">Tap &quot;Add&quot; in the top right &mdash; Gudong.app appears on your Home Screen</span></div>' +
        '</div>' +
        '<div class="gd-install-steps" id="gdStepsOther" style="display:none;">' +
          '<div class="gd-install-step"><span class="n">1</span><span class="zh">点击浏览器地址栏右侧的「安装」图标</span><span class="en">Click the install icon at the right of the address bar</span></div>' +
          '<div class="gd-install-step"><span class="n">2</span><span class="zh">或通过浏览器菜单 &rarr;「安装古董圈」</span><span class="en">Or open the browser menu &rarr; &quot;Install Gudong&quot;</span></div>' +
        '</div>' +
        '<div class="gd-install-hint" id="gdInstallHint" style="display:none;">' +
          '<span class="zh">请使用浏览器菜单中的「安装应用」完成安装。</span>' +
          '<span class="en">Use your browser menu&rsquo;s &ldquo;Install app&rdquo; option to complete installation.</span>' +
        '</div>' +
        '<div class="gd-install-note zh">安装后可像原生 App 一样全屏使用，无需应用商店。</div>' +
        '<div class="gd-install-note en">Runs full-screen like a native app. No app store needed.</div>' +
      '</div>';
    document.body.appendChild(d);
    return d;
  }

  function init() {
    injectCSS();
    var modal = injectModal();
    function close() { modal.classList.remove('open'); }
    modal.addEventListener('click', function (e) {
      if (e.target === modal || (e.target.id === 'gdInstallClose')) close();
    });

    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isInAppBrowser = /MicroMessenger|Weibo|FBAN|FBAV|Instagram|Line|Twitter|WhatsApp|Snapchat|TikTok/i.test(ua);
    var isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    function hideBtns() { document.querySelectorAll('.app-install-btn').forEach(function (b) { b.style.display = 'none'; }); }
    if (isStandalone) hideBtns();

    // 旧版内联弹窗可能没有提示行，动态补齐
    var hint = document.getElementById('gdInstallHint');
    if (!hint) {
      var card = modal.querySelector('.gd-install-card') || modal;
      hint = document.createElement('div');
      hint.id = 'gdInstallHint';
      hint.className = 'gd-install-hint';
      hint.style.display = 'none';
      hint.innerHTML = '<span class="zh">请使用浏览器菜单中的「安装应用」完成安装。</span><span class="en">Use your browser menu&rsquo;s &ldquo;Install app&rdquo; option to complete installation.</span>';
      card.appendChild(hint);
    }

    window.addEventListener('appinstalled', hideBtns);

    // 捕获阶段拦截：非 iOS 直接调起安装；仅 iOS 显示分步引导
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.app-install-btn') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { deferredPrompt = null; }).catch(function () {});
        return;
      }
      var lang = (document.body && document.body.dataset && document.body.dataset.lang === 'en') ? 'en' : 'zh';
      modal.setAttribute('data-lang', lang);
      var stepsIos = document.getElementById('gdStepsIos');
      var stepsOther = document.getElementById('gdStepsOther');
      var warning = document.getElementById('gdInAppWarning');
      if (stepsIos) stepsIos.style.display = isIOS ? '' : 'none';
      if (stepsOther) stepsOther.style.display = 'none';
      hint.style.display = isIOS ? 'none' : '';
      if (warning) warning.style.display = (isIOS && isInAppBrowser) ? '' : 'none';
      modal.classList.add('open');
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
