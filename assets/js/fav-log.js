/* assets/js/fav-log.js
 * 藏品「收藏」匿名计数（2026-11-09）
 * 收藏本身仍只在浏览器 localStorage 里（gudong_fav），这里只额外发一个匿名信号，
 * 让藏家能看到「近 30 天 N 人收藏」这类汇总数字 —— 不携带姓名、邮箱、号码。
 * 与 item 页内联收藏脚本并存：内联脚本先改 localStorage，这里在其后比对前后状态。
 */
(function () {
    'use strict';

    var FAV_KEY = 'gudong_fav';
    var ANON_KEY = 'gudong_anon';
    var ENDPOINT = '/api/save';

    function readFav() {
        try {
            var arr = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
            return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string' && x; }) : [];
        } catch (e) { return []; }
    }

    function anonId() {
        try {
            var saved = localStorage.getItem(ANON_KEY);
            if (saved && /^[a-z0-9]{8,64}$/i.test(saved)) return saved;
            var bytes = new Uint8Array(16);
            if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
            else for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
            var id = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
            localStorage.setItem(ANON_KEY, id);
            return id;
        } catch (e) { return ''; }
    }

    function itemId() {
        var raw = (document.body && document.body.dataset && document.body.dataset.itemId) || '';
        if (raw) return String(raw).trim();
        try {
            var name = decodeURIComponent(location.pathname.split('/').pop() || '');
            return name.replace(/\.html?$/i, '');
        } catch (e) { return ''; }
    }

    function sellerId() {
        var el = document.getElementById('sellerId');
        return el ? String(el.textContent || '').trim() : '';
    }

    function ping(saving) {
        var id = itemId();
        var anon = anonId();
        if (!id || !anon) return;
        var payload = JSON.stringify({ item_id: id, seller: sellerId(), anon: anon, action: saving ? 'save' : 'unsave' });
        try {
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
                cache: 'no-store'
            }).catch(function () {});
        } catch (e) { /* 计数失败不影响收藏本身 */ }
    }

    var before = readFav();

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || !target.closest || !target.closest('#favBtn')) return;
        window.setTimeout(function () {
            var after = readFav();
            var id = itemId();
            var was = before.indexOf(id) !== -1;
            var is = after.indexOf(id) !== -1;
            if (was === is) return;
            before = after;
            ping(is);
        }, 0);
    }, true);
})();
