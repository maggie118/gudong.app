/*! wa-contact-gate.js — 询价身份确认（2026-11-09）
 * 目的：点藏家 WhatsApp 前，先留下称呼 / 联系方式 / 意向，让每一条询价都是"有名字的人"。
 *   1) 首次点击弹出确认层：称呼 + 邮箱或 WhatsApp + 意向（必选）+ 隐私同意（必选）
 *   2) 确认后立即打开 wa.me（同步 window.open，绝不会被弹窗拦截），后台写 /api/lead
 *   3) 本机记住 365 天：之后点任何藏家都不再弹层，但这次询价照样静默入库
 *   4) Google 登录留开关：页面设置 window.GUDONG_GOOGLE_CLIENT_ID 后自动出现"用 Google 继续"
 *
 * 用法（藏品页 buyer-list.js 之后加一行）：
 *   <script src="../assets/js/wa-contact-gate.js" defer></script>
 * 依赖：/api/lead（Airtable buyer_leads），失败不影响买家跳转。
 */
(function (global) {
  'use strict';

  var KEY = 'gudong_buyer';        /* 与 buyer-list.js 共用同一份本机身份 */
  var PING_KEY = 'gudong_wa_ping'; /* 静默入库的去重记录 */
  var CSS_ID = 'gd-gate-css';
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  var PING_TTL = 24 * 60 * 60 * 1000;

  var INTENTS = [
    { id: 'collection', zh: '自用收藏', en: 'For my collection' },
    { id: 'gift', zh: '送礼', en: 'As a gift' },
    { id: 'investment', zh: '投资考量', en: 'Investment' },
    { id: 'ask', zh: '只是询价', en: 'Just asking' }
  ];

  /* ---------------- 本机状态 ---------------- */
  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  /* 有效身份：有联系方式 + 称呼 + 意向，且未过期 */
  function identity() {
    var me = read();
    if (!me || !me.contact) return null;
    if (!me.name || !me.intent) return null;
    if (!me.ts || Date.now() - me.ts > MAX_AGE) return null;
    return me;
  }

  function isEn() {
    return document.body && document.body.dataset && document.body.dataset.lang === 'en';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txt(sel) {
    var el = document.querySelector(sel);
    return el ? (el.textContent || '').trim() : '';
  }

  /* ---------------- 校验 / 归一 ---------------- */
  function detectType(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (s.indexOf('@') !== -1) return 'email';
    return s.replace(/[^\d]/g, '').length >= 7 ? 'whatsapp' : 'email';
  }
  function isValid(v) {
    var s = String(v || '').trim();
    if (!s) return false;
    if (s.indexOf('@') !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
    return /^\+?\d[\d\s\-()]{5,18}$/.test(s);
  }
  function normalize(contact, type) {
    var s = String(contact || '').trim();
    if (type === 'email') return s.toLowerCase();
    var plus = s.charAt(0) === '+';
    return (plus ? '+' : '') + s.replace(/[^\d]/g, '');
  }

  /* ---------------- 样式 ---------------- */
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      '.gdw-overlay{position:fixed;inset:0;z-index:9990;background:rgba(24,20,16,.6);display:none;',
      'align-items:center;justify-content:center;padding:1.1rem;overflow:auto}',
      '.gdw-overlay.on{display:flex}',
      '.gdw-modal{position:relative;width:100%;max-width:520px;max-height:92vh;overflow:auto;',
      'background:linear-gradient(180deg,#FFFDF8 0%,#FBF6EC 100%);border:1px solid rgba(176,138,69,.35);',
      'box-shadow:0 26px 64px rgba(18,14,10,.3);border-radius:2px;padding:1.75rem 1.6rem 1.4rem;box-sizing:border-box;',
      'font-family:"Songti SC","Noto Serif SC","Helvetica Neue",Arial,sans-serif;color:#2A2621;text-align:left}',
      '.gdw-modal::after{content:"";position:absolute;inset:7px;border:1px solid rgba(176,138,69,.13);pointer-events:none}',
      '.gdw-x{position:absolute;top:.55rem;right:.7rem;border:0;background:none;font-size:1.35rem;line-height:1;',
      'color:#9A938A;cursor:pointer;padding:.2rem .35rem;font-family:inherit;z-index:2}',
      '.gdw-x:hover{color:#6F4A31}',
      '.gdw-kicker{font-size:.6rem;letter-spacing:.26em;text-transform:uppercase;color:#9A7635;font-weight:700;margin-bottom:.55rem}',
      '.gdw-title{font-family:"Playfair Display","Noto Serif SC","Songti SC","STSong",serif;font-weight:500;',
      'font-size:1.26rem;line-height:1.45;letter-spacing:.02em;margin:0 0 .55rem;padding-right:1.2rem}',
      '.gdw-desc{font-size:.79rem;line-height:1.8;color:#6E665C;margin:0 0 1.05rem}',
      '.gdw-ctx{font-size:.72rem;line-height:1.6;color:#8A7A5F;margin:0 0 1.05rem;padding:.5rem .7rem;',
      'background:rgba(176,138,69,.07);border-left:2px solid rgba(176,138,69,.45);display:none}',
      '.gdw-ctx.on{display:block}',
      '.gdw-gbtn{display:none;margin:0 0 .8rem}',
      '.gdw-gbtn.on{display:block}',
      '.gdw-or{display:flex;align-items:center;gap:.7rem;margin:.2rem 0 .9rem;color:#A99E8E;font-size:.66rem;letter-spacing:.12em}',
      '.gdw-or:before,.gdw-or:after{content:"";height:1px;background:rgba(176,138,69,.28);flex:1}',
      '.gdw-field{margin-bottom:.85rem}',
      '.gdw-label{display:block;font-size:.7rem;letter-spacing:.08em;color:#6B645B;font-weight:600;margin-bottom:.35rem}',
      '.gdw-req{color:#9A554B;margin-left:.18rem}',
      '.gdw-input{width:100%;height:44px;border:1px solid #DED5C6;background:#fff;border-radius:2px;padding:0 .85rem;',
      'font-size:.86rem;color:#2A2621;font-family:inherit;outline:none;transition:border-color .2s;box-sizing:border-box}',
      '.gdw-input:focus{border-color:#B08A45}',
      '.gdw-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.45rem}',
      '.gdw-chip{font-family:inherit;font-size:.78rem;font-weight:600;color:#6B645B;background:#fff;border:1px solid #E4DED5;',
      'border-radius:2px;padding:.6rem .5rem;cursor:pointer;transition:.2s;text-align:center;line-height:1.3}',
      '.gdw-chip:hover{border-color:#B08A45}',
      '.gdw-chip.on{background:#6F4A31;border-color:#6F4A31;color:#fff}',
      '.gdw-consent{display:flex;gap:.55rem;align-items:flex-start;font-size:.72rem;line-height:1.65;color:#6B645B;',
      'margin:.35rem 0 1rem;cursor:pointer}',
      '.gdw-consent input{margin-top:.2rem;accent-color:#6F4A31;width:15px;height:15px;flex:0 0 auto;cursor:pointer}',
      '.gdw-consent a{color:#6F4A31;text-decoration:underline;text-underline-offset:2px}',
      '.gdw-submit{width:100%;height:46px;border:1px solid #6F4A31;background:#6F4A31;color:#fff;border-radius:2px;',
      'font-family:inherit;font-size:.88rem;font-weight:600;letter-spacing:.05em;cursor:pointer;transition:.25s}',
      '.gdw-submit:hover{background:#472E20;border-color:#472E20}',
      '.gdw-submit[disabled]{opacity:.62;cursor:default}',
      '.gdw-note{font-size:.66rem;line-height:1.7;color:#9A938A;margin-top:.85rem}',
      '.gdw-err{display:none;font-size:.74rem;line-height:1.6;color:#9A554B;margin:-.35rem 0 .8rem}',
      '.gdw-ok{display:none;text-align:center;padding:1.4rem .2rem .6rem}',
      '.gdw-ok-mark{font-size:1.6rem;color:#526657;margin-bottom:.6rem}',
      '.gdw-ok p{font-size:.86rem;line-height:1.8;color:#526657;margin:0}',
      '@media(max-width:480px){.gdw-modal{padding:1.4rem 1.1rem 1.15rem;max-height:94vh}.gdw-title{font-size:1.12rem}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 提交 ---------------- */
  function post(payload, keepalive) {
    try {
      return fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!keepalive
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  function context() {
    return {
      item_id: String((document.body && document.body.dataset && document.body.dataset.itemId) || ''),
      item_title: txt('.item-detail-title.zh'),
      item_title_en: txt('.item-detail-title.en'),
      seller: txt('#sellerId'),
      seller_name: txt('#sellerNameZh') || txt('#sellerNameEn')
    };
  }

  function payloadFor(me, extra) {
    var ctx = context();
    var p = {
      contact: me.contact,
      contact_type: me.type,
      seller: ctx.seller,
      source: 'wa-gate',
      lang: isEn() ? 'en' : 'zh',
      page: location.pathname,
      item_id: ctx.item_id,
      item_title: ctx.item_title || ctx.item_title_en,
      name: me.name,
      intent: me.intent,
      consent: 'yes',
      follows: []
    };
    if (global.GudongFollow) p.follows = global.GudongFollow.all();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k];
    return p;
  }

  /* 同一买家 + 同一藏品 24 小时内只记一次 */
  function markPing(contact, itemId) {
    var key = contact + '|' + itemId;
    var map = {};
    try { map = JSON.parse(localStorage.getItem(PING_KEY) || '{}') || {}; } catch (e) { map = {}; }
    var now = Date.now();
    for (var k in map) if (map[k] && now - map[k] > PING_TTL) delete map[k];
    if (map[key] && now - map[key] < PING_TTL) return false;
    map[key] = now;
    try { localStorage.setItem(PING_KEY, JSON.stringify(map)); } catch (e) { /* 溢出忽略 */ }
    return true;
  }

  /* 已登记买家：静默记一次询价（不弹层、不改跳转） */
  function pingSilently(me) {
    if (!markPing(me.contact, context().item_id)) return;
    post(payloadFor(me), true);
  }

  /* ---------------- 打开 WhatsApp ---------------- */
  function openWa(href) {
    var url = href && href.indexOf('http') === 0 ? href : '';
    if (!url) return false;
    var win = window.open(url, '_blank', 'noopener');
    if (!win) { location.href = url; }
    return true;
  }

  function toast(msg) {
    var el = document.getElementById('gd-gate-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gd-gate-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:88vw;z-index:9999;' +
        'background:rgba(42,38,33,.94);color:#fff;font-size:.82rem;line-height:1.6;padding:.7rem 1.05rem;' +
        'border-radius:3px;text-align:center;opacity:0;transition:opacity .25s;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 3000);
  }

  /* ---------------- 弹层 ---------------- */
  var UI = null;
  var state = { intent: '', google: '', pendingHref: '' };

  function buildUi() {
    if (UI) return UI;
    injectCss();

    var ov = document.createElement('div');
    ov.className = 'gdw-overlay';
    ov.innerHTML =
      '<div class="gdw-modal" role="dialog" aria-modal="true" aria-labelledby="gdwTitle">' +
        '<button class="gdw-x" type="button" aria-label="Close">×</button>' +
        '<div class="gdw-kicker"><span class="zh">询价登记</span><span class="en">Enquiry record</span></div>' +
        '<h3 class="gdw-title" id="gdwTitle">' +
          '<span class="zh">先留个称呼，藏家才知道对面是谁</span>' +
          '<span class="en">Leave a name so the collector knows who is asking</span>' +
        '</h3>' +
        '<p class="gdw-desc">' +
          '<span class="zh">在 Gudong 上，每一条询价都会带上称呼、联系方式与真实意向。藏家收到的不是一个陌生号码，而是明确想买什么的买家——这也是我们把时间留给真心买家、挡掉骚扰的方式。</span>' +
          '<span class="en">Every enquiry on Gudong carries a name, a way to reach you and what you are actually looking for. The collector sees a real buyer, not a stranger’s number — that is how we keep time-wasters out.</span>' +
        '</p>' +
        '<div class="gdw-ctx" id="gdwCtx"></div>' +
        '<div class="gdw-gbtn" id="gdwGoogle"></div>' +
        '<div class="gdw-or" id="gdwOr"><span class="zh">或留下邮箱 / WhatsApp</span><span class="en">or leave your email / WhatsApp</span></div>' +
        '<form novalidate>' +
          '<div class="gdw-field">' +
            '<label class="gdw-label" for="gdwName"><span class="zh">您的称呼</span><span class="en">Your name</span><span class="gdw-req">*</span></label>' +
            '<input class="gdw-input" id="gdwName" type="text" maxlength="40" autocomplete="name" placeholder="陈先生 / Maggie">' +
          '</div>' +
          '<div class="gdw-field">' +
            '<label class="gdw-label" for="gdwContact"><span class="zh">邮箱或 WhatsApp 号码</span><span class="en">Email or WhatsApp number</span><span class="gdw-req">*</span></label>' +
            '<input class="gdw-input" id="gdwContact" type="text" maxlength="120" autocomplete="email" placeholder="you@email.com / +65 9123 4567">' +
          '</div>' +
          '<div class="gdw-field">' +
            '<label class="gdw-label"><span class="zh">您的意向</span><span class="en">Your interest</span><span class="gdw-req">*</span></label>' +
            '<div class="gdw-chips" role="group"></div>' +
          '</div>' +
          '<div class="gdw-err"></div>' +
          '<label class="gdw-consent">' +
            '<input type="checkbox" id="gdwConsent">' +
            '<span class="zh">我已阅读并同意<a href="/privacy.html" target="_blank" rel="noopener">《隐私政策》</a>，同意 Gudong 记录本次询价信息，并在本次联络范围内提供给该藏家。</span>' +
            '<span class="en">I have read the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and agree that Gudong may record this enquiry and share it with this collector for the purpose of this enquiry.</span>' +
          '</label>' +
          '<button class="gdw-submit" type="submit">' +
            '<span class="zh">确认并打开 WhatsApp →</span><span class="en">Confirm &amp; open WhatsApp →</span>' +
          '</button>' +
        '</form>' +
        '<p class="gdw-note">' +
          '<span class="zh">只记录：称呼、联系方式、意向、藏品与时间。不公开、不转卖，可随时联系 contact@gudong.app 删除。</span>' +
          '<span class="en">We record only: name, contact, interest, the item and the time. Never published or resold; email contact@gudong.app to have it removed.</span>' +
        '</p>' +
        '<div class="gdw-ok">' +
          '<div class="gdw-ok-mark">✓</div>' +
          '<p><span class="zh">已登记，正在为您打开 WhatsApp…</span><span class="en">Recorded — opening WhatsApp for you…</span></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var chips = ov.querySelector('.gdw-chips');
    INTENTS.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gdw-chip';
      b.setAttribute('data-intent', it.id);
      b.innerHTML = '<span class="zh">' + it.zh + '</span><span class="en">' + it.en + '</span>';
      b.addEventListener('click', function () {
        state.intent = it.id;
        var all = chips.querySelectorAll('.gdw-chip');
        for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === b);
        err('');
      });
      chips.appendChild(b);
    });

    var form = ov.querySelector('form');
    var nameEl = ov.querySelector('#gdwName');
    var contactEl = ov.querySelector('#gdwContact');
    var consentEl = ov.querySelector('#gdwConsent');
    var submitEl = ov.querySelector('.gdw-submit');
    var errEl = ov.querySelector('.gdw-err');
    var okEl = ov.querySelector('.gdw-ok');

    function err(msg) { errEl.textContent = msg || ''; errEl.style.display = msg ? 'block' : 'none'; }

    ov.querySelector('.gdw-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('on')) close();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nameEl.value.trim().slice(0, 40);
      var raw = contactEl.value.trim();
      if (!name) { err(isEn() ? 'Please leave a name.' : '请填写您的称呼。'); nameEl.focus(); return; }
      if (!isValid(raw)) { err(isEn() ? 'Please enter a valid email or WhatsApp number.' : '请填写有效的邮箱或 WhatsApp 号码。'); contactEl.focus(); return; }
      if (!state.intent) { err(isEn() ? 'Please pick your interest.' : '请选择您的意向。'); return; }
      if (!consentEl.checked) { err(isEn() ? 'Please accept the Privacy Policy to continue.' : '请先同意《隐私政策》再继续。'); return; }

      var type = detectType(raw);
      var contact = normalize(raw, type);
      var me = { contact: contact, type: type, name: name, intent: state.intent, ts: Date.now(), seller: txt('#sellerId'), source: 'wa-gate' };
      write(me);
      markPing(contact, context().item_id);

      submitEl.disabled = true;
      err('');
      /* 同步打开新标签，避免异步后弹窗被拦 */
      var opened = openWa(state.pendingHref);
      if (!opened) close();

      form.style.display = 'none';
      okEl.style.display = 'block';

      post(payloadFor(me, state.google ? { google_credential: state.google } : null));
      setTimeout(close, 1400);
    });

    function close() {
      ov.classList.remove('on');
      state.pendingHref = '';
      setTimeout(function () {
        var f = ov.querySelector('form');
        var ok = ov.querySelector('.gdw-ok');
        f.style.display = '';
        ok.style.display = 'none';
        ov.querySelector('.gdw-submit').disabled = false;
      }, 180);
    }

    UI = {
      ov: ov,
      open: function (href) {
        var me = read() || {};
        nameEl.value = me.name || '';
        contactEl.value = me.contact || '';
        consentEl.checked = false;
        state.intent = '';
        state.google = '';
        var all = chips.querySelectorAll('.gdw-chip');
        for (var i = 0; i < all.length; i++) all[i].classList.remove('on');
        err('');
        form.style.display = '';
        okEl.style.display = 'none';
        submitEl.disabled = false;
        state.pendingHref = href;
        var ctxEl = ov.querySelector('#gdwCtx');
        var c = context();
        var tZh = c.item_title || c.item_title_en;
        var tEn = c.item_title_en || c.item_title;
        if (tZh || c.seller_name) {
          ctxEl.innerHTML =
            '<span class="zh">' + (tZh ? '关于「' + esc(tZh) + '」' : '') + (c.seller_name ? (tZh ? ' · ' : '') + esc(c.seller_name) : '') + '</span>' +
            '<span class="en">' + (tEn ? 'About “' + esc(tEn) + '”' : '') + (c.seller_name ? (tEn ? ' · ' : '') + esc(c.seller_name) : '') + '</span>';
          ctxEl.classList.add('on');
        } else {
          ctxEl.classList.remove('on');
        }
        ov.classList.add('on');
        setTimeout(function () { (nameEl.value ? contactEl : nameEl).focus(); }, 80);
        mountGoogle();
      }
    };
    return UI;
  }

  /* ---------------- Google 登录（开关）---------------- */
  var gScript = null;
  function loadGis(cb) {
    if (global.google && global.google.accounts && global.google.accounts.id) return cb();
    if (gScript) { gScript.addEventListener('load', cb); return; }
    gScript = document.createElement('script');
    gScript.src = 'https://accounts.google.com/gsi/client';
    gScript.async = true;
    gScript.defer = true;
    gScript.onload = cb;
    document.head.appendChild(gScript);
  }

  function mountGoogle() {
    var cid = global.GUDONG_GOOGLE_CLIENT_ID;
    var box = UI && UI.ov.querySelector('#gdwGoogle');
    if (!box || !cid) return;
    loadGis(function () {
      try {
        global.google.accounts.id.initialize({
          client_id: cid,
          callback: function (resp) {
            if (!resp || !resp.credential) return;
            post({ action: 'verify_google', credential: resp.credential }).then(function (r) {
              if (!r || !r.ok) {
                toast(isEn() ? 'Google sign-in could not be verified.' : 'Google 登录未能验证，请改用邮箱。');
                return;
              }
              state.google = resp.credential;
              var contactEl = UI.ov.querySelector('#gdwContact');
              var nameEl = UI.ov.querySelector('#gdwName');
              if (r.email) contactEl.value = r.email;
              if (r.name && !nameEl.value.trim()) nameEl.value = r.name.slice(0, 40);
              toast(isEn() ? 'Signed in as ' + r.email : '已验证：' + r.email);
            });
          }
        });
        box.classList.add('on');
        global.google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', text: 'continue_with', width: 300 });
      } catch (e) { /* 配置不对就不显示按钮，邮箱仍然可用 */ }
    });
  }

  /* ---------------- 拦截点击 ---------------- */
  var BIND_SEL = 'a[data-wa-bind="seller"]';

  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest(BIND_SEL) : null;
    if (!a || a.hidden || a.getAttribute('aria-hidden') === 'true') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('http') !== 0) {
      e.preventDefault();
      toast(isEn() ? 'Collector contact is still loading — one moment.' : '藏家联系方式还在加载，请稍候一秒。');
      return;
    }
    var me = identity();
    if (me) { pingSilently(me); return; }  /* 已登记：直接放行，只静默记一条 */
    e.preventDefault();
    var ui = buildUi();
    ui.open(href);
  }

  document.addEventListener('click', onClick, true);

  global.GudongGate = {
    identity: identity,
    open: function (href) { buildUi().open(href || '#'); },
    reset: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(PING_KEY); } catch (e) {}
    }
  };
})(window);
