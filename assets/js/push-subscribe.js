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

  var VAPID_PUBLIC =
    'BOVxpgqq6eL3r9brj50YMwX6uPLvn4sRTbZCi7sSQLzNfM4YcoDGWLUenK_DWpJIDUeyryFWgo-JPXmvKcwp7qA';

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
    hr.appendChild(bell);

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

  // 点击铃铛：未订阅→订阅；已订阅→开/关退订菜单
  function onBellClick(e) {
    e.stopPropagation();
    if (subscribed) { showMenu(menu.style.display === 'none'); return; }
    if ('Notification' in window && Notification.permission === 'denied') {
      alert('通知权限已被浏览器拒绝，请在浏览器设置中开启后再订阅。');
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return;
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
        setActive();
      }).catch(function () { /* 静默失败，保持未订阅态 */ });
    });
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
    // 已订阅用户：加载时同步铃铛为实心高亮
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
})();
