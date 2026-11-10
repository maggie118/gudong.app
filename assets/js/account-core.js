/* assets/js/account-core.js —— 「我的帐户」的客户端小工具（2026-11-10）
 *
 * 收藏 / 关注 以前只存在本机 localStorage；有了 D1 之后跟着买家身份走：
 *   gudong_buyer  = { email, name, source, buyer_id, ts }  （wa-contact-gate.js 写入）
 *   gudong_fav    = ['item-limck-01', ...]                 （藏品页心形按钮写入）
 *   gudong_follow = [{ type:'seller'|'tag', term }]        （gudong-follow.js 写入）
 *
 * 对外：window.GudongAccount
 *   identity()                     -> 身份对象 / null
 *   key()                          -> buyer_key（buyer_id 优先，其次邮箱）
 *   list()                         -> Promise<<{favorites, follows, key}>>
 *   saveFav(itemId, meta) / removeFav(itemId)
 *   follow(kind, target, label, on)
 *   syncLocal()                    -> 把本机清单补同步进 D1，返回合并后的全量
 */
(function (global) {
  'use strict';

  var BUYER_KEY = 'gudong_buyer';
  var FAV_KEY = 'gudong_fav';
  var FOLLOW_KEY = 'gudong_follow';
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000;

  function readBuyer() {
    try {
      var me = JSON.parse(localStorage.getItem(BUYER_KEY) || 'null');
      return me && typeof me === 'object' ? me : null;
    } catch (e) { return null; }
  }

  function writeBuyer(me) {
    try { localStorage.setItem(BUYER_KEY, JSON.stringify(me)); return true; } catch (e) { return false; }
  }

  function identity() {
    var me = readBuyer();
    if (!me || !me.contact) return null;
    if (!me.ts || Date.now() - me.ts > MAX_AGE) return null;
    return me;
  }

  function key() {
    var me = identity();
    if (!me) return '';
    if (me.buyer_id && /^[a-z0-9_]{4,40}$/i.test(me.buyer_id)) return String(me.buyer_id).toLowerCase();
    var email = String(me.contact || '').toLowerCase();
    return /^[a-z0-9_@.\-]{4,120}$/.test(email) ? email : '';
  }

  function readFav() {
    try {
      var arr = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x; }) : [];
    } catch (e) { return []; }
  }

  function readFollow() {
    if (global.GudongFollow && global.GudongFollow.all) {
      try { return global.GudongFollow.all() || []; } catch (e) { /* fall through */ }
    }
    try {
      var arr = JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(function (s) { return s && s.type && s.term; }) : [];
    } catch (e) { return []; }
  }

  function api(params) {
    var body = JSON.stringify(params || {});
    return fetch('/api/buyer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      cache: 'no-store'
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .catch(function () { return {}; });
  }

  /* 邮箱身份没有 buyer_id：先去 /api/buyer 换一个，之后关键器就不可猜了 */
  function ensureKey() {
    var me = identity();
    if (!me) return Promise.resolve('');
    var existing = key();
    if (me.buyer_id) return Promise.resolve(existing);
    return fetch('/api/buyer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(me.contact || '').toLowerCase(), name: me.name || '' }),
      cache: 'no-store'
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (res && res.ok && res.buyer_id) {
          me.buyer_id = res.buyer_id;
          writeBuyer(me);
          return String(res.buyer_id).toLowerCase();
        }
        return existing;
      })
      .catch(function () { return existing; });
  }

  function list() {
    return ensureKey().then(function (buyerKey) {
      if (!buyerKey) return { favorites: [], follows: [], key: '' };
      return fetch('/api/buyer?buyer_key=' + encodeURIComponent(buyerKey), { cache: 'no-store' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (res) {
          return {
            favorites: Array.isArray(res.favorites) ? res.favorites : [],
            follows: Array.isArray(res.follows) ? res.follows : [],
            key: buyerKey
          };
        });
    }).catch(function () { return { favorites: [], follows: [], key: '' }; });
  }

  function saveFav(itemId, meta) {
    if (!itemId) return Promise.resolve({});
    return ensureKey().then(function (buyerKey) {
      if (!buyerKey) return {};
      return api({
        buyer_key: buyerKey,
        op: 'fav',
        item_id: itemId,
        seller: (meta && meta.seller) || '',
        title: (meta && meta.title) || '',
        action: 'save'
      });
    });
  }

  function removeFav(itemId) {
    if (!itemId) return Promise.resolve({});
    return ensureKey().then(function (buyerKey) {
      if (!buyerKey) return {};
      return api({ buyer_key: buyerKey, op: 'fav', item_id: itemId, action: 'unsave' });
    });
  }

  function follow(kind, target, label, on) {
    if (!target) return Promise.resolve({});
    return ensureKey().then(function (buyerKey) {
      if (!buyerKey) return {};
      return api({
        buyer_key: buyerKey,
        op: 'follow',
        kind: kind === 'tag' || kind === 'category' ? 'category' : 'seller',
        target: String(target),
        label: label || '',
        action: on ? 'on' : 'off'
      });
    });
  }

  function syncLocal() {
    return ensureKey().then(function (buyerKey) {
      if (!buyerKey) return { favorites: [], follows: [], key: '' };
      var follows = [];
      readFollow().forEach(function (s) {
        if (!s || !s.term) return;
        follows.push({
          kind: s.type === 'seller' ? 'seller' : 'category',
          target: String(s.term),
          label: s.term
        });
      });
      return api({ buyer_key: buyerKey, favorites: readFav(), follows: follows })
        .then(function (res) {
          return {
            favorites: Array.isArray(res.favorites) ? res.favorites : [],
            follows: Array.isArray(res.follows) ? res.follows : [],
            key: buyerKey
          };
        });
    }).catch(function () { return { favorites: [], follows: [], key: '' }; });
  }

  global.GudongAccount = {
    KEY: BUYER_KEY,
    identity: identity,
    key: key,
    ensureKey: ensureKey,
    list: list,
    syncLocal: syncLocal,
    saveFav: saveFav,
    removeFav: removeFav,
    follow: follow,
    readFav: readFav,
    readFollow: readFollow
  };
})(window);
