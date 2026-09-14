const CACHE_NAME = 'antique-collection-v1';
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

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // 更新缓存
        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(req, resClone);
        });
        return networkRes;
      })
      .catch(() => {
        // 网络出错，读取缓存
        return caches.match(req);
      })
  );
});
