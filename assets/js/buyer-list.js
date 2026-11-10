/*! buyer-list.js — 古董圈买家名单（2026-11-07）
 * 目标：把"逛逛就走"的买家变成可再次触达的名单资产。
 *   1) 留 WhatsApp 或邮箱（本地存一份，同时 POST /api/lead 进 Airtable「buyer_leads」）
 *   2) 关注藏家 / 品类（复用 gudong-follow.js 的 localStorage 关注体系）
 *   3) 新上架推送（可选叠加 Web Push，复用 push-subscribe.js）
 *
 * 用法：
 *   <script src="/assets/js/gudong-follow.js"></script>
 *   <script src="/assets/js/buyer-list.js"></script>
 *   GudongBuyer.mount(el, { seller: 'Lim-KW', sellerNameZh: '林记古玩', source: 'seller-page' });
 *   seller 也可以传函数：seller: function () { return ... }
 */
(function (global) {
  'use strict';

  var KEY = 'gudong_buyer';
  var CSS_ID = 'gd-buyer-css';

  /* ---------------- 本地状态 ---------------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var o = raw ? JSON.parse(raw) : null;
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  function status() { return read(); }

  /* ---------------- 校验 ---------------- */
  function detectType(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (s.indexOf('@') !== -1) return 'email';
    var digits = s.replace(/[^\d]/g, '');
    if (digits.length >= 7) return 'whatsapp';
    return 'email';
  }
  function isValid(v) {
    var s = String(v || '').trim();
    if (!s) return false;
    if (s.indexOf('@') !== -1) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
    return /^(\+?\d[\d\s\-()]{5,18})$/.test(s);
  }
  function normalize(contact, type) {
    var s = String(contact || '').trim();
    if (type === 'email') return s.toLowerCase();
    // WhatsApp：去掉空格/连字符/括号，保留前导 +
    var plus = s.charAt(0) === '+';
    var digits = s.replace(/[^\d]/g, '');
    return (plus ? '+' : '') + digits;
  }

  /* ---------------- 样式 ---------------- */
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent = [
      '.gbx{border:1px solid rgba(176,138,69,.28);background:linear-gradient(180deg,#FFFDF8 0%,#FBF6EC 100%);',
      'padding:1.35rem 1.35rem 1.2rem;border-radius:2px;position:relative;text-align:left}',
      '.gbx::after{content:"";position:absolute;inset:6px;border:1px solid rgba(176,138,69,.12);pointer-events:none}',
      '.gbx-kicker{font-size:.6rem;letter-spacing:.24em;text-transform:uppercase;color:#9A7635;font-weight:700}',
      '.gbx-title{font-family:"Playfair Display","Noto Serif SC","Songti SC","STSong",serif;font-weight:500;',
      'font-size:1.12rem;letter-spacing:.04em;color:#2A2621;margin:.4rem 0 .35rem;line-height:1.5}',
      '.gbx-desc{font-size:.78rem;line-height:1.75;color:#6E665C;margin-bottom:.85rem}',
      '.gbx-form{display:flex;gap:.5rem;flex-wrap:wrap}',
      '.gbx-input{flex:1 1 200px;min-width:0;height:44px;border:1px solid #DED5C6;background:#fff;border-radius:2px;',
      'padding:0 .85rem;font-size:.86rem;color:#2A2621;font-family:inherit;outline:none;transition:border-color .25s}',
      '.gbx-input:focus{border-color:#B08A45}',
      '.gbx-btn{flex:0 0 auto;height:44px;padding:0 1.15rem;border:1px solid #6F4A31;background:#6F4A31;color:#fff;border-radius:2px;',
      'font-size:.84rem;font-weight:600;letter-spacing:.05em;cursor:pointer;font-family:inherit;transition:.25s;white-space:nowrap}',
      '.gbx-btn:hover{background:#472E20;border-color:#472E20}',
      '.gbx-btn[disabled]{opacity:.6;cursor:default}',
      '.gbx-chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.7rem 0 .1rem}',
      '.gbx-chip{font-size:.74rem;font-weight:600;color:#6B645B;background:#fff;border:1px solid #E4DED5;',
      'border-radius:20px;padding:.32rem .72rem;cursor:pointer;font-family:inherit;transition:.25s}',
      '.gbx-chip.on{background:#6F4A31;border-color:#6F4A31;color:#fff}',
      '.gbx-chip:hover{border-color:#B08A45}',
      '.gbx-note{font-size:.68rem;line-height:1.7;color:#9A938A;margin-top:.75rem}',
      '.gbx-note a{color:#6F4A31;text-decoration:underline;text-underline-offset:3px}',
      '.gbx-ok{display:none;font-size:.82rem;line-height:1.8;color:#526657}',
      '.gbx-ok b{color:#2A2621}',
      '.gbx-ok button{background:none;border:none;color:#9A938A;text-decoration:underline;font-size:.74rem;cursor:pointer;padding:0;margin-left:.35rem;font-family:inherit}',
      '.gbx-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
      '.gbx-push{display:flex;align-items:center;gap:.45rem;margin-top:.7rem;font-size:.74rem;color:#6B645B;cursor:pointer}',
      '.gbx-push input{accent-color:#6F4A31;width:15px;height:15px;cursor:pointer}',
      '@media(max-width:600px){.gbx{padding:1.15rem 1rem}.gbx-form{display:block}.gbx-input{width:100%;margin-bottom:.55rem}.gbx-btn{flex:1 1 100%;width:100%}}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pick(obj, name) {
    if (typeof obj === 'function') { try { return obj(); } catch (e) { return ''; } }
    return obj == null ? '' : obj;
  }
  function isEn() { return (document.body.dataset && document.body.dataset.lang) === 'en'; }

  var CATS = [
    { term: '瓷器', zh: '瓷器', en: 'Porcelain' },
    { term: '玉器', zh: '玉器', en: 'Jade' },
    { term: '铜器', zh: '铜器', en: 'Bronzes' },
    { term: '钱币', zh: '钱币', en: 'Coins' },
    { term: '书画', zh: '书画', en: 'Paintings' },
    { term: '杂项', zh: '杂项', en: 'Misc.' }
  ];

  /* ---------------- 提交 ---------------- */
  function post(payload) {
    return fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  function mount(el, opts) {
    if (!el) return;
    opts = opts || {};
    injectCss();

    var sellerNameZh = pick(opts.sellerNameZh, '');
    var sellerNameEn = pick(opts.sellerNameEn, '');
    var srcSeller = pick(opts.seller, '');
    var followSeller = typeof opts.seller === 'function' ? opts.seller : function () { return srcSeller; };

    var titleEn = sellerNameEn || 'this collector';
    var titleZh = sellerNameZh || '这位藏家';
    var generic = !sellerNameZh;
    var minimal = !!opts.minimal;
    var headZh = generic
      ? '请留下联系方式，新上架会先通知您'
      : '关注「' + titleZh + '」，新上架先通知您';
    var headEn = generic
      ? 'Leave your contact and hear about new listings first'
      : 'Follow ' + titleEn + ' — hear about new listings first';
    /* minimal：嵌在已讲完承诺的区块里，卡片只留操作指引，避免与左侧文案重复 */
    var descZh = minimal
      ? '填好后即加入提醒名单，可随时改选品类或一键退订。'
      : 'WhatsApp 或邮箱即可。只在关注的门类上新时通知您——不发广告，随时退订。';
    var descEn = minimal
      ? 'You will be added to the alert list — change categories or unsubscribe anytime.'
      : 'A WhatsApp number or email is enough. We write only when a category you follow gains a new piece — no ads, unsubscribe anytime.';

    el.innerHTML =
      '<div class="gbx">' +
        (minimal ? '' :
          '<div class="gbx-kicker">New-listing alerts · 上新提醒</div>' +
          '<div class="gbx-title">' +
            '<span class="zh">' + esc(headZh) + '</span>' +
            '<span class="en">' + esc(headEn) + '</span>' +
          '</div>') +
        '<div class="gbx-desc"' + (minimal ? ' style="margin-top:0;"' : '') + '>' +
          '<span class="zh">' + descZh + '</span>' +
          '<span class="en">' + descEn + '</span>' +
        '</div>' +
        '<form class="gbx-form" novalidate>' +
          '<input class="gbx-input" type="text" name="contact" autocomplete="email" ' +
            'placeholder="WhatsApp 号码 或 邮箱 / number or email" aria-label="WhatsApp number or email">' +
          '<button class="gbx-btn" type="submit">' +
            '<span class="zh">加入名单</span><span class="en">Join the list</span>' +
          '</button>' +
          '<input class="gbx-hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '</form>' +
        '<div class="gbx-chips" role="group" aria-label="Categories">' +
          '<span class="gbx-desc" style="margin:0 .35rem 0 0;align-self:center;">' +
            '<span class="zh">也可关注品类：</span><span class="en">Or follow:</span></span>' +
        '</div>' +
        '<label class="gbx-push">' +
          '<input type="checkbox" name="push" checked>' +
          '<span class="zh">同时开启浏览器通知（更快）</span><span class="en">Also enable browser notifications</span>' +
        '</label>' +
        '<div class="gbx-ok" role="status"></div>' +
        '<div class="gbx-note">' +
          (minimal
            ? '<span class="zh">详见<a href="/privacy.html">隐私政策</a>。</span>' +
              '<span class="en">See our <a href="/privacy.html">Privacy Policy</a>.</span>'
            : '<span class="zh">仅用于上新提醒，不公开、不转卖。详见<a href="/privacy.html">隐私政策</a>。</span>' +
              '<span class="en">Used only for new-listing alerts. Never published or resold. See our <a href="/privacy.html">Privacy Policy</a>.</span>') +
        '</div>' +
      '</div>';

    /* 品类 chip：复用关注体系，点了本地立刻生效（不必填联系方式） */
    var chipsWrap = el.querySelector('.gbx-chips');
    CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gbx-chip';
      b.setAttribute('data-term', c.term);
      b.innerHTML = '<span class="zh">' + c.zh + '</span><span class="en">' + c.en + '</span>';
      if (global.GudongFollow) {
        b.addEventListener('click', function () {
          var on = global.GudongFollow.toggle('tag', c.term);
          b.classList.toggle('on', on);
          if (global.GudongEnsureAccount) global.GudongEnsureAccount(function (acc) { acc.follow('tag', c.term, c.zh, on); });
          else if (global.GudongAccount) global.GudongAccount.follow('tag', c.term, c.zh, on);
          if (on) toast(isEn() ? 'Following ' + c.en : '已关注「' + c.zh + '」');
        });
        if (global.GudongFollow.isFollowing('tag', c.term)) b.classList.add('on');
      }
      chipsWrap.appendChild(b);
    });

    var form = el.querySelector('.gbx-form');
    var input = form.querySelector('input[name="contact"]');
    var ok = el.querySelector('.gbx-ok');
    var btn = form.querySelector('.gbx-btn');

    // 已登记过：预填并标注
    var saved = read();
    if (saved && saved.contact) {
      input.value = saved.contact;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var hp = form.querySelector('input[name="hp"]').value;
      var raw = input.value;
      if (hp) return; // 机器人
      if (!isValid(raw)) {
        toast(isEn() ? 'Please enter a valid WhatsApp number or email.' : '请填写有效的 WhatsApp 号码或邮箱。');
        input.focus();
        return;
      }
      var type = detectType(raw);
      var contact = normalize(raw, type);

      // 1) 本地关注（卖家 + 已选品类）——只在未关注时切换，避免反复点掉
      var seller = followSeller();
      if (seller && global.GudongFollow && !global.GudongFollow.isFollowing('seller', seller)) {
        global.GudongFollow.toggle('seller', seller);
      }
      var follows = global.GudongFollow ? global.GudongFollow.all() : [];

      // 2) 联系方式本地留档（跨页可用）
      write({ contact: contact, type: type, ts: Date.now(), seller: seller || '', source: opts.source || '' });

      btn.disabled = true;
      // 3) 后端名单
      var payload = {
        contact: contact,
        contact_type: type,
        seller: seller || '',
        source: opts.source || 'site',
        follows: follows,
        lang: isEn() ? 'en' : 'zh',
        page: location.pathname
      };
      post(payload).then(function (res) {
        var stored = res && res.ok;

        // 4) 可选：Web Push（浏览器通知，按这家藏家细分）
        var wantPush = el.querySelector('input[name="push"]').checked;
        if (wantPush && global.GudongPush && global.GudongPush.available()) {
          global.GudongPush.subscribe({ seller: seller || '', contact: contact, type: type });
        }

        ok.style.display = 'block';
        form.style.display = 'none';
        var whoZh = sellerNameZh ? '「' + sellerNameZh + '」' : '这些藏家';
        var whoEn = sellerNameEn || 'these collectors';
        ok.innerHTML = '<span class="zh">✓ 已加入买家名单，并关注了' + esc(whoZh) + '。新上架我们会第一时间通知您。' +
          (stored ? '' : '（名单同步稍后完成，本机提醒已生效）') + '</span>' +
          '<span class="en">✓ You are on the buyer list and now follow ' + esc(whoEn) + '. We will alert you when new pieces arrive.' +
          (stored ? '' : ' (List sync pending; this device already tracks it.)') + '</span>' +
          '<button type="button" class="gbx-undo">' +
            '<span class="zh">退订</span><span class="en">Unsubscribe</span></button>';

        ok.querySelector('.gbx-undo').addEventListener('click', function () {
          var s = read() || {};
          if (global.GudongFollow && seller && global.GudongFollow.isFollowing('seller', seller)) {
            global.GudongFollow.toggle('seller', seller);
          }
          try { localStorage.removeItem(KEY); } catch (e) {}
          fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe', contact: (s.contact || contact), seller: seller || '' })
          }).catch(function () {});
          ok.style.display = 'none';
          form.style.display = 'flex';
          btn.disabled = false;
          toast(isEn() ? 'Unsubscribed.' : '已退订。');
        });
        toast(isEn() ? 'Added — new listings will reach you first.' : '已加入名单，新上架第一时间通知您。');
      }).catch(function () {
        btn.disabled = false;
      });
    });
  }

  /* ---------------- toast ---------------- */
  var tEl = null, tTimer = null;
  function toast(msg) {
    if (!tEl) {
      tEl = document.createElement('div');
      tEl.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(10px);' +
        'background:rgba(42,38,33,.94);color:#fff;font-size:.84rem;line-height:1.6;padding:.7rem 1.1rem;border-radius:3px;' +
        'max-width:88vw;z-index:9999;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;text-align:center;';
      document.body.appendChild(tEl);
    }
    tEl.textContent = msg;
    requestAnimationFrame(function () {
      tEl.style.opacity = '1';
      tEl.style.transform = 'translateX(-50%) translateY(0)';
    });
    clearTimeout(tTimer);
    tTimer = setTimeout(function () {
      tEl.style.opacity = '0';
      tEl.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2600);
  }

  global.GudongBuyer = { mount: mount, read: read, status: status, isValid: isValid, toast: toast };
})(window);
