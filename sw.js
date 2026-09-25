const CACHE_NAME = 'antique-collection-v4';   // 2026-09-26：v3 → v4，上线前全站导航/链接批量更新后提升版本号，激活时清掉旧缓存
// 需要预缓存的静态资源
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// 安装：预缓存核心静态文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：网络优先，失败回退缓存（适合动态网站）
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 跳过非http请求、Supabase接口、Stripe支付接口，不缓存
  if (!req.url.startsWith('http')
      || req.url.includes('supabase')
      || req.url.includes('stripe')) {
    return;
  }

  // 2026-09-19：只处理 GET（cache.put 不支持 POST 等，会抛未捕获异常）
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // 2026-09-19：只缓存成功响应。否则一次 403/502 会被存下来，断网时被当成"缓存数据"返回
        if (networkRes.ok) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        }
        return networkRes;
      })
      .catch(() => {
        // 网络出错，读取缓存；缓存也没有时返回 503，而不是 respondWith(undefined) 抛异常
        return caches.match(req).then(hit => hit || new Response('', { status: 503, statusText: 'Offline' }));
      })
  );
});