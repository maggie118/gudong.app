/*! wa-contact-gate.js — 询价身份确认（极简版 2026-11-10）
 * 目的：点藏家 WhatsApp 前，用「一次点击」留下买家身份，让每条询价都是"有名字的人"。
 *   1) 首选：点「用 Google 继续」→ 选中账号即完成，自动打开 wa.me
 *   2) 没有 Google：只填一个邮箱，点「继续」→ 自动打开 wa.me
 *   3) 本机记住 365 天：之后点任何藏家都不再弹层，只静默记一条询价
 *   4) Google 登录开关：页面设置 window.GUDONG_GOOGLE_CLIENT_ID 后自动出现 Google 按钮
 * 依赖：/api/buyer（D1 buyers 身份）、/api/lead（Airtable 买家名单 + 藏家提醒），均失败不影响跳转。
 */
(function (global) {
  'use strict';

  var KEY = 'gudong_buyer';
  var PING_KEY = 'gudong_wa_ping';
  var CSS_ID = 'gd-gate-css';
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;
  var PING_TTL = 24 * 60 * 60 * 1000;

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
  /* 有效身份：有联系方式即可；称呼/意向不再强制（极简） */
  function identity() {
    var me = read();
    if (!me || !me.contact) return null;
    if (!me.ts || Date.now() - me.ts > MAX_AGE) return null;
    if (!me.name) me.name = me.contact.indexOf('@') !== -1 ? me.contact.split('@')[0].slice(0, 40) : '';
    if (!me.intent) me.intent = 'ask';
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
  function l(zh, en) { return isEn() ? en : zh; }

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
      '.gdw-modal{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:auto;',
      'background:linear-gradient(180deg,#FFFDF8 0%,#FBF6EC 100%);border:1px solid rgba(176,138,69,.35);',
      'box-shadow:0 26px 64px rgba(18,14,10,.3);border-radius:2px;padding:1.55rem 1.45rem 1.25rem;box-sizing:border-box;',
      'font-family:"Songti SC","Noto Serif SC","Helvetica Neue",Arial,sans-serif;color:#2A2621;text-align:left}',
      '.gdw-modal::after{content:"";position:absolute;inset:7px;border:1px solid rgba(176,138,69,.13);pointer-events:none}',
      '.gdw-x{position:absolute;top:.55rem;right:.7rem;border:0;background:none;font-size:1.35rem;line-height:1;',
      'color:#9A938A;cursor:pointer;padding:.2rem .35rem;font-family:inherit;z-index:2}',
      '.gdw-x:hover{color:#6F4A31}',
      '.gdw-kicker{font-size:.6rem;letter-spacing:.26em;text-transform:uppercase;color:#9A7635;font-weight:700;margin-bottom:.5rem}',
      '.gdw-title{font-family:"Playfair Display","Noto Serif SC","Songti SC","STSong",serif;font-weight:500;',
      'font-size:1.2rem;line-height:1.45;letter-spacing:.02em;margin:0 0 .5rem;padding-right:1.2rem}',
      '.gdw-desc{font-size:.78rem;line-height:1.75;color:#6E665C;margin:0 0 .95rem}',
      '.gdw-ctx{font-size:.72rem;line-height:1.6;color:#8A7A5F;margin:0 0 .9rem;padding:.45rem .65rem;',
      'background:rgba(176,138,69,.07);border-left:2px solid rgba(176,138,69,.45);display:none}',
      '.gdw-ctx.on{display:block}',
      '.gdw-gbtn{display:none;margin:0 0 .7rem}',
      '.gdw-gbtn.on{display:flex;justify-content:center}',
      '.gdw-or{display:none;align-items:center;gap:.7rem;margin:.35rem 0 .75rem;color:#A99E8E;font-size:.66rem;letter-spacing:.12em}',
      '.gdw-or.on{display:flex}',
      '.gdw-or:before,.gdw-or:after{content:"";height:1px;background:rgba(176,138,69,.28);flex:1}',
      '.gdw-field{display:flex;gap:.45rem;margin-bottom:.55rem}',
      '.gdw-input{flex:1;height:46px;border:1px solid #DED5C6;background:#fff;border-radius:2px;padding:0 .85rem;',
      'font-size:.86rem;color:#2A2621;font-family:inherit;outline:none;transition:border-color .2s;box-sizing:border-box}',
      '.gdw-input:focus{border-color:#B08A45}',
      '.gdw-submit{height:46px;padding:0 1.05rem;border:1px solid #6F4A31;background:#6F4A31;color:#fff;border-radius:2px;',
      'font-family:inherit;font-size:.84rem;font-weight:600;letter-spacing:.04em;cursor:pointer;transition:.25s;white-space:nowrap}',
      '.gdw-submit:hover{background:#472E20;border-color:#472E20}',
      '.gdw-submit[disabled]{opacity:.62;cursor:default}',
      '.gdw-note{font-size:.66rem;line-height:1.65;color:#9A938A;margin:.7rem 0 0}',
      '.gdw-note a{color:#6F4A31;text-decoration:underline;text-underline-offset:2px}',
      '.gdw-err{display:none;font-size:.74rem;line-height:1.6;color:#9A554B;margin:0 0 .6rem}',
      '.gdw-ok{display:none;text-align:center;padding:1.2rem .2rem .5rem}',
      '.gdw-ok-mark{font-size:1.6rem;color:#526657;margin-bottom:.5rem}',
      '.gdw-ok p{font-size:.86rem;line-height:1.8;color:#526657;margin:0}',
      '@media(max-width:480px){.gdw-modal{padding:1.35rem 1.1rem 1.1rem;max-width:100%}.gdw-title{font-size:1.08rem}',
      '.gdw-field{flex-direction:column}.gdw-submit{width:100%}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 提交 ---------------- */
  function postJson(url, payload, keepalive) {
    try {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: !!keepalive
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }
  function post(payload, keepalive) { return postJson('/api/lead', payload, keepalive); }

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
      intent: me.intent || 'ask',
      consent: 'yes',
      follows: []
    };
    if (global.GudongFollow) p.follows = global.GudongFollow.all();
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) p[k] = extra[k];
    return p;
  }

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

  function pingSilently(me) {
    if (!markPing(me.contact, context().item_id)) return;
    post(payloadFor(me), true);
  }

  /* ---------------- WhatsApp ---------------- */
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
  var state = { pendingHref: '' };
  var els = {};

  /* 记住身份 + 打开 WhatsApp + 静默入库（邮箱路径与 Google 路径共用） */
  function finish(me, extra, href) {
    write(me);
    markPing(me.contact, context().item_id);
    if (els.submit) els.submit.disabled = true;
    if (els.err) { els.err.textContent = ''; els.err.style.display = 'none'; }
    openWa(href);
    if (els.form) els.form.style.display = 'none';
    if (els.ok) els.ok.style.display = 'block';
    post(payloadFor(me, extra || null));
    setTimeout(function () { if (UI) UI.close(); }, 1400);
  }

  function buildUi() {
    if (UI) return UI;
    injectCss();

    var ov = document.createElement('div');
    ov.className = 'gdw-overlay';
    ov.innerHTML =
      '<div class="gdw-modal" role="dialog" aria-modal="true" aria-labelledby="gdwTitle">' +
        '<button class="gdw-x" type="button" aria-label="Close">×</button>' +
        '<div class="gdw-kicker"><span class="zh">一步联系藏家</span><span class="en">Contact the collector</span></div>' +
        '<h3 class="gdw-title" id="gdwTitle">' +
          '<span class="zh">留个邮箱，直接打开藏家的 WhatsApp</span>' +
          '<span class="en">Leave your email, then WhatsApp opens straight away</span>' +
        '</h3>' +
        '<p class="gdw-desc">' +
          '<span class="zh">藏家会看到是谁在询价，你这次也不用再重复填写。以后回来看藏品，点 WhatsApp 直接就能联系。</span>' +
          '<span class="en">The collector sees who is asking, and you never fill this in twice. Next time, WhatsApp just opens.</span>' +
        '</p>' +
        '<div class="gdw-ctx" id="gdwCtx"></div>' +
        '<div class="gdw-gbtn" id="gdwGoogle"></div>' +
        '<div class="gdw-or" id="gdwOr"><span class="zh">或只填邮箱</span><span class="en">or just your email</span></div>' +
        '<form novalidate>' +
          '<div class="gdw-field">' +
            '<input class="gdw-input" id="gdwContact" type="text" maxlength="120" autocomplete="email" ' +
              'placeholder="' + (isEn() ? 'you@email.com' : 'you@email.com（或 WhatsApp 号码）') + '">' +
            '<button class="gdw-submit" type="submit">' +
              '<span class="zh">继续 →</span><span class="en">Continue →</span>' +
            '</button>' +
          '</div>' +
          '<div class="gdw-err"></div>' +
        '</form>' +
        '<p class="gdw-note">' +
          '<span class="zh">继续即表示同意<a href="/privacy.html" target="_blank" rel="noopener">《隐私政策》</a>：只记录邮箱、询价的藏品与时间，不公开、不转卖，可随时写信给 contact@gudong.app 删除。</span>' +
          '<span class="en">By continuing you agree to the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>: we store only your email, the item and the time. Never published or resold; email contact@gudong.app to remove it.</span>' +
        '</p>' +
        '<div class="gdw-ok">' +
          '<div class="gdw-ok-mark">✓</div>' +
          '<p><span class="zh">已记住你，正在打开 WhatsApp…</span><span class="en">Got it — opening WhatsApp…</span></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var form = ov.querySelector('form');
    var contactEl = ov.querySelector('#gdwContact');
    var submitEl = ov.querySelector('.gdw-submit');
    var errEl = ov.querySelector('.gdw-err');
    var okEl = ov.querySelector('.gdw-ok');
    els = { form: form, contact: contactEl, submit: submitEl, err: errEl, ok: okEl };

    function err(msg) { errEl.textContent = msg || ''; errEl.style.display = msg ? 'block' : 'none'; }

    ov.querySelector('.gdw-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ov.classList.contains('on')) close();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = contactEl.value.trim();
      if (!isValid(raw)) {
        err(l('请填一个有效的邮箱（或 WhatsApp 号码）。', 'Please enter a valid email (or WhatsApp number).'));
        contactEl.focus();
        return;
      }
      var type = detectType(raw);
      var contact = normalize(raw, type);
      var me = {
        contact: contact,
        type: type,
        name: contact.indexOf('@') !== -1 ? contact.split('@')[0].slice(0, 40) : '',
        intent: 'ask',
        ts: Date.now(),
        source: 'wa-gate'
      };
      /* 身份先落 D1（不阻塞跳转），同时照旧写 Airtable 买家名单 */
      postJson('/api/buyer', { email: type === 'email' ? contact : '', contact: contact, item_id: context().item_id });
      finish(me, null, state.pendingHref);
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
      close: close,
      open: function (href) {
        var me = read() || {};
        contactEl.value = me.contact || '';
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
        setTimeout(function () { contactEl.focus(); }, 80);
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
    var orEl = UI && UI.ov.querySelector('#gdwOr');
    if (!box || !cid) return;
    loadGis(function () {
      try {
        global.google.accounts.id.initialize({
          client_id: cid,
          callback: function (resp) {
            if (!resp || !resp.credential) return;
            postJson('/api/buyer', {
              credential: resp.credential,
              item_id: context().item_id
            }).then(function (r) {
              if (!r || !r.ok || !r.email) {
                toast(l('Google 登录未能验证，请改用邮箱即可。', 'Google sign-in could not be verified — just use your email.'));
                return;
              }
              var href = state.pendingHref;
              finish({
                contact: r.email,
                type: 'email',
                name: (r.name || r.email.split('@')[0]).slice(0, 40),
                intent: 'ask',
                ts: Date.now(),
                source: 'google',
                buyer_id: r.buyer_id || ''
              }, { google: true }, href);
            });
          }
        });
        box.classList.add('on');
        if (orEl) orEl.classList.add('on');
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
      toast(l('藏家联系方式还在加载，请稍候一秒。', 'Collector contact is still loading — one moment.'));
      return;
    }
    var me = identity();
    if (me) { pingSilently(me); return; }
    e.preventDefault();
    buildUi().open(href);
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
