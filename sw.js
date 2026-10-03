/* 古董圈 Gudong · Service Worker
 * 2026-10-3：v7 → v8
 * - 配合本轮改动（pricing.html 全页中英双语、FAQ 精简、
 *   页脚与全站统一、锚点 id 对齐 seller-services/buyer-services/price-table）提升缓存版本号
 * - 注意：fetch 策略是「网络优先」，本身不会卡住旧内容；
 *         升版主要用于 activate 时清掉 v6 的历史缓存条目
 * - v6 记录：导航链接统一为绝对路径；预缓存改为逐个 add（单个 404 不拖垮 install）；
 *         /api/* 网络优先不缓存；跨域放行；导航离线回退缓存页再回退首页
 */

const CACHE_NAME = 'antique-collection-v8';

// 预缓存清单：核心页面 + 常用图标 + 占位图
// 注意：改用逐个 cache.add，单个 404 不会导致整个 install 失败
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
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