/*! gudong-follow.js - 统一"关注"体系（卖家 / 品类关键词）
 * localStorage 本地存储，无后端、无会员（2026-10-07）
 * 数据模型：gudong_follow = [ { type:'seller'|'tag', term:'Lim-KW'|'青花' }, ... ]
 * 用法：
 *   1) <script src="assets/js/gudong-follow.js"></script>
 *   2) 页面里放一个按钮容器，然后：
 *        GudongFollow.mount(el, { type:'seller', term:'Lim-KW',
 *                                 followZh:'关注卖家', followEn:'Follow Seller' });
 *   3) 收藏·关注页：GudongFollow.subsOf('seller'|'tag') / GudongFollow.matches(item, subs)
 */
(function (global) {
  'use strict';

  var KEY = 'gudong_follow';

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

  global.GudongFollow = {
    KEY: KEY, read: read, write: write, all: all,
    isFollowing: isFollowing, toggle: toggle, subsOf: subsOf, count: count,
    matches: matches, injectCss: injectCss, mount: mount, mountChip: mountChip
  };
})(window);
