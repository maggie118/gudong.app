# 古懂集 / Antique Collection

> 新加坡古董捡漏情报 PWA 平台 — 汇聚珍稀古董，连接藏家与卖家。

**运营主体**：Dorothy Auction Pte. Ltd.（新加坡注册古董鉴定与拍卖服务公司）

---

## 项目简介

古懂集是一个面向新加坡及东南亚市场的古董捡漏情报平台。买家可以浏览各类古董藏品情报（瓷器、玉器、书画、家具、钱币等），开通会员后查看隐藏报价、卖家联系方式和市场参考报告。卖家可以付费上架藏品，并通过置顶、擦亮、优先展示等增值服务提升曝光。

平台采用 PWA（渐进式 Web 应用）架构，支持添加到主屏幕、离线访问和类原生应用体验。

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 14.2.15 |
| 语言 | TypeScript | 5.6+ |
| UI | React + 自定义 CSS | 18.3+ |
| 数据库 | PostgreSQL (Supabase) | — |
| 认证 | Supabase Auth | — |
| 存储 | Supabase Storage | — |
| 支付 | Stripe Checkout | 2024-06-20 |
| PWA | 原生 Service Worker + Web App Manifest | — |
| 部署 | Vercel（推荐） | — |

---

## 功能特性

### 核心功能

- **Explore Items** — 擦亮藏品聚合展示，按分类浏览精选古董
- **藏品列表** — 分页浏览、分类筛选、擦亮优先排序
- **藏品详情** — 多图画廊、品相/年代/来源信息、卖家信息
- **会员隐藏内容** — 隐藏报价、卖家 WhatsApp、市场参考报告（仅会员可见）
- **卖家入驻** — 藏品上架、图片上传、付费增值服务
- **Stripe 支付** — 安全的在线支付，支持卖家服务费和买家会员费
- **双语支持** — 中文 / 英文一键切换，本地化体验
- **PWA** — 添加到主屏幕、离线访问、类原生应用体验

### 卖家增值服务（5项）

| 服务 | 价格(SGD) | 说明 |
|------|-----------|------|
| 上架审核费 | 5 | 每条藏品上架审核（前3条免费） |
| 首页置顶24h | 10 | 24小时首页置顶展示 |
| 分类优先展示 | 10 | 分类列表排序靠前（30天） |
| 全套服务包 | 30 | 精品展区 + 修图排版报告 |
| 浏览擦亮7天 | 8 | Explore Items 展示（7天） |

### 买家会员（2项）

| 会员 | 价格(SGD) | 说明 |
|------|-----------|------|
| 7天通行证 | 12 | 7天内无限查看所有隐藏内容 |
| VIP年费 | 199 | 全年畅享会员权益，物超所值 |

---

## 快速开始

### 前置要求

- Node.js >= 18.17
- npm >= 9.x
- Supabase 账号
- Stripe 账号

### 3步启动

```bash
# 1. 克隆项目并安装依赖
git clone <repository-url> antique-collection
cd antique-collection
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 和 Stripe 的值
# 详见 docs/DEPLOYMENT.md

# 3. 启动开发服务器
npm run dev
```

打开浏览器访问 `http://localhost:3000`

> 完整部署配置请参阅 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 项目结构

```
antique-collection/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由（9个）
│   │   ├── categories/route.ts       # GET 分类列表
│   │   ├── checkout/route.ts         # POST Stripe 结账
│   │   ├── listings/
│   │   │   ├── route.ts              # GET 列表 / POST 创建
│   │   │   ├── [id]/route.ts         # GET 详情 / PATCH 更新 / DELETE 删除
│   │   │   ├── explore/route.ts      # GET Explore Items 聚合
│   │   │   └── pinned/route.ts       # GET 首页置顶
│   │   ├── user/
│   │   │   ├── me/route.ts           # GET/PATCH 当前用户
│   │   │   └── orders/route.ts       # GET 用户订单
│   │   └── webhooks/stripe/route.ts  # POST Stripe Webhook
│   ├── account/page.tsx           # 个人中心
│   ├── list/page.tsx              # 藏品列表
│   ├── membership/page.tsx        # 会员中心
│   ├── seller/page.tsx            # 卖家入驻
│   ├── page.tsx                   # 首页
│   ├── layout.tsx                 # 根布局（含 PWA 注册）
│   └── globals.css                # 全局样式
├── components/                     # React 组件（12个）
│   ├── CategoryFilter.tsx         # 分类筛选
│   ├── ExploreCard.tsx            # Explore 卡片
│   ├── Footer.tsx                 # 页脚
│   ├── HeroSection.tsx            # 首页 Hero
│   ├── ImageUpload.tsx            # 图片上传
│   ├── LanguageSwitch.tsx         # 语言切换
│   ├── ListingCard.tsx            # 藏品卡片
│   ├── ListingModal.tsx           # 藏品详情弹窗
│   ├── MembershipCard.tsx         # 会员卡
│   ├── Navbar.tsx                 # 导航栏（含登录）
│   ├── RiskBanner.tsx             # 风险提示横幅
│   └── SealBadge.tsx              # 印章角标
├── docs/                           # 文档
│   ├── DATABASE_FIELDS.md         # 数据库字段说明
│   └── DEPLOYMENT.md              # 部署说明
├── lib/                            # 工具库
│   ├── i18n/
│   │   ├── dictionaries.ts        # 中英双语字典
│   │   └── useTranslation.ts      # 翻译 Hook
│   ├── stripe/
│   │   ├── client.ts              # Stripe 服务端客户端
│   │   └── products.ts            # 产品价格定义
│   ├── supabase/
│   │   ├── admin.ts               # Service Role 客户端
│   │   ├── client.ts              # 浏览器端客户端
│   │   └── server.ts              # 服务端客户端
│   ├── utils/
│   │   ├── api.ts                 # API 响应工具
│   │   └── permissions.ts         # 权限校验工具
│   └── types.ts                   # TypeScript 类型定义
├── public/                         # 静态资源
│   ├── icons/                      # PWA 图标
│   │   ├── icon.svg               # 矢量源文件
│   │   ├── icon-192.png           # 192px 图标
│   │   ├── icon-512.png           # 512px 图标
│   │   └── README.md              # 图标说明
│   ├── manifest.json              # PWA 清单
│   ├── service-worker.js          # Service Worker
│   └── offline.html               # 离线回退页
├── supabase/
│   └── schema.sql                  # 数据库 Schema
├── middleware.ts                   # Next.js 中间件
├── next.config.js                  # Next.js 配置
├── tsconfig.json                   # TypeScript 配置
├── package.json                    # 依赖配置
├── .env.example                    # 环境变量模板
└── README.md                       # 本文件
```

---

## 业务规则摘要

### 卖家收费（5项）

1. **上架审核费** — SGD 5/条，前 3 条免费，超出后每条收费
2. **首页置顶24小时** — SGD 10，藏品在首页置顶区域展示 24 小时
3. **分类标签优先展示** — SGD 10，分类列表中排序靠前，有效期 30 天
4. **卖家全套服务包** — SGD 30，精品展区 + 修图排版报告
5. **浏览藏品擦亮7天** — SGD 8，Explore Items 区域展示 7 天

### 买家收费（2项）

1. **7天通行证** — SGD 12，7 天内无限查看所有隐藏内容（报价、联系方式、市场报告）
2. **VIP年费会员** — SGD 199，全年畅享会员权益

### 免费额度

- 每个卖家前 **3 条**藏品上架免费
- 所有用户可免费浏览藏品公开信息（标题、图片、品相、年代等）
- 隐藏内容（报价、WhatsApp、市场报告）仅会员或卖家本人可见

---

## 安全架构说明

### 多层安全防护

#### 1. 隐藏字段后端校验

藏品的隐藏字段（`hidden_price`、`hidden_whatsapp`、`market_report`）采用**三层防护**：

- **数据库层**：`listings_public` 视图（SECURITY DEFINER）仅暴露公开字段，匿名用户只能查询视图
- **API 层**：所有公开查询使用 `LISTING_PUBLIC_FIELDS` 字段白名单，显式排除隐藏字段
- **响应层**：`stripHiddenFields()` 函数在返回前再次剥离任何可能泄露的隐藏字段

非会员用户**绝对不可能**通过 API 获取隐藏字段。

#### 2. Row Level Security (RLS)

所有 4 张业务表均启用 RLS：

| 表 | 读取规则 | 写入规则 |
|----|----------|----------|
| profiles | 用户只读自己；admin 可读全部 | 用户只改自己；admin 可改全部 |
| categories | 公开可读 | 仅 admin |
| listings | 卖家本人或 admin（含隐藏字段） | 卖家本人或 admin |
| orders | 用户只读自己的；admin 可读全部 | 用户只能创建自己的；更新仅 admin |

#### 3. Service Role 隔离

- `lib/supabase/admin.ts` 使用 Service Role 密钥，**仅在服务端**使用（Stripe Webhook、后台管理）
- 模块顶部有运行时检查，缺少密钥时直接抛出错误
- 客户端代码（`lib/supabase/client.ts`）仅使用 anon 密钥

#### 4. API 认证与授权

- 所有写操作需要认证（`getUserFromRequest`）
- 卖家操作需要角色校验（`isSeller`）
- 藏品修改需要所有权校验（`canEditListing`）
- 隐藏字段查看需要会员/所有权/admin 校验（`canViewHiddenFields`）

#### 5. Stripe Webhook 安全

- Webhook 使用原始 body 验证 Stripe 签名（`stripe.webhooks.constructEvent`）
- 仅处理 `checkout.session.completed` 事件
- 订单状态更新通过 Service Role 客户端执行（绕过 RLS）
- 支付成功后触发订单履约（置顶、擦亮、会员开通等）

---

## API 概览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/categories` | 分类列表 | 公开 |
| GET | `/api/listings` | 藏品列表（分页、分类筛选） | 公开 |
| POST | `/api/listings` | 创建藏品 | 卖家 |
| GET | `/api/listings/:id` | 藏品详情（权限控制隐藏字段） | 可选 |
| PATCH | `/api/listings/:id` | 更新藏品 | 卖家本人/admin |
| DELETE | `/api/listings/:id` | 软删除藏品 | 卖家本人/admin |
| GET | `/api/listings/explore` | Explore Items 聚合 | 公开 |
| GET | `/api/listings/pinned` | 首页置顶藏品 | 公开 |
| POST | `/api/checkout` | 创建 Stripe 结账会话 | 已认证 |
| GET | `/api/user/me` | 当前用户信息 | 已认证 |
| PATCH | `/api/user/me` | 更新用户资料 | 已认证 |
| GET | `/api/user/orders` | 用户订单列表 | 已认证 |
| POST | `/api/webhooks/stripe` | Stripe Webhook | 签名验证 |

所有 API 响应统一格式：
```json
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

---

## 文档

- [数据库字段说明](docs/DATABASE_FIELDS.md) — 4 张表完整字段说明、索引设计、RLS 策略
- [部署说明](docs/DEPLOYMENT.md) — 环境变量、Supabase/Stripe 配置、本地开发、生产部署

---

## 运营主体

**Dorothy Auction Pte. Ltd.**
- 新加坡注册古董鉴定与拍卖服务公司
- 12 年文物鉴定评估经验
- 一级文物鉴定评估师资质

> 风险提示：本平台仅提供藏品信息展示与撮合服务，不对藏品真伪做担保。请买家自行鉴定或委托专业机构评估，谨慎交易。

---

## License

Private — Dorothy Auction Pte. Ltd. All rights reserved.
