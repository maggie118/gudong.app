/*! gudong-follow.js - 统一"关注"体系（卖家 / 品类关键词）
 * localStorage 本地存储，无后端、无会员（2026-10-07）
 * 数据模型：gudong_follow = [ { type:'seller'|'tag', term:'Lim-KW'|'青花' }, ... ]
 * 用法：
 *   1) <script src="assets/js/gudong-follow.js"></script>
 *   2) 页面里放一个按钮容器，然后：
 *        GudongFollow.mount(el, { type:'seller', term:'Lim-KW',
 *                                 followZh:'关注藏家', followEn:'Follow Collector' });
 *   3) 收藏·关注页：GudongFollow.subsOf('seller'|'tag') / GudongFollow.matches(item, subs)
 */
(function (global) {
  'use strict';

  var KEY = 'gudong_follow';
  var KEY_SEEN = 'gudong_last_seen';
  var KEY_WATCH = 'gudong_price_watch';
  var _sessionSeen = 0;

  /* ---------- 存储 ---------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (s) {
        return s && typeof s === 'object' && s.type && s.term;
      }).map(function (s) { return { type: String(s.type), term: String(s.term) }; });
    } catch (e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; }
    catch (e) { return false; }
  }
  function normalize(term) {
    return String(term == null ? '' : term).trim().toLowerCase();
  }

  /* ---------- 查询 / 切换 ---------- */
  function isFollowing(type, term) {
    term = normalize(term);
    if (!type || !term) return false;
    return read().some(function (s) { return s.type === type && normalize(s.term) === term; });
  }
  function toggle(type, term) {
    term = normalize(term);
    if (!type || !term) return false;
    var arr = read();
    var i = -1;
    for (var k = 0; k < arr.length; k++) {
      if (arr[k].type === type && normalize(arr[k].term) === term) { i = k; break; }
    }
    var now;
    if (i === -1) { arr.push({ type: type, term: term }); now = true; }
    else { arr.splice(i, 1); now = false; }
    write(arr);
    return now;
  }
  function subsOf(type) {
    return read().filter(function (s) { return s.type === type; }).map(function (s) { return s.term; });
  }
  function all() { return read(); }
  function count(type) { return subsOf(type).length; }

  /* ---------- 匹配：一件藏品是否命中任一关注 ---------- */
  function matches(f, subs) {
    if (!f || !subs || !subs.length) return false;
    var hay = normalize([f.title_zh, f.title_en, f.era_zh, f.era_en, f.category, f.reason_zh, f.reason_en].filter(Boolean).join(' '));
    return subs.some(function (s) {
      if (s.type === 'seller') return normalize(f.seller_id) === s.term;
      if (s.type === 'tag') return hay.indexOf(s.term) !== -1;
      return false;
    });
  }

  /* ---------- 共享样式 ---------- */
  function injectCss() {
    if (document.getElementById('gf-shared-css')) return;
    var st = document.createElement('style');
    st.id = 'gf-shared-css';
    st.textContent =
      '.gf-btn{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;' +
      'padding:.6rem 1.1rem;min-height:44px;border-radius:8px;font-size:.84rem;font-weight:600;' +
      'cursor:pointer;border:1px solid #7A4E33;background:transparent;color:#7A4E33;' +
      'transition:.4s cubic-bezier(.25,.1,.25,1);white-space:nowrap;font-family:inherit}' +
      '.gf-btn:hover{background:#F1E8DF}' +
      '.gf-btn.on{background:#7A4E33;border-color:#7A4E33;color:#fff}' +
      '.gf-btn.on:hover{background:#5C3A26}' +
      '.gf-btn svg{width:15px;height:15px;flex-shrink:0;fill:currentColor}' +
      '.gf-follow-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:.7rem 0}' +
      '.gf-chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:.8rem 0}' +
      '.gf-chip{display:inline-flex;align-items:center;gap:.3rem;padding:.42rem .85rem;border-radius:20px;' +
      'font-size:.8rem;font-weight:600;border:1px solid #E4DED5;background:#fff;color:#5C564F;cursor:pointer;' +
      'transition:.4s cubic-bezier(.25,.1,.25,1);font-family:inherit}' +
      '.gf-chip:hover{border-color:#7A4E33;color:#7A4E33}' +
      '.gf-chip.on{background:#7A4E33;border-color:#7A4E33;color:#fff}' +
      '.gf-saved-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:.4rem 0 1.2rem}' +
      '.gf-tab{padding:.55rem 1.1rem;min-height:44px;border-radius:8px;font-size:.88rem;font-weight:600;' +
      'border:1px solid #E4DED5;background:#fff;color:#5C564F;cursor:pointer;transition:.4s cubic-bezier(.25,.1,.25,1);font-family:inherit}' +
      '.gf-tab:hover{border-color:#7A4E33;color:#7A4E33}' +
      '.gf-tab.on{background:#7A4E33;border-color:#7A4E33;color:#fff}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 关注按钮渲染（bilingual，outline ↔ filled） ---------- */
  function mount(btn, opts) {
    if (!btn || !opts || !opts.type || !opts.term) return;
    injectCss();
    /* 挂上共享样式类：页面若只用自己的 class（如 .gf-follow-btn），
       注入的 .gf-btn 规则会全部落空 —— 按钮内的内联 SVG 只有 viewBox、
       没有 width/height，会被 flex 容器撑成巨型图标盖住卡片。
       这里统一补一个 .gf-btn，保证共享样式永远命中。 */
    if (!btn.classList.contains('gf-btn')) btn.classList.add('gf-btn');
    var zh = document.body.dataset.lang !== 'en';
    var fZh = opts.followZh || '\u5173\u6ce8';            // 关注
    var fEn = opts.followEn || 'Follow';
    var dZh = opts.doneZh || '\u5df2\u5173\u6ce8';        // 已关注
    var dEn = opts.doneEn || 'Following';
    var svg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V18h14v-1.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V18h6v-1.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';
    function render() {
      var on = isFollowing(opts.type, opts.term);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.innerHTML = svg + (on
        ? '<span class="zh">' + dZh + '</span><span class="en">' + dEn + '</span>'
        : '<span class="zh">' + fZh + '</span><span class="en">' + fEn + '</span>');
      if (opts.onChange) opts.onChange(on, opts.term);
    }
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var on = toggle(opts.type, opts.term);
      render();
      if (opts.onToggle) opts.onToggle(on, opts.term);
    });
    // 跨标签页同步（收藏/关注数据在同一 localStorage 下）
    window.addEventListener('storage', function (e) {
      if (e && e.key === KEY) render();
    });
    render();
    return { refresh: render, now: function () { return isFollowing(opts.type, opts.term); } };
  }

  /* ---------- 快捷 chip 渲染（关注品类关键词） ---------- */
  function mountChip(chip, opts) {
    if (!chip || !opts || !opts.term) return;
    injectCss();
    var zh = document.body.dataset.lang !== 'en';
    function render() {
      var on = isFollowing('tag', opts.term);
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      toggle('tag', opts.term);
      render();
      if (opts.onToggle) opts.onToggle(isFollowing('tag', opts.term), opts.term);
    });
    window.addEventListener('storage', function (e) { if (e && e.key === KEY) render(); });
    render();
  }

  /* ---------- 提醒（站内）：上次访问时间 / 个人降价 / 上新 ---------- */
  function getF(f, keys) {
    if (!f) return null;
    for (var i = 0; i < keys.length; i++) {
      var v = f[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }
  function getSeen() {
    try { var v = localStorage.getItem(KEY_SEEN); var n = Number(v); return isFinite(n) && n > 0 ? n : 0; } catch (e) { return 0; }
  }
  function markSeen() {
    try { localStorage.setItem(KEY_SEEN, String(Date.now())); return true; } catch (e) { return false; }
  }
  /* 进入"提醒会话"：记住上次访问时间，然后刷新到当前（本会话用 sessionSeen 判定"新"） */
  function beginSession() {
    _sessionSeen = getSeen();
    markSeen();
    return _sessionSeen;
  }
  function sessionSeen() { return _sessionSeen || getSeen(); }

  function parsePrice(f) {
    if (!f) return null;
    var np = Number(f.fixed_price);
    if (isFinite(np) && np > 0) return np;
    var cands = ['price_num', 'fixed_price_num', 'amount', 'price_value', 'price'];
    for (var i = 0; i < cands.length; i++) {
      var v = f[cands[i]];
      if (v === undefined || v === null || v === '') continue;
      var n = Number(String(v).replace(/[S$\s,]/gi, ''));
      if (isFinite(n) && n > 0) return n;
    }
    var s = [f.price_zh, f.price_en, f.price_display_zh, f.price_display_en].filter(function (x) { return x && /[\d]/.test(String(x)); })[0];
    if (s) { var m = String(s).replace(/[S$\s,]/gi, '').match(/\d+(\.\d+)?/); if (m) { var nn = Number(m[0]); if (isFinite(nn) && nn > 0) return nn; } }
    return null;
  }
  function readWatch() { try { var raw = localStorage.getItem(KEY_WATCH); var o = raw ? JSON.parse(raw) : {}; return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
  function writeWatch(o) { try { localStorage.setItem(KEY_WATCH, JSON.stringify(o)); } catch (e) {} }
  /* 记录本次看到的价格；若相对上次记录下降，返回 {dropped,pct,from,to} */
  function watchPrice(itemId, price) {
    if (!itemId) return null;
    var w = readWatch();
    var prev = w[itemId];
    var rec = { price: (price == null ? null : price), ts: Date.now() };
    w[itemId] = rec; writeWatch(w);
    if (prev && prev.price != null && price != null && price < prev.price) {
      var pct = (prev.price - price) / prev.price * 100;
      if (pct >= 1) return { dropped: true, pct: Math.round(pct), from: prev.price, to: price };
    }
    return null;
  }
  /* 综合降价：数据自带最近调价，或相对上次看到的价格下降 */
  function dropAlert(f) {
    if (!f) return null;
    var cur = parsePrice(f);
    var direct = Number(getF(f, ['price_drop_pct', 'drop_pct', 'reduced_pct']) || '');
    if (isFinite(direct) && direct >= 1) return { pct: Math.round(direct), source: 'data' };
    var prev = Number(getF(f, ['prev_price', 'previous_price', 'original_price', 'was_price', 'old_price', 'price_before']) || '');
    if (cur && isFinite(prev) && prev > cur) { var p = (prev - cur) / prev * 100; if (p >= 1) return { pct: Math.round(p), source: 'prev' }; }
    return null;
  }
  /* 上新：上架时间晚于"本次会话开始时记录的上次访问" */
  function isNewSinceSeen(f) {
    var seen = sessionSeen();
    if (!seen) return false;
    var raw = getF(f, ['listed_at', 'listed_time', 'created_at', '_createdTime', 'updated_at']);
    if (!raw) return false;
    var t = new Date(raw);
    if (isNaN(t.getTime())) return false;
    return t.getTime() > seen;
  }

  global.GudongFollow = {
    KEY: KEY, KEY_SEEN: KEY_SEEN, KEY_WATCH: KEY_WATCH,
    read: read, write: write, all: all,
    isFollowing: isFollowing, toggle: toggle, subsOf: subsOf, count: count,
    matches: matches, injectCss: injectCss, mount: mount, mountChip: mountChip,
    getSeen: getSeen, markSeen: markSeen, beginSession: beginSession, sessionSeen: sessionSeen,
    parsePrice: parsePrice, watchPrice: watchPrice, dropAlert: dropAlert, isNewSinceSeen: isNewSinceSeen
  };
})(window);
