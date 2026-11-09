# 藏品页询价身份确认（WhatsApp Contact Gate）— 上线说明

> 2026-11-09 上线。目标：买家的每一次 WhatsApp 询价都留下称呼、联系方式与意向，
> 卖家看到的不是陌生号码，而是一位"知道自己想要什么"的买家；同时把只想乱问的人挡在门外。

## 1. 买家看到什么

藏品页（`items/*.html` 与 `item.html`）上「🟢 通过 WhatsApp 咨询藏家」按钮：

1. **首次点击** → 站内弹层（不跳转、不打断浏览）：
   - 顶部一行上下文：`关于「四臂观音造像」· C K`，让买家确认自己在问哪件东西
   - 必填：称呼、邮箱或 WhatsApp 号码、意向（自用收藏 / 送礼 / 投资考量 / 只是询价）
   - 必选：同意《隐私政策》并同意把本次询价信息提供给该藏家
2. 点「确认并打开 WhatsApp →」：
   - **同步**打开 `wa.me`（新标签），所以绝不会被浏览器的弹窗拦截
   - 后台把这条询价写入 Airtable，失败也不影响买家跳转
3. **之后同设备再点任何藏家**：不再弹层，直接进 WhatsApp；这次询价仍然**静默入库**
   （同一买家 + 同一藏品 24 小时内只记一次，避免刷数据）

身份在本机 `localStorage.gudong_buyer` 保留 **365 天**；`buyer-list.js` 的"关注此藏家"输入框会自动预填同一个联系方式。

## 2. 落到哪里

`POST /api/lead` → Airtable `buyer_leads`（base `apprn6XDQnAm8bkaT`，table `tblJq1P1GarcvGMLI`）。

| 字段 | 内容 |
|---|---|
| `contact` / `contact_type` | 邮箱（小写）或 WhatsApp 号码（保留前导 +） |
| `name` | 称呼（≤40 字） |
| `intent` | 意向中文标签：`自用收藏` / `送礼` / `投资考量` / `只是询价` |
| `item_id` / `item_title` | 所询藏品；`page` 同时记 `/items/xxx.html` |
| `seller` | 藏家 ID |
| `consent_at` | 同意隐私政策的时间（ISO，UTC） |
| `source` | `wa-gate`（弹层登记）或 `wa-gate`（静默记录，同为该值） |
| `follows` | 买家本机关注的门类/藏家（`tag:瓷器; seller:lim-kw`） |
| `created_at` / `status` | ISO 时间 / `active` |

**降级策略**：如果 `name` / `intent` / `item_id` / `item_title` / `consent_at` 五个字段没建好，
接口第一次写入报 `UNKNOWN_FIELD_NAME`，会**自动重试一次精简版**，把称呼、意向、藏品打包进
`follows` 长文本（`name:Maggie; intent:送礼; item:item-limck-01; consent:2026-…`），一条数据都不会丢。
返回体里的 `stored` 字段会标明 `full` 或 `compact`。

## 3. Google 登录开关（默认关闭 · 待办）

> **状态：代码已就位，按钮默认隐藏。** 目前买家只能填邮箱或 WhatsApp 号码。
> 等 Client ID 到手后按下面两步打开即可，不需要改业务代码。

前端已写好，缺一个 Client ID 就自动隐藏按钮、只留邮箱表单：

1. Google Cloud → APIs & Services → Credentials → 建 **OAuth client ID（Web application）**
   - Authorized JavaScript origins：`https://www.gudong.app`、`https://gudong.app`（本地调试再加 `http://localhost:PORT`）
   - OAuth 同意屏幕填应用名「Gudong 古董圈」、支持邮箱 `contact@gudong.app`
2. 在 **18 个藏品页**（`item.html` + `items/*.html`）的 `<head>` 里、`wa-contact-gate.js` 之前加一行：
   ```html
   <script>window.GUDONG_GOOGLE_CLIENT_ID = 'xxxxx.apps.googleusercontent.com';</script>
   ```
   弹层读的就是这个全局变量（`assets/js/wa-contact-gate.js` 第 406 行 `global.GUDONG_GOOGLE_CLIENT_ID`），
   没设就整块 Google 按钮不渲染，邮箱路径不受影响。
3. 同时在 Vercel 环境变量加 `GOOGLE_CLIENT_ID`（同一个值），`/api/lead` 用它校验 ID token。

开启后流程：买家点「用 Google 继续」→ 前端拿到 ID token → `/api/lead` 用
`https://oauth2.googleapis.com/tokeninfo` 校验 `aud`（必须等于 Client ID）、`email_verified=true`、未过期 →
返回验证过的邮箱与显示名 → 自动填入表单。**服务端再次校验**才入库，伪造的 `source` 无法绕过。

## 4. 上线时动过的文件

| 文件 | 改动 |
|---|---|
| `assets/js/wa-contact-gate.js` | 新增。弹层、校验、静默入库、Google 开关（自包含 CSS，无外部依赖） |
| 18 个藏品页（`item.html` + `items/*.html`） | 各加一行 `<script src="../assets/js/wa-contact-gate.js" defer>` |
| `api/lead.js` | 接收 `name/intent/item_id/item_title/consent`；`verify_google` 动作；字段缺失时自动降级 |
| `privacy.html` | 第 2/3/7/8 节补询价信息、共享范围、本机存储与 24 个月保留；更新日期 2026-11-09 |
| `sw.js` | `CACHE_NAME` v63 → v64，预缓存加入新脚本 |
| `docs/BUYER_LIST.md` | 字段表补 5 个新字段 |

## 5. 怎么验

```powershell
# 1) 接口写入（会真的写一条记录，验完去 Airtable 删掉）
$body = '{"contact":"gate-smoke@example.com","contact_type":"email","name":"Gate Test","intent":"gift","item_id":"item-limck-01","item_title":"四臂观音造像","seller":"Lim-CK","source":"wa-gate","lang":"zh","page":"/items/item-limck-01.html","consent":"yes"}'
Invoke-RestMethod -Method Post -Uri "https://www.gudong.app/api/lead" -ContentType 'application/json' -Body $body
# 期望 ok:true, stored:"full"；若是 stored:"compact"，说明字段还没建好
```

浏览器验收：

1. 刷新 `https://www.gudong.app/items/item-limck-01.html`，点「通过 WhatsApp 咨询藏家」→ 应弹层
2. 填写 + 选意向 + 勾选同意 → 点确认 → 新标签打开 WhatsApp，Airtable 出现一条记录
3. 回到页面再点一次 → 不再弹层，直接进 WhatsApp
4. 页头切 EN → 弹层全英文

## 6. 运维提醒

- `AIRTABLE_TOKEN` 必须带 `data.records:write`，否则所有写入 403（`stored` 不会返回）。本地 `.env.production.local` 里的 token 是只读的旧值，生产 Vercel 上的是可写版本，以生产实测为准。
- 买家询价记录每月会累积，配合 `scripts/archive-buyer-leads.ps1` 导出归档；`buyer_leads` 免费版单表约 1000 条上限。
- 卖家侧通知（webhook / 邮件）**本期未启用**：按当前决定只入库。若要打开，复用 `api/chat.js` 里的 `CHAT_NOTIFY_WEBHOOK_URL` 推送模式，把 `new_enquiry` 事件推到团队群，或接 Resend 发到卖家邮箱。
