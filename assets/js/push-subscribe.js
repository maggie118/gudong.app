/* 古董圈 Gudong · Web Push 订阅脚本
 * 2026-11-02：新增；2026-11-02 优化 UI
 * - 右下/左下角「上新通知」按钮；点击申请通知权限并订阅 Web Push；
 * - 已订阅后自动收起为小铃铛圆点（不再挡视线），点击可展开「已订阅 + 退订」菜单；
 * - 新藏品上架时由服务端推送通知，点击直达新藏品页；
 * - VAPID public key 为公开值（私钥只存在服务端环境变量）。
 */
(function () {
  'use strict';

  // 仅支持 PWA + Push API 的环境
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  var VAPID_PUBLIC =
    'BOVxpgqq6eL3r9brj50YMwX6uPLvn4sRTbZCi7sSQLzNfM4YcoDGWLUenK_DWpJIDUeyryFWgo-JPXmvKcwp7qA';

  var LABEL_IDLE = '上新通知';
  var LABEL_PROCESSING = '订阅中…';

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

  var wrap, bigBtn, dotBtn, menu;

  function svgBell(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>';
  }

  function createUI() {
    wrap = document.createElement('div');
    wrap.id = 'gudong-push-wrap';
    wrap.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:9999;font-family:inherit;display:flex;flex-direction:column;align-items:flex-start;';

    // —— 大按钮（未订阅） ——
    bigBtn = document.createElement('button');
    bigBtn.type = 'button';
    bigBtn.style.cssText =
      'display:flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border:none;' +
      'border-radius:22px;cursor:pointer;font-size:14px;font-weight:600;color:#fff;' +
      'background:#7a4a2b;box-shadow:0 4px 14px rgba(0,0,0,.18);';
    bigBtn.innerHTML = svgBell(16) + '<span data-role="label">' + LABEL_IDLE + '</span>';
    bigBtn.addEventListener('click', onBigClick);
    wrap.appendChild(bigBtn);

    // —— 小铃铛圆点（已订阅，收起态） ——
    dotBtn = document.createElement('button');
    dotBtn.type = 'button';
    dotBtn.style.cssText =
      'width:42px;height:42px;display:none;align-items:center;justify-content:center;border:none;' +
      'border-radius:50%;cursor:pointer;color:#fff;background:#7a4a2b;box-shadow:0 4px 14px rgba(0,0,0,.2);';
    dotBtn.innerHTML = svgBell(18);
    dotBtn.addEventListener('click', onDotClick);
    wrap.appendChild(dotBtn);

    // —— 已订阅菜单（展开态） ——
    menu = document.createElement('div');
    menu.style.cssText =
      'display:none;background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.16);' +
      'padding:10px 12px;min-width:150px;font-size:13px;color:#333;';
    var title = document.createElement('div');
    title.textContent = '已订阅上新通知';
    title.style.cssText = 'font-weight:600;padding:2px 2px 8px;';
    var unsub = document.createElement('button');
    unsub.type = 'button';
    unsub.textContent = '退订上新通知';
    unsub.style.cssText =
      'display:block;width:100%;padding:8px 10px;border:none;border-radius:8px;cursor:pointer;' +
      'background:#f3efe9;color:#7a4a2b;font-size:13px;font-weight:600;text-align:center;';
    unsub.addEventListener('click', onUnsub);
    menu.appendChild(title);
    menu.appendChild(unsub);
    wrap.appendChild(menu);

    document.body.appendChild(wrap);
  }

  function setLabel(el, text) {
    var l = el.querySelector('[data-role="label"]');
    if (l) l.textContent = text;
  }

  function showIdle() {
    bigBtn.style.display = 'flex';
    dotBtn.style.display = 'none';
    menu.style.display = 'none';
    setLabel(bigBtn, LABEL_IDLE);
  }

  function showDot() {
    bigBtn.style.display = 'none';
    dotBtn.style.display = 'flex';
    menu.style.display = 'none';
  }

  function showMenu() {
    bigBtn.style.display = 'none';
    dotBtn.style.display = 'none';
    menu.style.display = 'block';
  }

  function getSubscription() {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    }).catch(function () { return null; });
  }

  function registerSW() {
    return navigator.serviceWorker.register('/sw.js').catch(function () { return null; });
  }

  function postSubscription(sub) {
    return fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        auth: b64(sub.getKey('auth')),
        p256dh: b64(sub.getKey('p256dh')),
      }),
    }).then(function (r) {
      if (!r.ok) throw new Error('save failed ' + r.status);
      return r;
    });
  }

  // 点击大按钮：申请权限并订阅
  function onBigClick() {
    setLabel(bigBtn, LABEL_PROCESSING);
    if ('Notification' in window && Notification.permission === 'denied') {
      setLabel(bigBtn, '已拒绝，浏览器设置中开启');
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { showIdle(); return; }
      registerSW().then(function () {
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }).then(function (sub) {
        return postSubscription(sub);
      }).then(function () {
        showDot();
      }).catch(function () {
        showIdle();
      });
    });
  }

  // 点击小圆点：展开菜单
  function onDotClick() {
    showMenu();
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
      showIdle();
    });
  }

  function init() {
    createUI();
    // 已订阅用户：加载时同步状态（收起为小圆点）
    registerSW().then(function () {
      return getSubscription();
    }).then(function (sub) {
      if (sub) showDot();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
