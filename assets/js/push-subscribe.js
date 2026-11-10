/* 古董圈 Gudong · Web Push 订阅脚本
 * 2026-11-02 新增；按钮位置演进：
 *  - 初版：右下角大按钮 → 左下角（避免遮挡聊天）→ 已订阅收起小圆点
 *  - 2026-11-03：改为顶部右上角导航（与 EN / 分享按钮同排同款），点击订阅/退订
 * - 新藏品上架时由服务端推送通知，点击直达新藏品页；
 * - VAPID public key 为公开值（私钥只存在服务端环境变量）。
 */
(function () {
  'use strict';

  // 仅支持 PWA + Push API 的环境
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  /* 2026-11-11：改用发号器（Cloudflare Worker）这一对的公钥；
     私钥只存在 Worker 机密里，浏览器不需要。换钥匙时必须两边一起换。 */
  var VAPID_PUBLIC =
    'BGyPJ4U2OGXyvPxHN0X5DYjQMWmfjqEJTEyloSLv4SBT7H9z3uAlWLt3F0xO4X4mN_vb4r9NTipUy-7ddrtso_A';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function b64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  }

  var bell, menu;
  var subscribed = false;
  function isEn() {
    return (document.body.dataset && document.body.dataset.lang === 'en');
  }

  // 铃铛：未订阅为描边，已订阅为实心
  function svgBell(filled) {
    var fill = filled ? 'currentColor' : 'none';
    var stroke = filled ? 'none' : 'currentColor';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="' +
      fill + '" stroke="' + stroke + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  }

  function createUI() {
    // 挂载到顶部右侧导航（与 EN / 分享按钮同排）
    var hr = document.querySelector('.header-right');
    if (!hr) return;

    bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'gd-share-btn gd-push-bell';
    bell.setAttribute('aria-label', '上新通知 / New-item notifications');
    bell.style.cssText = 'position:relative;';
    bell.addEventListener('click', onBellClick);
    // 置于分享与 EN 之间
    var lang = hr.querySelector('.lang-btn');
    if (lang) hr.insertBefore(bell, lang);
    else hr.appendChild(bell);

    // 已订阅展开的退订菜单
    menu = document.createElement('div');
    menu.style.cssText =
      'position:absolute;top:calc(100% + 10px);right:0;z-index:9999;display:none;background:#fff;' +
      'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);padding:8px 6px;min-width:150px;font-size:13px;color:#333;' +
      'font-family:inherit;';
    var title = document.createElement('div');
    title.textContent = '已订阅上新通知';
    title.style.cssText = 'padding:4px 10px 9px;font-weight:600;';
    var unsub = document.createElement('button');
    unsub.type = 'button';
    unsub.textContent = '退订上新通知';
    unsub.style.cssText =
      'display:block;width:100%;padding:8px 10px;border:none;border-radius:8px;cursor:pointer;' +
      'background:#f3efe9;color:#7a4a2b;font-size:13px;font-weight:600;text-align:center;font-family:inherit;';
    unsub.addEventListener('click', onUnsub);
    menu.appendChild(title);
    menu.appendChild(unsub);
    bell.appendChild(menu);

    // 点击页面其他处关闭菜单
    document.addEventListener('click', function (e) {
      if (!bell.contains(e.target)) showMenu(false);
    });
  }

  function showMenu(open) {
    if (menu) menu.style.display = open ? 'block' : 'none';
  }

  function setIdle() {
    subscribed = false;
    bell.innerHTML = svgBell(false);
    bell.style.color = '';
    bell.title = '上新通知 / New-item notifications';
    showMenu(false);
  }

  function setActive() {
    subscribed = true;
    bell.innerHTML = svgBell(true);
    bell.style.color = '#B8860B';
    bell.title = '已订阅上新通知（点击可退订）';
  }

  function getSubscription() {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    }).catch(function () { return null; });
  }

  function registerSW() {
    return navigator.serviceWorker.register('/sw.js').catch(function () { return null; });
  }

  function postSubscription(sub, opts) {
    opts = opts || {};
    var payload = {
      endpoint: sub.endpoint,
      auth: b64(sub.getKey('auth')),
      p256dh: b64(sub.getKey('p256dh')),
    };
    // 关注维度：让"关注此藏家"与"上新提醒"绑到同一条订阅上
    if (opts.seller) payload.seller = String(opts.seller).slice(0, 60);
    if (opts.contact) payload.contact = String(opts.contact).slice(0, 120);
    if (opts.type) payload.contact_type = opts.type === 'email' ? 'email' : 'whatsapp';
    if (opts.source) payload.source = String(opts.source).slice(0, 40);
    // 有钱包身份的，把订阅挂到 buyer_key 上，后面按 follows 精准推送
    try {
      var me = JSON.parse(localStorage.getItem('gudong_buyer') || 'null');
      if (me && me.buyer_id) payload.buyer_key = String(me.buyer_id).toLowerCase().slice(0, 120);
      else if (me && me.verified && me.contact) payload.buyer_key = String(me.contact).toLowerCase().slice(0, 120);
    } catch (e) { /* 没身份也能订阅，只是推送按品类挑不到你 */ }
    return fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok) throw new Error('save failed ' + r.status);
      return r;
    });
  }

  // 订阅（可被"关注此藏家"组件复用）
  function subscribe(opts) {
    opts = opts || {};
    if (!('Notification' in window)) return Promise.reject(new Error('no-notification'));
    if (Notification.permission === 'denied') {
      if (opts.silent !== true) {
        alert('通知权限已被浏览器拒绝，请在浏览器设置中开启后再订阅。');
      }
      return Promise.reject(new Error('denied'));
    }
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('denied');
      return registerSW().then(function () {
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        return getSubscription().then(function (existing) {
          if (existing) return existing;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
          });
        });
      }).then(function (sub) {
        return postSubscription(sub, opts);
      }).then(function () {
        if (bell) setActive();
        return true;
      });
    });
  }

  // 点击铃铛：未订阅→订阅；已订阅→开/关退订菜单
  function onBellClick(e) {
    e.stopPropagation();
    if (subscribed) { showMenu(menu.style.display === 'none'); return; }
    if (!bell) return;
    var done = false;
    /* 2026-11-11：不再静默吞错。推送订阅经常在“浏览器连不上推送服务”时无限挂起，
       所以 15 秒兜底并说明原因，让用户知道是浏览器限制而不是网站坏了。 */
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      setFailed(isEn() ? 'No reply from the browser push service — try Chrome, or add to Home Screen on iPhone.'
                       : '浏览器推送服务没有响应 —— 换 Chrome 试试；iPhone 要先“添加到主屏幕”。');
    }, 15000);
    subscribe({}).then(function () {
      if (done) return; done = true; clearTimeout(timer);
    }).catch(function (err) {
      if (done) return; done = true; clearTimeout(timer);
      var msg = err && err.message;
      if (msg === 'denied') {
        setFailed(isEn() ? 'Notifications were blocked — allow them in the browser settings.' : '通知权限被拦了 —— 到浏览器设置里允许通知。');
      } else {
        setFailed((isEn() ? 'Push subscription failed: ' : '推送订阅没成功：') + (msg || 'unknown'));
      }
    });
  }

  function setFailed(text) {
    if (!bell) return;
    bell.setAttribute('title', text);
    bell.dataset.pushState = 'failed';
    var tip = document.getElementById('gdPushTip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'gdPushTip';
      tip.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:86vw;' +
        'background:rgba(42,38,33,.94);color:#fff;font-size:.8rem;line-height:1.6;padding:.6rem .9rem;' +
        'border-radius:3px;z-index:9999;text-align:center';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.display = '';
    setTimeout(function () { if (tip) tip.style.display = 'none'; }, 6000);
  }

  // 退订：浏览器解除 + 后端标记 inactive
  function onUnsub() {
    getSubscription().then(function (sub) {
      if (sub) {
        try {
          fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint, action: 'unsubscribe' }),
          }).catch(function () {});
          sub.unsubscribe().catch(function () {});
        } catch (e) { /* ignore */ }
      }
      setIdle();
    });
  }

  function init() {
    createUI();
    if (!bell) return;
    // 默认显示未订阅描边铃铛；再异步同步为已订阅实心
    setIdle();
    registerSW().then(function () {
      return getSubscription();
    }).then(function (sub) {
      if (sub) setActive();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 对外接口：供「关注此藏家 / 买家名单」组件复用，避免重复申请权限与重复订阅
  window.GudongPush = {
    available: function () {
      return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    },
    subscribe: function (opts) { return subscribe(opts || {}); },
    unsubscribe: onUnsub,
    isSubscribed: function () { return subscribed; },
  };
})();
