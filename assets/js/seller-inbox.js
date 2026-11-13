(function () {
  'use strict';
  var token = new URLSearchParams((location.hash || '').replace(/^#/, '')).get('token') || '';

  /* 收到私密链接即把令牌按 seller_id 缓存到本机，藏馆页据此显示数据看板。
     令牌只在自己设备上，公开展馆页对无令牌访客不渲染任何数字。 */
  (function rememberToken(tk) {
    if (!tk || tk.indexOf('.') < 0) return;
    try {
      var part = tk.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      var payload = JSON.parse(atob(part));
      if (!payload || !payload.seller_id) return;
      var map = JSON.parse(localStorage.getItem('gudong.sellerTokens') || '{}') || {};
      map[String(payload.seller_id)] = tk;
      localStorage.setItem('gudong.sellerTokens', JSON.stringify(map));
    } catch (e) { /* 令牌格式异常时静默跳过，不影响后台本身 */ }
  })(token);

  var enqEl = document.getElementById('enquiry-list');
  var interestEl = document.getElementById('interest-line');
  var interestData = null;
  var lastEnquiries = [];
  var lang = localStorage.getItem('gudong.sellerInbox.lang') || 'zh';
  document.body.dataset.lang = lang;
  document.getElementById('lang-toggle').textContent = lang === 'zh' ? 'EN' : '中文';

  function t(zh, en) { return lang === 'en' ? en : zh; }
  function authHeaders(json) { var headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' }; if (json) headers['Content-Type'] = 'application/json'; return headers; }
  function api(path, options) {
    return fetch(path, Object.assign({ cache: 'no-store', headers: authHeaders(false) }, options || {})).then(function (r) {
      return r.json().then(function (data) { if (!r.ok) throw new Error(data.error || 'Request failed'); return data; });
    });
  }
  function formatTime(value) {
    if (!value) return '';
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-SG' : 'zh-SG', { dateStyle: 'short', timeStyle: 'short' });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---- 询价（买家在藏品页确认身份后留下的记录，含联系方式）---- */
  function contactHref(enq) {
    var c = enq.contact || '';
    if (!c) return '';
    if (enq.contact_type === 'email' || c.indexOf('@') > 0) return 'mailto:' + c;
    var digits = c.replace(/[^\d]/g, '');
    return digits ? 'https://wa.me/' + digits : '';
  }
  function drawEnquiries(items) {
    if (!enqEl) return;
    enqEl.textContent = '';
    if (!items.length) {
      enqEl.appendChild(el('div', 'enq-empty', t('还没有买家询价。买家在藏品页点 WhatsApp 并确认身份后，会出现在这里。', 'No enquiries yet. They appear here once a buyer confirms identity before contacting you on WhatsApp.')));
      return;
    }
    items.forEach(function (enq) {
      var card = el('div', 'enq-card');
      var top = el('div', 'enq-top');
      top.appendChild(el('span', 'enq-name', enq.name || t('未留称呼', 'No name')));
      if (enq.intent) top.appendChild(el('span', 'enq-intent', enq.intent));
      card.appendChild(top);
      card.appendChild(el('div', 'enq-item', '「' + (enq.item_title || enq.item_id || t('藏品', 'Item')) + '」'));
      var foot = el('div', 'enq-foot');
      var href = contactHref(enq);
      if (href) {
        var a = el('a', '', enq.contact);
        a.href = href;
        if (href.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        foot.appendChild(a);
      }
      foot.appendChild(el('time', '', formatTime(enq.created_at)));
      card.appendChild(foot);
      enqEl.appendChild(card);
    });
  }

  /* ---- 收藏 / 关注汇总（只给数字，不给身份）---- */
  function drawInterest(data) {
    if (!interestEl) return;
    if (!data || data.gallery === false) { interestEl.hidden = true; interestEl.textContent = ''; return; }
    var saves = Number.isFinite(data.saves_30d) ? data.saves_30d : 0;
    if (!saves) { interestEl.hidden = true; interestEl.textContent = ''; return; }
    interestEl.hidden = false;
    interestEl.textContent = t(
      '近 30 天 · ' + saves + ' 人收藏 / 关注',
      'Last 30 days · ' + saves + (saves === 1 ? ' save / follow' : ' saves / follows')
    );
  }
  function loadInterest() {
    if (!token || !interestEl) return Promise.resolve();
    return api('/api/interest').then(function (data) {
      interestData = data;
      drawInterest(data);
    }).catch(function () { interestEl.hidden = true; });
  }

  function loadEnquiries() {
    if (!token || !enqEl) return Promise.resolve();
    return api('/api/enquiries').then(function (data) {
      lastEnquiries = data.enquiries || [];
      drawEnquiries(lastEnquiries);
    }).catch(function () {
      if (!enqEl.querySelector('.enq-card')) {
        enqEl.textContent = '';
        enqEl.appendChild(el('div', 'enq-empty', t('暂时无法载入询价。', 'Could not load enquiries.')));
      }
    });
  }

  document.getElementById('lang-toggle').addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh';
    document.body.dataset.lang = lang;
    localStorage.setItem('gudong.sellerInbox.lang', lang);
    this.textContent = lang === 'zh' ? 'EN' : '中文';
    drawEnquiries(lastEnquiries);
    if (interestData) drawInterest(interestData);
  });

  if (!token) {
    var eb = document.getElementById('enquiry-block');
    if (eb) {
      eb.hidden = false;
      if (enqEl) {
        enqEl.textContent = '';
        enqEl.appendChild(el('div', 'enq-empty', t('链接无效或已过期，请联系平台重新获取藏家专属链接。', 'This link is invalid or expired. Ask the platform for a new private link.')));
      }
    }
    return;
  }

  loadEnquiries();
  loadInterest();

  // 不自动轮询：打开页面取一次；之后切回窗口时最多每分钟刷新一次。
  var lastRefresh = Date.now();
  function refreshAll() {
    if (document.hidden) return;
    var now = Date.now();
    if (now - lastRefresh < 60000) return;
    lastRefresh = now;
    loadEnquiries();
    loadInterest();
  }
  window.addEventListener('focus', refreshAll);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshAll(); });
})();
