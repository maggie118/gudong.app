/* 古董圈 Gudong · Service Worker
 * 2026-10-10：v21 → v22
 * 2026-10-10：v22 → v23
 * 2026-10-10：v23 → v24
 * 2026-10-10：v24 → v25
 * - 新增藏家站内收件箱脚本；卖家收件箱页面走网络直连，不缓存带访问凭证的内容
 * - 为签名卖家回复链接页面启用网络直连，避免缓存带 Token 的 URL
 * - 新增匿名站内聊天资源与藏品页离线预缓存
 * - 更新 PWA 缓存版本，并预缓存最新定价页 pricing.html
 * - 切换版本时清理旧缓存，确保用户安装/重访后取得最新页面

 * 2026-10-7：v16 → v17
 * - 全站 90 个 HTML 页面注入分享功能（header 分享按钮 + Web Share API/剪贴板降级 + Toast 反馈）；
 *   覆盖 terms/privacy/pricing/collection/about/insights hub/items×14/categories×6/insights×62/templates
 * 2026-10-6：v15 → v16
 * - 为 24 篇杂志风格 insights 文章补回面包屑导航（首页/情报·知识/系列分类）；
 *   提升缓存版本号确保客户端拉取最新页面
 * 2026-10-6：v14 → v15
 * - collection.html 品牌区 GUDONG.APP 字号对齐 about.html（.68rem→.75rem，
 *   移除移动端 .52rem 覆盖）；提升缓存版本号确保客户端拉取最新页面
 * 2026-10-6：v13 → v14
 * - index.html 品牌区 GUDONG.APP 字号对齐 about.html（.68rem→.75rem，
 *   移除移动端 .52rem 覆盖）；提升缓存版本号确保客户端拉取最新页面
 * 2026-10-6：v12 → v13
 * - 提升缓存版本号，确保已安装 PWA 的用户拉取最新资源
 * 2026-10-5：v11 → v12
 * - 修复手机端 header 品牌行 GUDONG.APP 被 CSS 隐藏的问题（index/collection）；
   提升缓存版本号，确保已安装 PWA 的用户拿到新页面
 * - 预缓存新增 collection.html 与 logo-mark.png
 * v10 → v11
 * - 移动端适配收尾：搜索按钮/hot-tag/sidebar-lang-btn 44px、
 *   item 页 image-nav/fav-btn 44px、contact-btn 加高、
 *   btn-publish 全站 min-height:44px、article-cta 44px、
 *   series-chip/app-install-btn/gd-install-close 44px、
 *   剩余 .6x/.7x 小字号统一提升至 ≥12px
 * 2026-10-4：v9 → v10
 * - 移动端适配：header 触控目标提升至 44px、announce-close 44px、
 *   item 主图 object-fit 改 contain 不裁切、全站小字号提升至 ≥12px、
 *   seller 徽章/标签字号提升
 * - v8 → v9：配合首页改版提升缓存版本号
 */

const CACHE_NAME = 'antique-collection-v25';

// 预缓存清单：核心页面 + 常用图标 + 占位图
// 注意：改用逐个 cache.add，单个 404 不会导致整个 install 失败
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/collection.html',
  '/pricing.html',
  '/assets/js/item-chat.js',
  '/assets/js/seller-inbox.js',
  '/items/item-lim-01.html',
  '/items/item-lim-02.html',
  '/items/item-lim-03.html',
  '/items/item-lim-04.html',
  '/items/item-ng-01.html',
  '/items/item-ng-02.html',
  '/items/item-ng-03.html',
  '/items/item-ngcy-01.html',
  '/items/item-ngcy-02.html',
  '/items/item-ngcy-03.html',
  '/items/item-ngcy-04.html',
  '/items/item-ngcy-05.html',
  '/items/item-yak-01.html',
  '/items/item-yak-02.html',
  '/items/item-yak-03.html',
  '/manifest.json',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/logo-mark.png',
  '/assets/images/placeholder.jpg'
];

// ---- install：预缓存核心资源（逐个 add，容错） ----
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_ASSETS.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        console.warn('[SW] precache skip:', url, e && e.message);
      }
    }));
    await self.skipWaiting();
  })());
});

// ---- activate：清理旧版本缓存 ----
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// ---- fetch：按请求类型分类处理 ----
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) 只处理 GET
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // 2) 只处理 http(s)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 3) 跨域请求：直接放行，不缓存
  //    （避免 opaque 响应污染缓存；Airtable 附件图走 CDN 时也走这条）
  if (url.origin !== self.location.origin) return;

  // 4) 动态 API：网络优先，不缓存（数据实时性优先）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'application/json' }
        }
      ))
    );
    return;
  }

  // Reply links carry a bearer token in the query string; never store those URLs in Cache Storage.
  if (url.pathname === '/seller-reply.html') {
    event.respondWith(fetch(req).catch(() => new Response('Online connection required', { status: 503, statusText: 'Offline' })));
    return;
  }
  if (url.pathname === '/seller-inbox.html') {
    event.respondWith(fetch(req).catch(() => new Response('Online connection required', { status: 503, statusText: 'Offline' })));
    return;
  }
  // 5) HTML 导航请求：网络优先 → 缓存页面 → 首页兜底
  const isNavigate =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigate) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const home =
          (await caches.match('/index.html')) ||
          (await caches.match('/'));
        if (home) return home;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 6) 其他同源静态资源：网络优先，成功即缓存
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type !== 'opaque') {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
      }
      return res;
    } catch (e) {
      const hit = await caches.match(req);
      return hit || new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});


