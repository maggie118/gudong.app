/* 古董圈 Gudong · Service Worker
 * 2026-11-04：v57 → v58（自查工具页 SEO 元描述更新）
 * - 修正题量区间为 9–13，补入目视倾向与顾问预约信息
 * 2026-11-04：v56 → v57（估值、底款工具页 SEO 元描述更新）
 * - 精简 description 长度，补入「可预约顾问视频参考意见」入口信息
 * 2026-11-04：v55 → v56（估值、底款工具加入「寻求顾问意见」）
 * - tools/valuation.html、tools/mark-lookup.html 末尾新增顾问 CTA 与预约弹窗，
 *   自动带入估值输入/参考区间、所查年号与标准款识；
 * - 提升缓存版本，强制已安装 PWA 拉取更新的工具页
 * 2026-11-04：v54 → v55（自查结果页「联系我们」改为「寻求顾问意见」弹窗）
 * - 结果页末按钮改为打开顾问预约弹窗（与藏品页「📞预约顾问连线（参考意见）」同款流程：
 *   时段/问题/WhatsApp、S$188 服务费说明、跳转 WhatsApp 获取 PayNow），
 *   并自动带入自查品类、风险结论与目视倾向；
 * - 提升缓存版本，强制已安装 PWA 拉取新的工具页
 * 2026-11-03：v53 → v54（自查工具加入目视倾向与瓷器时代对标）
 * 2026-11-03：v52 → v53（自查工具结果升级：矛盾组合、核验顺序、参考数据、合同条款）
 * 2026-11-03：v51 → v52（新增仿品与断代自查工具）
 * - 新增 tools/authenticity-check.html：瓷器/玉器/铜器佛像/钱币银元四类自查向导；
 * - 全站 117 页侧栏加入该工具链接；工具合集页新增卡片；
 * - 提升缓存版本，强制已安装 PWA 拉取新的页面与导航
 * 2026-11-02：v50 → v51（Web Push 新藏品上架通知）
 * - 新增 push 事件：收到服务器推送即展示"上新"通知（title/body/icon/跳转 URL 由 payload 指定）；
 * - 新增 notificationclick 事件：点击通知跳转到新藏品页；
 * - 提升缓存版本，强制已安装 PWA 拉取新的 sw.js 与页面
 * 2026-11-01：v49 → v50（新增社区引导员智能客服）
 * - 全站注入智能客服机器人（资讯检索/发布向导/合规拦截/双语菜单），
 *   新增聊天组件预缓存：gudong-chatbot.css/js + chat-index.json
 * 2026-11-01：v48 → v49（上线前全站优化）
 * - 全站 118 个页面统一优化：布局/排版、中英语术口语化、字体字号；
 * - SEO 深度优化：70 篇 insights 修复截断 title/description、补 Article JSON-LD；
 *   17 单品页修复 canonical/JSON-LD/data-item-id 错指 bug、og:type 修正、Product schema 补全；
 *   分类/卖家页补 CollectionPage/Organization 结构化数据；新增 404.html 与 Lim-CK 卖家页；
 * - 提升缓存版本，强制已安装 PWA 拉取全新页面与元数据
 * 2026-10-23：v41 → v42
 * - 修复 iOS PWA 安装引导：index.html 安装按钮触控目标提升至 44×44px；
 *   新增已安装 PWA 状态检测（自动隐藏安装按钮）、iOS 应用内浏览器检测与 Safari 跳转提示、
 *   更准确的 iOS 分享图标与安装步骤文案
 * 2026-10-22：v40 → v41
 * - 首屏 hero 文案改版：主标题「传世重器，静候知音」、副标题「高古遗珍 · 名窑佳器 · 私人藏家网络」、
 *   信任行去除 emoji 改为「免注册 · 不留存 · 端到端私密直连」，正文段落重写
 * - 全站术语统一：左侧导航「藏家展馆 / Collector Gallery」→「私家藏馆 / Private Gallery」
 *   （含 826 处侧栏、pricing/sellers 列表页 SEO 元标签、4 个藏家主页）
 * - 术语统一：「私家博物馆」→「私家藏馆」（藏家页 title、分享文案、面包屑）
 * - 提升缓存版本号，强制预缓存 index.html 刷新，离线用户也能拿到新首屏
 * 2026-10-15：v27 → v28
 * - 修复致命 bug：文件内 58 处 U+2011（非断行连字符）混入路径字符串，
 *   导致预缓存清单中 21 个 URL（14 藏品页 + item-chat/seller-inbox.js + 4 图标）
 *   404 被静默跳过；seller-reply/seller-inbox 的禁缓存判断也永不命中；
 *   全部替换为 ASCII 连字符，并提升缓存版本强制刷新
 * - 预缓存新增 /assets/js/gudong-data.js（核心数据层，配合 2026-10-14 相对路径改造）
 * 2026-10-10：v26 → v27
 * - 版本升级v26：刷新缓存，同步更新manifest.json、首页HTML SEO/OG/Schema元标签；
 * - HTML导航保持network-first网络优先，保证搜索引擎获取最新meta与社交分享元数据；
 * - 保留收件箱、签名回复页面禁止缓存逻辑不变；保留预缓存容错逻辑不变。
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
 * 2026-11-06：v58 → v59（移除全站智能客服组件）
 * - 删除 gudong-chatbot（小顾·社区引导员/AI 智能客服）：120 个页面移除 CSS/容器/脚本注入；
 * - 预缓存清单移除 gudong-chatbot.css/js 与 chat-index.json，并删除对应文件；
 * - 提升缓存版本，强制已安装 PWA 刷新页面
 * 2026-11-08：v59 → v60
 * - 新增 tools/checklist.html（古董验货清单，可打印 A4），加入预缓存清单；
 * - 首页撤除买家工具区块、item.html 底部新增买家工具条、pricing 买家工具行改指向清单；
 * - 提升缓存版本，强制已安装 PWA 刷新页面
 */
const CACHE_NAME = 'antique-collection-v60';
// 预缓存清单：核心页面 + 常用图标 + 占位图 + 工具页（离线可用）
// 注意：改用逐个 cache.add，单个 404 不会导致整个 install 失败
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/item.html',
  '/collection.html',
  '/pricing.html',
  '/assets/js/item-chat.js',
  '/assets/js/seller-inbox.js',
  '/assets/js/gudong-data.js',
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
  '/items/item-limck-01.html',
  '/items/item-limck-02.html',
  '/tools/index.html',
  '/tools/era-lookup.html',
  '/tools/ganzhi.html',
  '/tools/year-since.html',
  '/tools/mark-lookup.html',
  '/tools/valuation.html',
  '/tools/checklist.html',
  '/tools/contract.html',
  '/tools/authenticity-check.html',
  '/manifest.json',
  '/assets/icons/favicon-32x32.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/logo-mark.png',
  '/assets/images/placeholder.jpg',
  '/assets/js/push-subscribe.js'
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
// ---- push：新藏品上架通知 ----
self.addEventListener('push', (event) => {
  let payload = {
    title: 'gudong.app 上新',
    body: '有新的古董藏品发布',
    url: '/',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/favicon-32x32.png',
  };
  try {
    const data = event.data ? event.data.json() : null;
    if (data) {
      if (data.title) payload.title = data.title;
      if (data.body) payload.body = data.body;
      if (data.url) payload.url = data.url;
      if (data.icon) payload.icon = data.icon;
      if (data.badge) payload.badge = data.badge;
    }
  } catch (e) { /* 非 JSON payload：使用默认文案 */ }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    data: { url: payload.url },
    tag: 'gudong-new-item',
  }));
});
// ---- notificationclick：点击通知跳转到新藏品页 ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const url = new URL(target, self.location.origin).href;
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.startsWith(self.location.origin)) {
        if ('focus' in client) client.focus();
        if ('navigate' in client) { try { await client.navigate(url); return; } catch (e) {} }
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
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
