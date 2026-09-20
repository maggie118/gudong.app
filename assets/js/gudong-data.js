/*! gudong-data.js — 站点公共数据层（2026-09-19）
 *
 * 作用：所有子页面共用一套「读取 Airtable → 清洗 → 渲染」逻辑，避免每页各抄一份。
 * 引用方式（放在页面内联脚本之前）：
 *     <script src="../assets/js/gudong-data.js" data-root="../"></script>   ← 位于子目录
 *     <script src="assets/js/gudong-data.js"></script>                       ← 位于根目录
 * data-root = 从当前页面回到站点根目录的相对路径（根目录页面留空）。
 *
 * 数据链路：/api/airtable-proxy（Airtable 实时数据）→ 失败则读 data/listings.json 快照 → 再失败则页面保留原静态内容。
 * 诊断：任何页面加 ?debug=1，左下角显示数据来自 Airtable 还是快照。
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
  function catKey(c) { return CAT_ALIASES[String(c == null ? '' : c).trim().toLowerCase()] || 'misc'; }

  /* ---------- 公共样式（骨架屏 / 空状态 / 诊断面板），只注入一次 ---------- */
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
    if (typeof v === 'string') return /^(true|yes|y|1|是|✓|✔)$/i.test(v.trim());
    return !!v;
  }
  function normalizeRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    var src = (rec.fields && typeof rec.fields === 'object') ? rec.fields : rec;   // 兼容 Airtable 原始结构
    var out = {};
    Object.keys(src).forEach(function (k) {
      var v = src[k];
      if (Array.isArray(v)) {                                                     // Lookup 字段返回数组
        if (!v.length) v = null;
        else if (v.every(function (x) { return x === null || typeof x !== 'object'; })) v = v[0];
      }
      var key = normKey(k);
      out[key] = /^is_/.test(key) ? asBool(v) : v;
    });
    [['title_zh', 'title_en'], ['era_zh', 'era_en']].forEach(function (p) {       // 中英文互相兜底
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
        /* 代理在 item_id 为空时会回退成 Airtable 记录 ID，所以空行也带 item_id；必须再要求有标题 */
        if (f && normId(f.item_id) && (f.title_zh || f.title_en)) { kept++; return true; }
        diag.skipped++;
        return false;
      });
    }
    var out = { todayFinds: clean(groups.todayFinds), editorPicks: clean(groups.editorPicks), newListing: clean(groups.newListing) };
    if (total > 0 && kept === 0) throw new Error('所有记录都缺少 item_id 或标题，请检查 Airtable 字段名');
    // 卖家展馆名（来自 Airtable 的 sellers 表；未配置时为空数组，页面回退到 HTML 里写的展馆名）
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
    diag.counts = { todayFinds: out.todayFinds.length, editorPicks: out.editorPicks.length, newListing: out.newListing.length };
    return out;
  }
  function sellerMap(data) {                    // { seller_id: {display_zh, display_en, since_year, ...} }
    var m = {};
    ((data && data.sellers) || []).forEach(function (sl) { m[sl.seller_id] = sl; });
    return m;
  }
  function dedupe(list) {                       // 按 item_id 去重，保留首次出现顺序
    var seen = {};
    return list.filter(function (f) {
      var k = normId(f.item_id);
      if (seen[k]) return false;
      return (seen[k] = true);
    });
  }

  /* ---------- 价格：一口价 / 价格区间 / 私聊询价 ---------- */
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
  function priceSpans(f) {
    var p = resolvePrice(f);
    return '<span class="zh">' + esc(p.zh) + '</span><span class="en">' + esc(p.en) + '</span>';
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
  function fetchProxy(url) {                    // 仅超时 / 5xx 重试一次；4xx 与 CORS 错误不重试
    return fetchJson(url, 8000, 'proxy').catch(function (e) {
      if (!/超时|HTTP 5\d\d/.test(e.message)) throw e;
      diag.errors.push('proxy 第 1 次失败：' + e.message + '，重试中');
      return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return fetchJson(url, 8000, 'proxy'); });
    });
  }

  var _p = null;
  function load() {                             // 同一页面只请求一次，多个使用方共享
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
    var src = live ? '<span class="ok">✔ Airtable 实时数据（经 /api/airtable-proxy）</span>'
      : diag.source === 'local-snapshot' ? '<span class="warn">⚠ 本地快照 data/listings.json —— 不是 Airtable 实时数据</span>'
      : '<span class="bad">✖ 没有任何数据来源</span>';
    function st(o) { return o ? esc(o.status) + ' · ' + o.ms + 'ms' : '—'; }
    var c = diag.counts || {};
    el.innerHTML = '<b>GUDONG 数据诊断 · ' + esc(diag.page || location.pathname) + '</b>\n' +
      '数据来源：' + src + '\n接口：' + esc(diag.endpoint) + '\n' +
      '接口响应：' + st(diag.proxy) + '　快照响应：' + st(diag.snapshot) + '\n' +
      '响应字段：' + esc(diag.payloadKeys.join(', ') || '—') + '\n' +
      '今日发现 ' + (c.todayFinds != null ? c.todayFinds : '—') + ' · 精选展示 ' + (c.editorPicks != null ? c.editorPicks : '—') + ' · 最新藏品 ' + (c.newListing != null ? c.newListing : '—') +
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

  /* ---------- 品类页：porcelain / jade / coins / misc / paintings ----------
     mountCategory({ cat:'瓷器', list:'#itemList', style:'card', picks:'#picks' })
       list  ：列表容器选择器（card 风格 = #itemList；tag 风格 = '#items .goods-list'）
       style ：'card' 图文卡片（标题/年代/价格/查看详情）；'tag' 全图卡片 + 右下价格标签
       picks ：可选，「编辑精选」区块选择器（区块内需有 .picks-grid）
     行为：接口成功 → 用 Airtable 数据替换静态演示内容（该品类没有藏品时显示空状态，精选区隐藏）；
           全部失败 → 恢复页面原有静态内容。 */
  function mountCategory(o) {
    injectCss();
    var listEl = document.querySelector(o.list);
    if (!listEl) return;
    diag.page = 'categories/' + catKey(o.cat);
    var picksSec = o.picks ? document.querySelector(o.picks) : null;
    var picksGrid = picksSec ? picksSec.querySelector('.picks-grid') : null;
    var origList = listEl.innerHTML, origPicks = picksGrid ? picksGrid.innerHTML : '';
    var keep = [].slice.call(listEl.querySelectorAll('#noResult,#noResultEn'));   // 搜索「无结果」提示节点，渲染后放回去
    var tag = o.style === 'tag';

    skeleton(listEl, 4, tag ? 'aspect-ratio:1/1' : 'height:260px');
    if (picksGrid) skeleton(picksGrid, 2, 'height:220px');

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
    function pickHtml(f) {
      var metaZh = [f.era_zh, f.category].filter(Boolean).join(' · '), metaEn = [f.era_en, f.category].filter(Boolean).join(' · ');
      return '<a href="' + itemHref(f) + '" class="pick-card"><div class="pick-image">' +
        '<img src="' + esc(imgUrl(f)) + '" alt="' + esc(f.title_zh) + '" loading="lazy" onerror="' + IMG_FALLBACK + '">' +
        '<span class="pick-badge zh">编辑精选</span><span class="pick-badge en">Editor\'s Pick</span></div>' +
        '<div class="pick-body"><div class="pick-title zh">' + esc(f.title_zh) + '</div><div class="pick-title en">' + esc(f.title_en) + '</div>' +
        '<div class="pick-meta"><span class="zh">' + esc(metaZh) + '</span><span class="en">' + esc(metaEn) + '</span></div>' +
        priceBlock(f) +
        '<span class="pick-cta zh">查看详情 →</span><span class="pick-cta en">View Details →</span></div></a>';
    }

    load().then(function (r) {
      var key = catKey(o.cat);
      var items = dedupe([].concat(r.data.newListing, r.data.todayFinds, r.data.editorPicks)).filter(function (f) { return catKey(f.category) === key; });
      var picks = dedupe(r.data.editorPicks).filter(function (f) { return catKey(f.category) === key; });
      listEl.removeAttribute('aria-busy');
      listEl.innerHTML = items.length ? items.map(cardHtml).join('')
        : emptyHtml('该品类暂无藏品，欢迎卖家入驻发布', 'No listings in this category yet — sellers are welcome to list');
      keep.forEach(function (n) { listEl.appendChild(n); });
      if (picksSec && picksGrid) {
        picksGrid.removeAttribute('aria-busy');
        picksGrid.innerHTML = picks.map(pickHtml).join('');
        picksSec.hidden = !picks.length;
      }
      renderDebug('本页品类「' + o.cat + '」：藏品 ' + items.length + ' · 编辑精选 ' + picks.length);
    }).catch(function () {                      // 接口与快照都不可用：恢复原静态内容
      listEl.removeAttribute('aria-busy'); listEl.innerHTML = origList;
      if (picksGrid) { picksGrid.removeAttribute('aria-busy'); picksGrid.innerHTML = origPicks; }
    });
  }

  global.GudongData = {
    ROOT: ROOT, API_BASE: API_BASE, DEBUG: DEBUG, diag: diag,
    load: load, dedupe: dedupe, sellerMap: sellerMap, catKey: catKey, esc: esc, normId: normId,
    resolvePrice: resolvePrice, priceSpans: priceSpans, priceBlock: priceBlock,
    imgUrl: imgUrl, imgOnError: IMG_FALLBACK, itemHref: itemHref,
    skeleton: skeleton, emptyHtml: emptyHtml, errorHtml: errorHtml, injectCss: injectCss, renderDebug: renderDebug,
    mountCategory: mountCategory
  };
})(window);