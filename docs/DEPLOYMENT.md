# 古懂集 — 部署说明文档

> 本文档涵盖环境变量配置、Supabase 初始化、Stripe 配置、本地开发及生产部署全流程。

---

## 目录

1. [环境变量总览](#1-环境变量总览)
2. [Supabase 配置](#2-supabase-配置)
3. [Stripe 配置](#3-stripe-配置)
4. [本地开发](#4-本地开发)
5. [生产部署（Vercel）](#5-生产部署vercel)
6. [PWA 注意事项](#6-pwa-注意事项)
7. [部署后验证清单](#7-部署后验证清单)

---

## 1. 环境变量总览

项目共需配置 **7 个环境变量**，复制 `.env.example` 为 `.env.local` 并填入实际值。

| 变量名 | 类型 | 必填 | 说明 | 获取方式 |
|--------|------|------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | 公开 | ✅ | Supabase 项目 URL | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公开 | ✅ | Supabase 匿名密钥（客户端用） | Supabase Dashboard → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | 私密 | ✅ | Supabase 服务角色密钥（服务端用，绕过 RLS） | Supabase Dashboard → Project Settings → API → service_role |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 公开 | ✅ | Stripe 发布密钥（客户端用） | Stripe Dashboard → Developers → API keys → Publishable key |
| `STRIPE_SECRET_KEY` | 私密 | ✅ | Stripe 密钥（服务端用） | Stripe Dashboard → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | 私密 | ✅ | Stripe Webhook 签名密钥 | Stripe Dashboard → Developers → Webhooks → Signing secret |
| `NEXT_PUBLIC_SITE_URL` | 公开 | ✅ | 站点完整 URL | 本地：`http://localhost:3000`；生产：`https://your-domain.com` |

> **安全提醒**：`SUPABASE_SERVICE_ROLE_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` 绝不可暴露到客户端代码中。仅 `NEXT_PUBLIC_` 前缀的变量会被打包到前端。

---

## 2. Supabase 配置

### 2.1 创建项目

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 点击 **New Project**
3. 填写项目信息：
   - Name: `antique-collection`（或自定义）
   - Database Password: 设置强密码并妥善保存
   - Region: 选择 `Southeast Asia (Singapore)`（距离最近，延迟最低）
   - Pricing Plan: Free 即可起步，生产建议 Pro
4. 等待项目初始化完成（约 2 分钟）

### 2.2 执行数据库 Schema

1. 进入项目 → **SQL Editor**
2. 点击 **New query**
3. 复制项目根目录下 `supabase/schema.sql` 的全部内容
4. 粘贴到 SQL Editor 中，点击 **Run**
5. 确认执行成功，应创建：
   - 4 张表：`profiles`、`categories`、`listings`、`orders`
   - 1 个视图：`listings_public`
   - 3 个辅助函数
   - 3 个触发器
   - 全部 RLS 策略
   - 6 条分类种子数据

### 2.3 创建 Storage Bucket

1. 进入项目 → **Storage**
2. 点击 **New bucket**
3. 填写：
   - Name: `listing-images`
   - Public bucket: **开启**（勾选）
4. 点击 **Create bucket**
5. （可选）在 Bucket 设置中配置文件大小限制和允许的 MIME 类型

> **注意**：bucket 必须设为公开读，否则前端无法显示图片。上传通过客户端 Supabase 客户端完成（已认证用户）。

### 2.4 获取 API Keys

1. 进入项目 → **Project Settings** → **API**
2. 复制以下值填入 `.env.local`：
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role**（点击 "Reveal"）→ `SUPABASE_SERVICE_ROLE_KEY`

### 2.5 配置认证（可选）

如需启用邮箱密码登录（项目默认使用此方式）：

1. 进入 **Authentication** → **Providers**
2. 确认 **Email** 已启用
3. （生产环境）配置 SMTP 发信服务，否则用户无法收到验证邮件
4. （开发阶段）可在 **Authentication** → **Users** 中手动创建测试用户

---

## 3. Stripe 配置

### 3.1 创建产品和价格

项目使用 **Stripe Checkout** 动态创建 `price_data`，无需预先在 Stripe Dashboard 创建产品。但为了对账和报表清晰，建议在 Dashboard 中创建对应产品。

**7 种付费产品（SGD）：**

| 产品标识 | 中文名称 | 英文名称 | 金额(SGD) | 类别 |
|----------|----------|----------|-----------|------|
| `listing_fee` | 上架审核费 | Listing Fee | 5.00 | 卖家服务 |
| `pin_24h` | 首页置顶24小时 | Pin to Home 24h | 10.00 | 卖家服务 |
| `priority_tag` | 分类标签优先展示 | Priority Tag | 10.00 | 卖家服务 |
| `full_package` | 卖家全套服务包 | Full Package | 30.00 | 卖家服务 |
| `boost_7d` | 浏览藏品擦亮7天 | Boost 7 Days | 8.00 | 卖家服务 |
| `pass_7d` | 7天通行证 | 7-Day Pass | 12.00 | 买家会员 |
| `vip_yearly` | VIP年费会员 | VIP Yearly | 199.00 | 买家会员 |

> 价格定义在 `lib/stripe/products.ts` 的 `PRICES` 对象中，修改价格只需改此文件。

### 3.2 配置 Webhook

#### 本地开发（使用 Stripe CLI）

1. 安装 [Stripe CLI](https://docs.stripe.com/stripe-cli)
2. 登录：
   ```bash
   stripe login
   ```
3. 转发 Webhook 到本地：
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. 复制终端输出的 `whsec_...` 密钥，填入 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`

#### 生产环境

1. 进入 [Stripe Dashboard](https://dashboard.stripe.com/) → **Developers** → **Webhooks**
2. 点击 **Add endpoint**
3. 填写：
   - **Endpoint URL**: `https://your-domain.com/api/webhooks/stripe`
   - **Description**: `Antique Collection checkout webhook`
4. 在 **Events to send** 中选择：
   - `checkout.session.completed`
5. 点击 **Add endpoint**
6. 进入该 Webhook 详情页，复制 **Signing secret**（`whsec_...`），填入生产环境变量

### 3.3 获取 API Keys

1. 进入 Stripe Dashboard → **Developers** → **API keys**
2. 复制：
   - **Publishable key**（`pk_...`）→ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key**（`sk_...`，点击 "Reveal test key"）→ `STRIPE_SECRET_KEY`
3. 生产环境切换到 **Live mode** 后重新获取 Live keys

---

## 4. 本地开发

### 4.1 前置要求

- Node.js >= 18.17（推荐 20.x LTS）
- npm >= 9.x
- Git

### 4.2 启动步骤

```bash
# 1. 克隆项目
git clone <repository-url> antique-collection
cd antique-collection

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 和 Stripe 的值

# 4. 启动开发服务器
npm run dev
```

4. 打开浏览器访问 `http://localhost:3000`

### 4.3 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（热重载） |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务器（需先 build） |
| `npm run lint` | 代码检查 |
| `npx tsc --noEmit` | TypeScript 类型检查 |

---

## 5. 生产部署（Vercel）

### 5.1 推荐方案：Vercel 部署

项目基于 Next.js 14 App Router，Vercel 是最佳部署平台（零配置、自动 HTTPS、边缘网络）。

#### 步骤

1. **推送代码到 Git 仓库**（GitHub / GitLab / Bitbucket）

2. **导入项目到 Vercel**：
   - 登录 [vercel.com](https://vercel.com)
   - 点击 **Add New...** → **Project**
   - 选择对应的 Git 仓库
   - 点击 **Import**

3. **配置项目**：
   - **Framework Preset**: 自动识别为 `Next.js`
   - **Root Directory**: `./`（项目根目录）
   - **Build Command**: 自动（`next build`）
   - **Output Directory**: 自动（`.next`）
   - **Install Command**: 自动（`npm install`）

4. **配置环境变量**：
   在 **Environment Variables** 区域逐一添加：
   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGciOi...
   SUPABASE_SERVICE_ROLE_KEY      = eyJhbGciOi...
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
   STRIPE_SECRET_KEY              = sk_live_...
   STRIPE_WEBHOOK_SECRET          = whsec_...
   NEXT_PUBLIC_SITE_URL           = https://your-domain.com
   ```
   > 确保所有环境变量的 **Environment** 勾选 `Production`、`Preview`、`Development`。

5. **点击 Deploy**，等待构建完成（约 1-2 分钟）

### 5.2 自定义域名

1. 进入 Vercel 项目 → **Settings** → **Domains**
2. 输入自定义域名（如 `antique-collection.sg`），点击 **Add**
3. 按提示在域名注册商处配置 DNS：
   - **A 记录**：指向 Vercel 提供的 IP（`76.76.21.21`）
   - 或 **CNAME 记录**：指向 `cname.vercel-dns.com`
4. 等待 DNS 生效（通常几分钟到几小时）
5. Vercel 自动签发 SSL 证书（HTTPS）
6. 更新 `NEXT_PUBLIC_SITE_URL` 环境变量为新域名，重新部署

### 5.3 其他部署选项

| 平台 | 说明 |
|------|------|
| **Netlify** | 支持 Next.js，需配置 `@netlify/plugin-nextjs` |
| **Docker** | 使用 `next start` 或 standalone 输出模式构建镜像 |
| **自托管 Node.js** | `npm run build && npm start`，需自行配置反向代理（Nginx）和 HTTPS |

---

## 6. PWA 注意事项

### 6.1 HTTPS 要求

Service Worker 仅在 **HTTPS** 环境下注册（`localhost` 除外）。

| 环境 | Service Worker 状态 |
|------|---------------------|
| `http://localhost:3000` | ✅ 可用（开发豁免） |
| `http://your-domain.com` | ❌ 不可用（必须 HTTPS） |
| `https://your-domain.com` | ✅ 可用 |

> Vercel 部署自动提供 HTTPS，无需额外配置。自托管需配置 SSL 证书（推荐 Let's Encrypt）。

### 6.2 缓存策略说明

| 资源类型 | 策略 | 说明 |
|----------|------|------|
| 静态资源（CSS/JS/图片/字体） | Cache First | 优先使用缓存，离线可用 |
| API 请求（`/api/*`） | Network First | 优先网络，离线时显示缓存数据 |
| 页面导航 | Network First | 优先网络，离线回退到 `/offline.html` |
| 其他 | Stale-While-Revalidate | 立即返回缓存，后台更新 |

### 6.3 版本更新

修改 `public/service-worker.js` 中的 `CACHE_NAME`（如 `antique-collection-v2`）即可触发客户端缓存更新。旧缓存会在 activate 事件中自动清理。

### 6.4 清单文件

`public/manifest.json` 定义了 PWA 元信息，包括：
- 应用名称、描述、图标
- 启动 URL、显示模式（standalone）
- 主题色、背景色
- 支持添加到主屏幕

---

## 7. 部署后验证清单

部署完成后，按以下清单逐项验证：

### 基础功能

- [ ] 首页正常加载，无控制台报错
- [ ] 藏品列表页可正常浏览
- [ ] 分类筛选功能正常
- [ ] 藏品详情弹窗可打开
- [ ] 中英文切换正常

### 认证与权限

- [ ] 用户可注册/登录
- [ ] 未登录用户看不到隐藏字段（价格/WhatsApp/报告）
- [ ] 会员可看到隐藏字段
- [ ] 卖家可上架藏品

### 支付流程

- [ ] 会员购买可跳转 Stripe Checkout
- [ ] 卖家付费服务可跳转 Stripe Checkout
- [ ] 支付成功后 Webhook 正确更新订单状态
- [ ] 支付成功后会员/服务生效

### PWA

- [ ] HTTPS 正常访问
- [ ] Service Worker 注册成功（DevTools → Application → Service Workers）
- [ ] 可添加到主屏幕
- [ ] 离线时显示离线回退页面

### 数据安全

- [ ] 隐藏字段不出现在非会员 API 响应中
- [ ] RLS 策略生效（尝试直接访问他人数据被拒绝）
- [ ] Service Role Key 未暴露到前端
