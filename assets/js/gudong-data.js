/*! gudong-data.js — 站点公共数据层（2026-09-25 更新）
 *
 * 作用：所有子页面共用一套「读取 Airtable → 清洗 → 渲染」逻辑，避免每页各抄一份。
 * 引用方式（放在页面内联脚本之前）：
 *     <script src="../assets/js/gudong-data.js" data-root="../"></script>   ← 位于子目录
 *     <script src="assets/js/gudong-data.js"></script>                       ← 位于根目录
 * data-root = 从当前页面回到站点根目录的相对路径（根目录页面留空）。
 *
 * 数据链路：/api/airtable-proxy（Airtable 实时数据）→ 失败则读 data/listings.json 快照 → 再失败则页面保留原静态内容。
 * 诊断：任何页面加 ?debug=1，左下角显示数据来自 Airtable 还是快照。
 *
 * ?? 2026-09-25 更新：
 *   1. normalizePayload 增加 intel 字段，所有页面都能拿到情报数据。
 *   2. catKey 增加 'all' 特判，修复 mountCategory({cat:'all'}) 被错误归入 misc 的 bug。
 *   3. mountCategory 里 key 判断改为 o.cat === 'all' ? 'all' : catKey(o.cat)。
 *   4. 新增 renderIntel(container, list) 通用情报渲染函数，任何页面都能用。
 *   5. mountCategory 渲染完成后广播 gd:rendered 事件。
 */
(function (global) {
  'use strict';

  var cs = document.currentScript;
  var ROOT = (cs && cs.getAttribute('data-root')) || '';
  var HOST = location.hostname;
  var LOCAL = HOST === '127.0.0.1' || HOST === 'localhost' || location.protocol === 'file:';
  var API_BASE = LOCAL ? 'https://gudong.app' : '';      // 本地预览时直连线上接口
  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var diag = { source: 'pending', endpoint: '', proxy: null, snapshot: null, payloadKeys: [],
               counts: {}, skipped: 0, sampleKeys: [], errors: [], page: '' };

  /* ---------- 基础工具 ---------- */
  var HY = /[\u2010-\u2015\u2212\uFE58\uFF0D]/g;           // Unicode 连字符 → ASCII '-'
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normId(v) { return String(v == null ? '' : v).replace(HY, '-').trim(); }
  function first(v) { return Array.isArray(v) ? v[0] : v; }

  var CAT_ALIASES = {
    '瓷器': 'porcelain', 'porcelain': 'porcelain',
    '玉器': 'jade', 'jade': 'jade',
    '钱币': 'coins', 'coins': 'coins', 'coin': 'coins',
    '书画': 'paintings', 'paintings': 'paintings', 'painting': 'paintings', 'calligraphy': 'paintings',
    '杂项': 'misc', 'misc': 'misc', 'miscellaneous': 'misc', 'other': 'misc'
  };
  /* ?? 2026-09-25：增加 'all' 特判，避免 'all' 被归入 misc */
  function catKey(c) {
    var v = String(c == null ? '' : c).trim().toLowerCase();
    if (v === 'all' || v === '') return 'all';
    if (CAT_ALIASES[v]) return CAT_ALIASES[v];
    if (/瓷|porcelain|ceramic/.test(v)) return 'porcelain';
    if (/玉|jade/.test(v)) return 'jade';
    if (/币|钱|coin|numismat/.test(v)) return 'coins';
    if (/画|书法|painting|calligraph/.test(v)) return 'paintings';
    return 'misc';
  }

  /* ---------- 公共样式 ---------- */
  function injectCss() {
    if (document.getElementById('gd-shared-css')) return;
    var st = document.createElement('style');
    st.id = 'gd-shared-css';
    st.textContent =
      '@keyframes gd-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}' +
      '.gd-skel{border-radius:8px;background:linear-gradient(90deg,#F1E8DF 25%,#FAF6F0 50%,#F1E8DF 75%);background-size:200% 100%;animation:gd-shimmer 1.4s linear infinite}' +
      '@media (prefers-reduced-motion:reduce){.gd-skel{animation:none}}' +
      '.gd-price{margin-top:.3rem;font-weight:700;font-size:.95rem;color:#8A5A3B;line-height:1.4}' +
      '.gd-price--enquiry{font-weight:600;color:#716B63}' +
      '.gd-empty,.gd-error{grid-column:1/-1;text-align:center;padding:2.4rem 1rem;color:#716B63;line-height:1.8}' +
      '.gd-error strong{color:#9A554B}' +
      '[hidden]{display:none!important}' +
      '.gd-debug{position:fixed;left:8px;bottom:8px;z-index:9999;max-width:min(94vw,440px);max-height:60vh;overflow:auto;background:rgba(20,17,14,.94);color:#E8E2D8;font:12px/1.6 ui-monospace,Menlo,Consolas,monospace;padding:10px 12px;border-radius:8px;white-space:pre-wrap;word-break:break-all}' +
      '.gd-debug .ok{color:#9FD08A}.gd-debug .warn{color:#E6C46B}.gd-debug .bad{color:#F0A090}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- 记录清洗 ---------- */
  function normKey(k) { return String(k).trim().toLowerCase().replace(/[\s\-]+/g, '_'); }
  function asBool(v) {
    if (typeof v === 'string') return /^(true|yes|y|1|是|?|?)$/i.test(v.trim());
    return !!v;
  }
  function normalizeRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    var src = (rec.fields && typeof rec.fields === 'object') ? rec.fields : rec;
    var out = {};
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (Array.isArray(v)) {
        if (!v.length) v = null;
        else if (v.every(function (x) { return x === null || typeof x !== 'object'; })) v = v[0];
      }
      var key = normKey(k);
      out[key] = /^is_/.test(key) ? asBool(v) : v;
    });
    [['title_zh', 'title_en'], ['era_zh', 'era_en']].forEach(function (p) {
      if (!out[p[0]] && out[p[1]]) out[p[0]] = out[p[1]];
      if (!out[p[1]] && out[p[0]]) out[p[1]] = out[p[0]];
    });
    return out;
  }
  function pickList(json) {
    for (var i = 1; i < arguments.length; i++) if (Array.isArray(json[arguments[i]])) return json[arguments[i]];
    return null;
  }
  function normalizePayload(json) {
    if (!json || typeof json !== 'object') throw new Error('响应不是 JSON 对象');
    if (json.error) {
      var m = typeof json.error === 'string' ? json.error : (json.error.message || JSON.stringify(json.error));
      throw new Error('接口返回错误：' + String(m).slice(0, 120));
    }
    diag.payloadKeys = Array.isArray(json) ? ['(array)'] : Object.keys(json);
    var tf = pickList(json, 'todayFinds', 'today_finds'),
        ep = pickList(json, 'editorPicks', 'editor_picks'),
        nl = pickList(json, 'newListing', 'newListings', 'new_listing', 'new_listings'),
        flat = Array.isArray(json) ? json : (Array.isArray(json.records) ? json.records : null),
        groups;
    if (tf || ep || nl) groups = { todayFinds: tf || [], editorPicks: ep || [], newListing: nl || [] };
    else if (flat) {
      var all = flat.map(normalizeRecord).filter(Boolean);
      groups = {
        todayFinds: all.filter(function (f) { return f.is_today_finds; }),
        editorPicks: all.filter(function (f) { return f.is_editor_picks || f.is_editor_pick || f.is_featured; }),
        newListing: all
      };
    } else throw new Error('响应中找不到 todayFinds / editorPicks / newListing（实际字段：' + diag.payloadKeys.join(', ') + '）');

    var total = 0, kept = 0;
    function clean(list) {
      return list.map(normalizeRecord).filter(function (f) {
        total++;
        if (f && normId(f.item_id) && (f.title_zh || f.title_en)) { kept++; return true; }
        diag.skipped++;
        return false;
      });
    }
    var out = { todayFinds: clean(groups.todayFinds), editorPicks: clean(groups.editorPicks), newListing: clean(groups.newListing) };
    if (total > 0 && kept === 0) throw new Error('所有记录都缺少 item_id 或标题，请检查 Airtable 字段名');

    /* ?? 2026-09-25：情报数据（来自代理的 intel 数组），所有页面通用 */
    out.intel = Array.isArray(json.intel) ? json.intel.filter(function (it) {
      return it && it.type && (it.zh || it.en || it.text_zh || it.text_en);
    }).map(function (it) {
      return {
        type: it.type,
        zh: it.zh || it.text_zh || '',
        en: it.en || it.text_en || it.zh || it.text_zh || '',
        meta: it.meta || it.meta_zh || '编辑整理',
        metaEn: it.metaEn || it.meta_en || 'Editorial'
      };
    }) : [];

    /* 卖家展馆名 */
    out.sellers = (Array.isArray(json.sellers) ? json.sellers : []).map(normalizeRecord).filter(function (sl) {
      return sl && normId(sl.seller_id) && (sl.display_zh || sl.display_en);
    }).map(function (sl) {
      sl.seller_id = normId(sl.seller_id);
      if (!sl.display_zh) sl.display_zh = sl.display_en;
      if (!sl.display_en) sl.display_en = sl.display_zh;
      return sl;
    });

    var f0 = out.todayFinds[0] || out.editorPicks[0] || out.newListing[0];
    diag.sampleKeys = f0 ? Object.keys(f0) : [];
    diag.counts = {
      todayFinds: out.todayFinds.length,
      editorPicks: out.editorPicks.length,
      newListing: out.newListing.length,
      intel: out.intel.length
    };
    return out;
  }
  function sellerMap(data) {
    var m = {};
    ((data && data.sellers) || []).forEach(function (sl) { m[sl.seller_id] = sl; });
    return m;
  }
  function dedupe(list) {
    var seen = {};
    return list.filter(function (f) {
      var k = normId(f.item_id);
      if (seen[k]) return false;
      return (seen[k] = true);
    });
  }

  /* ---------- 价格 ---------- */
  function fmtMoney(v) {
    v = first(v);
    if (v == null || v === '') return '';
    var str = String(v).trim();
    if (/^(S?\$)?\s*[\d,]+(\.\d+)?$/i.test(str)) {
      var n = Number(str.replace(/[S$\s,]/gi, ''));
      if (!isFinite(n) || n <= 0) return '';
      return 'S$' + new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(n);
    }
    return str;
  }
  function joinPrice(label, amount) {
    label = first(label); amount = first(amount);
    label = label == null ? '' : String(label).trim();
    amount = amount == null ? '' : String(amount).trim();
    if (!label) return amount;
    if (!amount || label.indexOf(amount) !== -1) return label;
    return /[:：]\s*$/.test(label) ? label + amount : label + ' ' + amount;
  }
  function resolvePrice(f) {
    var type = String(first(f.price_type) || first(f['price type']) || '').trim();
    var enquiry = { zh: '私聊询价', en: 'Enquire', enquiry: true };
    if (/私聊|询价|enquir|inquir|message/i.test(type)) return enquiry;
    var fixed = fmtMoney(f.fixed_price);
    if (fixed && (!type || /一口价|fixed/i.test(type))) return { zh: fixed, en: fixed, enquiry: false };
    var zh = joinPrice(f.price_display_zh, f.price_zh) || joinPrice(f.price_display_en, f.price_en);
    var en = joinPrice(f.price_display_en, f.price_en) || joinPrice(f.price_display_zh, f.price_zh);
    if (zh || en) return { zh: zh || en, en: en || zh, enquiry: false };
    return enquiry;
  }
  function priceBlock(f) {
    var p = resolvePrice(f);
    return '<div class="gd-price' + (p.enquiry ? ' gd-price--enquiry' : '') + '"><span class="zh">' + esc(p.zh) + '</span><span class="en">' + esc(p.en) + '</span></div>';
  }

  /* ---------- 图片 / 链接 ---------- */
  function attachmentUrl(v) {
    if (!v) return '';
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') return (v.thumbnails && v.thumbnails.large && v.thumbnails.large.url) || v.url || '';
    return typeof v === 'string' ? v.trim() : '';
  }
  function imgUrl(f) {
    var u = attachmentUrl(f.img_url);
    if (/^https?:\/\//i.test(u)) return u;
    var file = normId(first(f.img_file) || '');
    var base = diag.source === 'local-snapshot' ? ROOT + 'assets/images/' : API_BASE + '/assets/images/';
    return base + (file || 'placeholder.jpg');
  }
  var IMG_FALLBACK = "this.onerror=null;this.src='" + ROOT + "assets/images/placeholder.jpg'";
  function itemHref(f) { return ROOT + 'items/' + esc(normId(f.item_id)) + '.html'; }

  /* ---------- 网络请求 ---------- */
  function fetchJson(url, ms, tag) {
    var ctl = new AbortController(), t0 = performance.now();
    var timer = setTimeout(function () { ctl.abort(); }, ms);
    return fetch(url, { cache: 'no-store', signal: ctl.signal, headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        diag[tag] = { status: res.status, ms: Math.round(performance.now() - t0) };
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (e) {
        if (!diag[tag]) diag[tag] = { status: 'no response', ms: Math.round(performance.now() - t0) };
        throw e && e.name === 'AbortError' ? new Error('请求超时（' + ms + 'ms）') : e;
      })
      .then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }
  function fetchProxy(url) {
    return fetchJson(url, 8000, 'proxy').catch(function (e) {
      if (!/超时|HTTP 5\d\d/.test(e.message)) throw e;
      diag.errors.push('proxy 第 1 次失败：' + e.message + '，重试中');
      return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return fetchJson(url, 8000, 'proxy'); });
    });
  }

  var _p = null;
  function load() {
    if (_p) return _p;
    diag.endpoint = API_BASE + '/api/airtable-proxy';
    _p = fetchProxy(diag.endpoint).then(function (json) {
      var data = normalizePayload(json);
      diag.source = 'airtable-proxy';
      return { source: diag.source, data: data };
    }).catch(function (e) {
      console.warn('[Gudong] 线上 API 加载失败，回退到本地快照：', e);
      diag.errors.push('proxy：' + e.message);
      diag.skipped = 0;
      return fetchJson(ROOT + 'data/listings.json', 5000, 'snapshot').then(function (json) {
        var data = normalizePayload(json);
        diag.source = 'local-snapshot';
        return { source: diag.source, data: data };
      }).catch(function (e2) {
        diag.errors.push('snapshot：' + e2.message);
        diag.source = 'none';
        throw e2;
      });
    }).then(function (r) { console.info('[Gudong] 数据来源:', r.source, diag.counts); renderDebug(); return r; },
            function (e) { console.warn('[Gudong] 没有可用的数据来源：', e); renderDebug(); throw e; });
    return _p;
  }

  /* ---------- 诊断面板 ---------- */
  function renderDebug(extra) {
    if (!DEBUG) return;
    var el = document.getElementById('gdDebug');
    if (!el) { el = document.createElement('div'); el.id = 'gdDebug'; el.className = 'gd-debug'; document.body.appendChild(el); }
    var live = diag.source === 'airtable-proxy';
    var src = live ? '<span class="ok">? Airtable 实时数据（经 /api/airtable-proxy）</span>'
      : diag.source === 'local-snapshot' ? '<span class="warn">? 本地快照 data/listings.json —— 不是 Airtable 实时数据</span>'
      : '<span class="bad">? 没有任何数据来源</span>';
    function st(o) { return o ? esc(o.status) + ' · ' + o.ms + 'ms' : '—'; }
    var c = diag.counts || {};
    el.innerHTML = '<b>GUDONG 数据诊断 · ' + esc(diag.page || location.pathname) + '</b>\n' +
      '数据来源：' + src + '\n接口：' + esc(diag.endpoint) + '\n' +
      '接口响应：' + st(diag.proxy) + '　快照响应：' + st(diag.snapshot) + '\n' +
      '响应字段：' + esc(diag.payloadKeys.join(', ') || '—') + '\n' +
      '今日发现 ' + (c.todayFinds != null ? c.todayFinds : '—') +
      ' · 精选展示 ' + (c.editorPicks != null ? c.editorPicks : '—') +
      ' · 最新藏品 ' + (c.newListing != null ? c.newListing : '—') +
      ' · 情报 ' + (c.intel != null ? c.intel : '—') +
      (diag.skipped ? ' · <span class="warn">已跳过空行/缺标题的行 ' + diag.skipped + '</span>' : '') + '\n' +
      (extra ? esc(extra) + '\n' : '') +
      '首条记录字段：' + esc(diag.sampleKeys.join(', ') || '—') +
      (diag.errors.length ? '\n<span class="bad">错误：\n' + diag.errors.map(esc).join('\n') + '</span>' : '');
  }

  /* ---------- 通用占位 / 提示 ---------- */
  function skeleton(el, n, style) {
    if (!el) return;
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = new Array(n + 1).join('<div class="gd-skel" style="' + style + '"></div>');
  }
  function emptyHtml(zh, en) { return '<div class="gd-empty"><span class="zh">' + zh + '</span><span class="en">' + en + '</span></div>'; }
  function errorHtml() {
    return '<div class="gd-error"><span class="zh"><strong>藏品加载失败</strong><br>请刷新页面重试。如持续出现，请稍后再访问。</span>' +
           '<span class="en"><strong>Failed to load listings</strong><br>Please refresh the page. If the issue persists, try again later.</span></div>';
  }

  /* ---------- 品类页 / 藏品库页：通用渲染 ---------- */
  function mountCategory(o) {
    injectCss();
    var listEl = document.querySelector(o.list);
    if (!listEl) return;
    /* ?? 2026-09-25：直接判断 o.cat，避免 catKey('all') 被归入 misc */
    var key = (o.cat === 'all') ? 'all' : catKey(o.cat);
    diag.page = o.page || ('categories/' + key);
    var keep = [].slice.call(listEl.querySelectorAll('#noResult,#noResultEn'));
    var tag = o.style === 'tag';

    skeleton(listEl, 4, tag ? 'aspect-ratio:1/1' : 'height:260px');

    function cardHtml(f) {
      var kw = [f.title_zh, f.title_en, f.era_zh, f.era_en, f.category].filter(Boolean).join(' ');
      var attrs = ' data-cat="' + esc(f.category) + '" data-keywords="' + esc(kw) + '"';
      var img = '<img src="' + esc(imgUrl(f)) + '" alt="' + esc(f.title_zh) + '" loading="lazy" onerror="' + IMG_FALLBACK + '">';
      if (tag) {
        var p = resolvePrice(f);
        return '<a href="' + itemHref(f) + '" class="item-card"' + attrs + '>' + img +
          '<div class="price-tag zh">' + esc(p.zh) + '</div><div class="price-tag en">' + esc(p.en) + '</div></a>';
      }
      var metaZh = [f.era_zh, f.category].filter(Boolean).join(' · '), metaEn = [f.era_en, f.category].filter(Boolean).join(' · ');
      return '<a href="' + itemHref(f) + '" class="item-card"' + attrs + '>' +
        '<div class="item-image">' + img + '</div><div class="item-body">' +
        '<div class="item-title zh">' + esc(f.title_zh) + '</div><div class="item-title en">' + esc(f.title_en) + '</div>' +
        '<div class="item-meta zh">' + esc(metaZh) + '</div><div class="item-meta en">' + esc(metaEn) + '</div>' +
        priceBlock(f) +
        '<div class="item-cta zh">查看详情 →</div><div class="item-cta en">View Details →</div></div></a>';
    }

    load().then(function (r) {
      var all = dedupe([].concat(r.data.newListing, r.data.todayFinds, r.data.editorPicks));
      var items = key === 'all' ? all : all.filter(function (f) { return catKey(f.category) === key; });
      listEl.removeAttribute('aria-busy');
      listEl.innerHTML = items.length ? items.map(cardHtml).join('')
        : emptyHtml('该品类暂无藏品，欢迎卖家入驻发布', 'No listings in this category yet — sellers are welcome to list');
      keep.forEach(function (n) { listEl.appendChild(n); });
      renderDebug('本页品类「' + o.cat + '」：藏品 ' + items.length + ' · 全站藏品 ' + all.length);
      try { document.dispatchEvent(new CustomEvent('gd:rendered', { detail: { count: items.length } })); } catch (e) {}
    }).catch(function () {
      listEl.removeAttribute('aria-busy'); listEl.innerHTML = errorHtml();
      keep.forEach(function (n) { listEl.appendChild(n); });
    });
  }

  /* ---------- 情报通用渲染 ---------- */
  function renderIntel(container, list) {
    if (!container) return;
    var items = list && list.length ? list : [];
    if (!items.length) { container.innerHTML = ''; return; }
    var TYPE = {
      new:       { zh: '新上架',   en: 'NEW',        cls: 'intel-type--new' },
      drop:      { zh: '降价',     en: 'PRICE DROP', cls: 'intel-type--drop' },
      compare:   { zh: '同类对比', en: 'COMPARE',    cls: 'intel-type--compare' },
      collector: { zh: '藏家动态', en: 'COLLECTOR',  cls: 'intel-type--collector' },
      platform:  { zh: '平台快讯', en: 'PLATFORM',   cls: 'intel-type--platform' }
    };
    container.innerHTML = items.map(function (it) {
      var t = TYPE[it.type] || TYPE.platform;
      return '<div class="intel-card">' +
        '<span class="intel-type ' + t.cls + '"><span class="zh">' + t.zh + '</span><span class="en">' + t.en + '</span></span>' +
        '<div class="intel-text zh">' + esc(it.zh) + '</div>' +
        '<div class="intel-text en">' + esc(it.en) + '</div>' +
        '<div class="intel-meta"><span class="zh">' + esc(it.meta) + '</span><span class="en">' + esc(it.metaEn) + '</span></div>' +
        '</div>';
    }).join('');
  }

  global.GudongData = {
    ROOT: ROOT, API_BASE: API_BASE, DEBUG: DEBUG, diag: diag,
    load: load, dedupe: dedupe, sellerMap: sellerMap, catKey: catKey, esc: esc, normId: normId,
    resolvePrice: resolvePrice, priceBlock: priceBlock,
    imgUrl: imgUrl, imgOnError: IMG_FALLBACK, itemHref: itemHref,
    skeleton: skeleton, emptyHtml: emptyHtml, errorHtml: errorHtml, injectCss: injectCss, renderDebug: renderDebug,
    mountCategory: mountCategory, renderIntel: renderIntel
  };
})(window);