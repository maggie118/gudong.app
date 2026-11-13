// assets/js/seller-analytics.js
// 藏家后台「数据看板」：在 seller-inbox.html（/seller.html）顶部渲染聚合数字。
// 数据来自 /api/enquiries?analytics=1&days=30（签名令牌 → Vercel → Worker → D1），
// 只有数字：关注 / 收藏 / 咨询 / 最常被收藏 top5，不含任何买家身份。
// 令牌来源：URL hash 的 ?token=，或本机缓存 gudong.sellerTokens[seller_id]。
(function () {
  'use strict';

  var box = document.getElementById('sellerAnalytics');
  if (!box) return;

  function readToken() {
    var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    return hash.get('token') || '';
  }

  function decodePayload(tk) {
    try {
      var part = String(tk).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part)) || {};
    } catch (e) { return {}; }
  }

  var token = readToken();
  if (!token || token.indexOf('.') < 0) return;
  var payload = decodePayload(token);
  if (!payload.seller_id) return;

  function num(v) { return Number(v || 0).toLocaleString(); }

  fetch('/api/enquiries?analytics=1&days=30', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    cache: 'no-store'
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (res) {
    var a = res && res.analytics;
    if (!a) { box.hidden = true; return; }
    var fav = a.favorites || {}, fol = a.followers || {}, clk = a.clicks || {};

    box.querySelector('[data-an="follow"]').textContent = num(fol.total);
    box.querySelector('[data-an="fav"]').textContent = num(fav.total);
    box.querySelector('[data-an="inq"]').textContent = num(clk.total);

    var favBuyers = box.querySelector('[data-an="fav-buyers"]');
    if (favBuyers && fav.buyers) {
      favBuyers.textContent = (document.body.getAttribute('data-lang') === 'en')
        ? 'from ' + num(fav.buyers) + ' collectors'
        : '来自 ' + num(fav.buyers) + ' 位藏家';
      favBuyers.hidden = false;
    }

    [['follow', fol.recent], ['fav', fav.recent], ['inq', clk.recent]].forEach(function (pair) {
      var el = box.querySelector('[data-delta="' + pair[0] + '"]');
      if (el && Number(pair[1]) > 0) { el.textContent = '+' + num(pair[1]) + ' · 30d'; el.hidden = false; }
    });

    var topEl = box.querySelector('#anTop');
    var top = fav.top || [];
    if (topEl && top.length) {
      topEl.innerHTML = '<span class="an-top-label"><span class="zh">最常被收藏</span><span class="en">Most saved</span></span>' +
        top.slice(0, 5).map(function (t) {
          var label = String(t.title || t.item_id || '').replace(/[<>&"]/g, '');
          return '<span class="an-chip">' + label + '<i>' + num(t.saves) + '</i></span>';
        }).join('');
      topEl.hidden = false;
    }

    box.setAttribute('data-seller', payload.seller_id);
    box.hidden = false;
  }).catch(function () { box.hidden = true; });
})();
