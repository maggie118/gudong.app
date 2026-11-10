# Airtable API 调用预算（免费版 1,000 次/月）

> 2026-11-10 诊断记录。Airtable 免费版（Free）对每个 workspace 的硬上限是 **1,000 次 API 调用/月**，
> 超出后先给 30 天宽限期，之后所有调用被拦到月底重置。这不是"额度用完了"，而是**设计上就不够用**。

## 为什么"穷人版 SSG"救不了

穷人版 SSG（`scripts/refresh-listings.js` 在 Vercel build 时拉 Airtable 覆盖 `data/listings.json`）
只解决**目录刷新**这一次性成本：每次构建 = 2 次调用（`sellers` + 藏品表各 1 次）。
每天 1 次 cron 构建 ≈ 60 次/月，占比很小。

真正吃额度的是**后加的实时功能**：它们每几秒就轮询一次 Airtable，而免费版一个月只给 1,000 次 ≈ **每天 33 次**。

## 2026-11-10 决策：走「砍功能」，锁死免费版

用户拍板砍功能，不升级、不迁 Cloudflare。当日改动：

1. **关掉浏览计数**：`fav-log.js` 不再发 `action:'view'`；`/api/interest` 只统计 `Status='active'`（收藏 / 关注），`views_30d` 固定返回 0，翻页上限 4 → 2。
   - 藏品页从「每次首访 2 次调用」降到 0；只有点击收藏才产生调用。
2. **收件箱去轮询**：`seller-inbox.js` 删掉 45 秒轮询与 5 分钟统计轮询，改为打开页面取一次 + 切回窗口时最多每分钟刷新一次。
3. **私信去轮询**：`item-chat.js` 面板打开时同步一次、切回窗口再同步一次；`seller-reply.js` 同理。发送消息仍是用户主动动作（1 次调用）。
4. **文案同步**：pricing 权益条 / 开馆弹窗 / FAQ、privacy 隐私条款、`docs/ENQUIRY_INBOX.md` 从「浏览 + 收藏」改为只写「收藏 / 关注人数」，不再承诺浏览量。
5. `sw.js` v72 → **v74**（v73 是轮询降速，v74 是本次砍功能）。

砍完的常态成本（估算）：
- 打开一次藏家收件箱：3 次（消息 1 + 询价 1 + 统计 1）
- 买家打开一次私信面板：1～2 次；发一条消息：1 次
- 每次点击收藏 / 取消：1～2 次
- 每次部署构建：2 次；每天一次 cron 构建：约 60 次/月

即 **1,000 次/月 ≈ 每天 33 次**：现在够「每天几十次真实交互」，但日均访客上百、或有人长时间把面板开着，仍会到顶。
纪律：自测完关掉收件箱 / 私信页；每月 1 号在 Airtable Workspace 设置里看一次用量。

## 如果之后流量起来，再考虑的两条路

1. 把计数 + 消息搬到 Cloudflare KV/Worker（免费额度 10 万读 / 1 千写每天），Airtable 只当文本库。
2. 升级 Airtable Team（约 US$20/人/月，100,000 次/月），零代码改动。

## 各个入口的真实成本（2026-11-10 砍功能之前，供对照）

| 入口 | 一次调用消耗 Airtable 次数 | 轮询频率 | 折合每小时 |
|---|---|---|---|
| 藏家收件箱 `/api/seller-inbox` | 1 | 5 秒 | 720 |
| 藏家询价列表 `/api/enquiries` | 1 | 5 秒 | 720 |
| 藏馆统计 `/api/interest` | 1～4（最多翻 4 页） | 60 秒 | 60～240 |
| 买家私信 `/api/chat` | 1～2 | 4 秒 | 900～1,800 |
| 藏家回复页 `/api/chat-reply` | 1 | 4 秒 | 900 |
| 藏品页浏览上报 `/api/save`（view） | 2（查重 GET + 写入 POST） | 每次首次浏览 | — |
| 收藏点击 `/api/save`（save/unsave） | 1～2 | 每次点击 | — |
| 每次部署构建 | 2 | 每次部署 | — |

结论：**只要有一个藏家把收件箱页面开着 40 分钟，当月额度就见底**；一个买家把私信面板开着 15 分钟也差不多。
11 月 1 日重置后到 11 月 10 日用了 80%，基本就是开发和自测期间开着这些页面造成的。

## 已做的止损（2026-11-10）

1. `assets/js/seller-inbox.js`
   - 收件箱轮询 5 秒 → **45 秒**；且只在窗口**真正获得焦点**（`document.hasFocus()`）时轮询。
   - 藏馆统计 60 秒 → **5 分钟**。
   - 折合：1,440 次/小时 → 约 **160 次/小时**，且切走窗口即停。
2. `assets/js/item-chat.js`、`assets/js/seller-reply.js`
   - 私信轮询 4 秒 → **15 秒**（买家看到回复最多晚 15 秒，可接受）。
3. `assets/js/fav-log.js`
   - 浏览上报去重键从 `sessionStorage` 改为 `localStorage`：**同一浏览器对同一藏品一辈子只报一次**，
     重复访问不再产生调用（原来换会话就会再报一次）。
4. `sw.js` v72 → **v73**，让新脚本进预缓存。

修复后单页成本（估算）：
- 藏家收件箱开 1 小时 ≈ 160 次（原来 1,440 次）
- 买家私信面板开 1 小时 ≈ 480 次（原来 1,800 次）
- 一个新访客看 10 件藏品 ≈ 20 次（浏览 10 + 若收藏再加）

## 还没解决的根本问题

按 1,000 次/月的预算，**每月只够约 33 次交互**。也就是说：只要网站开始有真实访客和藏家使用，
"浏览/收藏计数 + 询价收件箱 + 站内私信"这三件事靠 Airtable 免费版是不可能长期跑起来的。
下调轮询只是把天花板从"几十分钟"抬到"几小时"，不是解法。

## 三条出路（需要拍板）

1. **把计数与消息搬到 Cloudflare**（用户已有 Cloudflare 账号，免费额度：KV 读取 10 万/天、写入 1 千/天）
   - 优点：Airtable 只用作文本库（藏家填表、人工维护），额度彻底不再是瓶颈；免费。
   - 成本：写一个 Worker 承接 `/api/save`、`/api/interest`，Vercel 侧改指向；工作量中等。
2. **升级 Airtable Team 方案**（约 US$20/人/月，100,000 次/月）
   - 优点：零代码改动；缺点：每月固定支出，且 Team 只是 100 倍，不是无限。
3. **砍功能**：关掉浏览计数（只保留收藏）、收件箱改手动刷新按钮（打开页面才查一次）、私信改"邮件通知 + 手动刷新"
   - 优点：零成本立即可行；缺点：藏家看不到"人气"，网站显得冷清。

## 运维纪律（无论选哪条）

- Airtable 后台 → Workspace 设置里可以看当月 API 用量；每月 1 号看一次。
- 自测时**别把收件箱 / 私信页长期挂在后台**；测完关掉。
- 部署构建本身消耗很小（每次 2 次），不用为省额度放弃部署。

## 2026-11-10 落地：机器数据搬去 Cloudflare D1（一劳永逸）

决定：Airtable 只保留「人手维护」的藏品表与藏家表；**收藏计数、站内私信**这两类机器产生的数据
迁到 Cloudflare D1，由一个 Worker 读写。免费额度是 **每天 10 万行写入 / 500 万行读取 / 5 GB 存储**，
按现在的用量相当于「不会再撞墙」，也不用升级 Airtable。

### 现在的架构

```
浏览器 → /api/save、/api/interest、/api/chat、/api/seller-inbox、/api/chat-reply
        （Vercel 函数：只做签名验权、限流、参数校验）
        → Worker gudong-data-api（x-gudong-key 共享密钥）
        → D1 数据库 gudong-data（表 saves / messages）
Airtable 仍负责：藏品上架表（listings）、藏家表（sellers）、买家名单（buyer_leads）、询价记录
```

### 关键坐标

- Cloudflare Account ID：`b1b46e9369291ee99b61663ff325785f`
- D1 数据库 `gudong-data`：`e3a0fbe9-4844-4f48-9fae-4834dc23de5b`
- Worker：`gudong-data-api` → `https://gudong-data-api.minqi118.workers.dev`
- 表 `saves`：`item_id / seller / anon / status(active|removed) / created_at / updated_at`，主键 `(item_id, anon)`
- 表 `messages`：`id / item_id / seller_id / buyer_tmp_id / buyer_label / item_title / sender_type / client_id(唯一) / content / created_at / read_by_seller / read_by_buyer / notification_sent`
- Vercel 环境变量：`GUDONG_DATA_KEY`（= Worker 的 `INTERNAL_KEY`），`GUDONG_DATA_URL` 可省略（已内置默认）
- Worker 源码：`cloudflare/worker.js`；重新部署：`CLOUDFLARE_API_TOKEN=... node cloudflare/deploy.mjs`

### 每次交互的 Airtable 成本

| 动作 | 迁移前 | 迁移后 |
| --- | --- | --- |
| 收藏 / 取消收藏 | 2 次（查重 + 写入） | 0 |
| 收件箱打开看统计 | 1–4 次 | 0 |
| 收件箱读私信线程 | 1 次 | 0 |
| 买家私信面板取消息 | 1 次 | 0 |
| 买家发一条消息 | 1 次（去重）/ 2 次 | 1 次（仅校验「这件藏品属于该藏家」） |
| 构建刷新 listings | 2 次 / 天 | 不变 |

结论：每月的 Airtable 调用量从「几十次交互就爆」降到**只有发消息与询价才会消耗**，
1,000 次/月对早期流量已经完全够用。

### 纪律

- 不要再把 Airtable 当计数器用；新功能如果会产生高频读写，一律走 Worker + D1。
- 改 Worker 后必须 `node cloudflare/deploy.mjs` 重新上传，改完用 `/health` 与 `/interest` 各打一次确认。
- 数据备份：D1 控制台可 `SELECT` 导出；也可以用 `wrangler d1 export gudong-data --output backup.sql`。