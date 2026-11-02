/* 古董圈 Gudong · Web Push 订阅脚本
 * 2026-11-02：新增
 * - 右下角浮动「上新通知」按钮；点击申请通知权限并订阅 Web Push；
 * - 新藏品上架时由服务端推送通知，点击直达新藏品页；
 * - VAPID public key 为公开值（浏览器订阅需用它；私钥只存在服务端环境变量）。
 */
(function () {
  'use strict';

  // 仅支持 PWA + Push API 的环境
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  // VAPID 公钥（公开）：与 Vercel 环境变量 VAPID_PUBLIC_KEY 一致
  var VAPID_PUBLIC =
    'BOVxpgqq6eL3r9brj50YMwX6uPLvn4sRTbZCi7sSQLzNfM4YcoDGWLUenK_DWpJIDUeyryFWgo-JPXmvKcwp7qA';

  var LABEL_IDLE = '上新通知';
  var LABEL_SUBSCRIBED = '已订阅上新';
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

  function createButton() {
    var wrap = document.createElement('div');
    wrap.id = 'gudong-push-wrap';
    wrap.setAttribute('aria-live', 'polite');
    wrap.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:9999;font-family:inherit;';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gudong-push-btn';
    btn.style.cssText =
      'display:flex;align-items:center;gap:7px;min-height:44px;padding:0 15px;border:none;' +
      'border-radius:22px;cursor:pointer;font-size:14px;font-weight:600;color:#fff;' +
      'background:#7a4a2b;box-shadow:0 4px 14px rgba(0,0,0,.18);';
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>' +
      '<span data-role="label">' + LABEL_IDLE + '</span>';
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    return btn;
  }

  function setLabel(btn, text) {
    var el = btn.querySelector('[data-role="label"]');
    if (el) el.textContent = text;
  }

  function toast(msg) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        return; // 已授权则用系统通知即可，不弹页内 toast
      }
    } catch (e) { /* ignore */ }
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
    var payload = {
      endpoint: sub.endpoint,
      auth: b64(sub.getKey('auth')),
      p256dh: b64(sub.getKey('p256dh')),
    };
    return fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok) throw new Error('save failed ' + r.status);
      return r;
    });
  }

  function subscribe(btn) {
    setLabel(btn, LABEL_PROCESSING);
    if ('Notification' in window && Notification.permission === 'denied') {
      setLabel(btn, '已拒绝，浏览器设置中开启');
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') {
        setLabel(btn, LABEL_IDLE);
        return;
      }
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
        setLabel(btn, LABEL_SUBSCRIBED);
      }).catch(function () {
        setLabel(btn, LABEL_IDLE);
      });
    });
  }

  function init() {
    var btn = createButton();
    btn.addEventListener('click', function () {
      getSubscription().then(function (sub) {
        if (sub) {
          setLabel(btn, LABEL_SUBSCRIBED);
          return;
        }
        subscribe(btn);
      });
    });
    // 已安装 PWA 用户：加载时同步订阅状态
    registerSW().then(function () {
      return getSubscription();
    }).then(function (sub) {
      if (sub) setLabel(btn, LABEL_SUBSCRIBED);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
