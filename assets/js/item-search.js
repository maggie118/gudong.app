/* ==========================================================================
 * item-search.js — 分类页（categories/*.html）通用藏品搜索
 * --------------------------------------------------------------------------
 * 2026-09-14 新增。此前 categories 下的搜索框存在两种问题：
 *   1) jade / misc / paintings：搜索框只做 scrollIntoView 滚动定位，
 *      输入关键词完全不生效 —— 用户感知为「搜索框不工作」；
 *   2) coins / porcelain：有过滤逻辑，但回车键无效、且缺少结果反馈。
 * 本文件统一实现：关键词过滤 + 回车触发 + 输入即时过滤 + 结果数量反馈
 * + 无结果空态 + 异步加载（Airtable）后自动重新应用关键词。
 *
 * 依赖的 DOM（缺任一元素时自动降级，不报错）：
 *   #catSearch / #catSearchEn   搜索输入框（按 body[data-lang] 择一）
 *   #itemList 或 #items         藏品列表容器，卡片为 .item-card
 *   #searchResultTip            结果数量提示（内部 .zh / .en 两个 span）
 *   #noResult / #noResultEn     空态提示
 * 卡片可搜索文本优先级：data-keywords → <img alt> → 卡片文本
 * ========================================================================== */
(function () {
    'use strict';

    function lang() {
        return document.body && document.body.dataset.lang === 'en' ? 'en' : 'zh';
    }
    function byId(id) { return document.getElementById(id); }

    // 当前语言下可见的搜索框
    function searchBox() {
        var zh = byId('catSearch'), en = byId('catSearchEn');
        return lang() === 'en' ? (en || zh) : (zh || en);
    }
    // 列表容器：兼容两种 id
    function container() {
        return byId('itemList') || byId('items');
    }
    function keyword() {
        var box = searchBox();
        return box ? box.value.trim().toLowerCase() : '';
    }

    // 卡片的可搜索文本。用 textContent 而非 innerText：
    // innerText 对 display:none 的元素返回空串，会让二次搜索失效。
    function haystack(card) {
        var img = card.querySelector('img');
        var alt = img ? (img.alt || '') : '';
        return ((card.dataset.keywords || '') + ' ' + alt + ' ' + card.textContent).toLowerCase();
    }

    /* 按关键词过滤列表，返回命中数量 */
    function filterItems() {
        var list = container();
        if (!list) return 0;
        var kw = keyword();
        var visible = 0;

        list.querySelectorAll('.item-card').forEach(function (card) {
            var ok = !kw || haystack(card).indexOf(kw) !== -1;
            card.style.display = ok ? '' : 'none';
            if (ok) visible++;
        });

        // 结果数量反馈
        var tip = byId('searchResultTip');
        if (tip) {
            if (!kw) {
                tip.style.display = 'none';
            } else {
                var zh = tip.querySelector('.zh'), en = tip.querySelector('.en');
                if (zh) zh.textContent = visible > 0
                    ? '找到 ' + visible + ' 件藏品'
                    : '未找到匹配藏品，换个关键词试试';
                if (en) en.textContent = visible > 0
                    ? visible + ' item' + (visible > 1 ? 's' : '') + ' found'
                    : 'No match. Try another keyword.';
                tip.style.display = 'block';
            }
        }

        // 空态提示
        var noneEl = lang() === 'en'
            ? (byId('noResultEn') || byId('noResult'))
            : (byId('noResult') || byId('noResultEn'));
        if (noneEl) noneEl.style.display = (kw && visible === 0) ? 'block' : 'none';

        return visible;
    }

    /* 回车 / 点击放大镜：过滤后滚动到结果处；无结果则滚到提示处 */
    function doSearch() {
        var visible = filterItems();
        var list = container();
        if (visible === 0) {
            var tip = byId('searchResultTip');
            if (tip) { tip.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        }
        if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 供页面内联 onclick / onkeydown 调用
    window.filterItems = filterItems;
    window.doSearch = doSearch;

    document.addEventListener('DOMContentLoaded', function () {
        ['catSearch', 'catSearchEn'].forEach(function (id) {
            var el = byId(id);
            if (!el) return;
            el.addEventListener('input', function () {          // 边输入边过滤
                // 2026-09-19：中英文两个搜索框同步关键词，切换语言后不会丢失已输入的内容
                var other = byId(id === 'catSearch' ? 'catSearchEn' : 'catSearch');
                if (other && other.value !== el.value) other.value = el.value;
                filterItems();
            });
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
                if (e.key === 'Escape') {
                    ['catSearch', 'catSearchEn'].forEach(function (i) { var x = byId(i); if (x) x.value = ''; });
                    filterItems();
                }
            });
        });

        // 藏品列表由 Airtable 异步渲染（会把 innerHTML 整个替换掉），
        // 内容变化后若搜索框有关键词，自动重新应用过滤。
        // 2026-09-19：加 subtree —— jade / paintings 的卡片渲染在 #items 内层的 .goods-list 里，
        // 只监听 #items 的直接子节点时，「先输入关键词、数据后到」的场景不会重新过滤。
        // （filterItems 只改 style / 提示文字，不增删列表内节点，不会触发死循环。）
        var list = container();
        if (list && window.MutationObserver) {
            new MutationObserver(function () {
                if (keyword()) filterItems();
            }).observe(list, { childList: true, subtree: true });
        }
    });
})();