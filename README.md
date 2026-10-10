古董圈 / Gudong.app
新加坡高端古董发现平台与藏家网络 — 发现值得收藏的中国古董，直接连接真正的藏家。

运营主体：Altay Holdings Pte. Ltd.（阿尔泰控股私人有限公司，新加坡注册）

---

项目简介
古董圈（gudong.app）是一个面向新加坡、东南亚及全球欧美收藏群体的高端中国古董发现与藏家网络。买家可以浏览各类明清瓷器、玉器、钱币、书画及铜器等藏品信息，并通过公开的联系方式直接对接藏家。

平台采用 PWA（渐进式 Web 应用）架构，支持添加到主屏幕、离线访问和类原生应用体验。

---

类别,技术,版本
框架,Next.js (App Router),14.2.15
语言,TypeScript,5.6+
UI,React + 自定义 CSS（Morandi 色系）,18.3+
数据/后端,Airtable 代理 / REST API / Supabase（可选）,—
支付,Stripe & PayNow（新加坡及东南亚本地化结算）,—
PWA,原生 Service Worker + Web App Manifest,—
部署,Vercel（推荐）,—

核心特性
今日发现 / Explore Items — 每日精选值得留意的中国古董与捡漏情报。

刚刚上新 — 最新发布的藏品持续更新，按类别精准归档。

藏家展馆 — 为知名行家与资深藏家建立高质感的专属数字展示空间。

点对点直连 — 买卖双方直接沟通，平台去中介化，不截留资源。

双语支持 — 中文（zh-SG） / 英文（en-SG）一键切换，兼顾东南亚与欧美藏家。

PWA — 添加到主屏幕、全屏无缝体验，无需应用商店。

业与服务模型
古董圈采用创新的 SaaS 化纯数字服务模式，不参与任何交易抽佣，也不经手买卖双方货款。

1. 创世藏家招募（Founder Tier）
限量 88 席奠基元老，提供免费入驻席位及专属曝光支持。

2. 藏家与买家服务
单次藏品上架与展馆展示

买家独立找货与顾问服务（独立买家独立付费，详见定价页）
---

快速开始
前置要求
Node.js >= 18.17

npm >= 9.x

3步启动
Bash


# 1. 克隆项目并安装依赖
git clone <repository-url> gudong-app
cd gudong-app
npm install

# 2. 配置环境变量
cp .env.example .env.local

# 3. 启动开发服务器
npm run dev
打开浏览器访问 http://localhost:3000

平台免责与合规声明
Altay Holdings Pte. Ltd.（古董圈 Gudong.app） 严格恪守独立、透明的中立立场：

不鉴定：平台不提供官方鉴定、估价或保真服务，真伪、品相及价格由买卖双方自行研判。

不交易：平台不参与任何买卖交易，不代收代付买卖双方款项，不收取成交佣金。

风险提示：古董收藏遵循“买者自负”原则。平台仅提供藏品信息展示与藏家连接服务。

运营主体
Altay Holdings Pte. Ltd.（阿尔泰控股私人有限公司）

总部注册于新加坡

专注于数字化软件、艺术品信息网络与跨国技术平台

License
Private — Altay Holdings Pte. Ltd. All rights reserved.
