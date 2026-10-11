# 古董圈 Gudong.app

> 新加坡高端古董发现与藏家网络 · 连接新加坡、东南亚与欧美的中国古董藏家。

**运营主体**：

---

## 项目简介

古董圈（Gudong.app）是一个面向新加坡及海外古董藏家的**高端展示与连接平台**，采用 **PWA（渐进式 Web 应用）** 架构，支持添加到主屏幕、离线访问和类原生体验。

平台定位为**策展级展示 + 直接连接**：为藏家/卖家提供专业的藏品上架、图片精修、独立展馆与曝光服务，让买家浏览藏品并**直接联系**卖家。平台 **不提供鉴定、不参与藏品交易、0% 交易佣金、不介入买卖货款**——成交由买卖双方自行交割。

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript（无框架） |
| PWA | 原生 Service Worker（`sw.js`）+ Web App Manifest |
| 后端 | Vercel Serverless Functions（Node.js，`/api`） |
| 数据 | Airtable（藏家申请、内容数据） |
| 通讯 | WhatsApp Business API（表单收款、买卖双方桥接） |
| 部署 | Vercel（静态 + Serverless） |
| 字体 | Google Fonts：Playfair Display / Noto Serif SC |

> 注：本项目为纯静态站点，**不使用** Next.js / Supabase / Stripe。

---

## 功能特性

### 买家侧
- **首页**：今日发现、今日简报（捡漏情报）、刚刚上新
- **藏品库**：按分类浏览（瓷器 / 玉器 / 铜器 / 钱币 / 书画 / 杂项）
- **藏家展馆**：浏览入驻藏家的专属展馆与藏品
- **情报 / 知识**：藏家资讯与参考内容
- **委托寻宝**：付费委托平台定向检索藏品（买家侧服务）
- **直接联系**：浏览藏品后直接联系卖家，平台不介入交易

### 卖家侧
- **创始藏家计划**：免费入驻体验，专属身份标识
- **专业上架**：图片精修、资料整理、线上展示
- **专属数字旗舰馆**：10 件合包建馆，独立主页 + 专属网址
- **曝光增值服务**：首页精选、精准推送等，让藏品更快成交
- **卖家消息**：`seller-inbox` / `seller-reply` 通过 WhatsApp 桥接买卖双方沟通

### 平台能力
- **双语**：中文 / English 一键切换（zh-SG / en-SG）
- **PWA**：添加到主屏幕、离线访问、类原生体验
- **分享**：Web Share API + 剪贴板降级
- **工具**：年份距今计算器、干支公历换算器

---

## 商业模式与收费

### 卖家服务（当前 · pricing.html）

| 服务 | 价格 (SGD) | 说明 |
|------|-----------|------|
| 创始藏家体验席 | **免费**（前 2 件） | 每件 4 图精修 + 1 年展示 + 创始徽章；限额 88 位 |
| 单件专业上架 | **S$198 / 件 / 年** | 精修 + 资料整理 + 一年在线展示 |
| 专属藏家数字旗舰馆 | **S$1,499**（原价 S$2,499） | 10 件合包 + 独立主页/网址 + 2 个月首页精选 + 2 次顾问咨询，**0% 佣金** |
| 首页精选展示 | **S$298 / 月**（S$2,980/年） | 首页黄金位曝光 |
| 顾问咨询 | **S$188 / 次** | 参考意见（**非鉴定/估值证书**） |

### 买家服务

| 服务 | 价格 (SGD) | 说明 |
|------|-----------|------|
| 委托寻宝 | S$280 启动 + **成交再付 S$800** | 定向检索 + 资质初筛 + 私密联系藏家 |

### 规划中 / 待落地（已确定方向）

> 以下为已确认、待写入页面的定价调整，落地时更新本表。

- **创始藏家改为「每月 2 件永久免费」**：每月自动补充 2 件免费发布额度，永久有效；每件展示 1 年。当月未用清零、不累积。
- **超 2 件收费阶梯**（按月、每月重置）：散件 S$198/件 → 6 件小包 S$1,080 → 10 件旗舰馆 S$1,499。
- **买家精准推送**：S$58 / 件 / 次（S$150 / 3 次），先付后推、不按成交抽成。
- **88 位创始名额实时进度条** + 下一期收紧（第 2 期 188 位 · 每月 1 件免费 + 入驻 9 折）。

---

## 合规声明（核心定位）

- 平台 **不提供古董鉴定**，不评估真伪、品相与价格；
- 平台 **不参与藏品交易、不介入买卖货款**，**0% 交易佣金**；
- 真伪、品相及价格由买卖双方自行判断；
- “顾问咨询/品鉴”仅提供个人参考意见，**非鉴定/估值证书**。

---

## 项目结构

```
Gudong/
├── index.html                 # 首页（今日发现 / 今日简报 / 刚刚上新）
├── collection.html            # 藏品库
├── pricing.html               # 服务价格（藏家展馆与上架服务）
├── insights.html              # 情报 / 知识
├── about.html                 # 关于我们 / 联系
├── privacy.html               # 隐私政策
├── terms.html                 # 用户条款
├── seller-inbox.html          # 卖家收件箱（WhatsApp 桥接）
├── seller-reply.html          # 卖家回复
├── manifest.json              # PWA 清单
├── sw.js                      # Service Worker
├── vercel.json                # Vercel 配置（CORS / 缓存策略）
├── sitemap.xml / robots.txt   # SEO
├── og-cover.*                 # 分享封面
├── api/                       # Vercel Serverless Functions
│   ├── airtable-proxy.js      # Airtable 数据代理
│   ├── chat.js                # 对话桥（买家 → 卖家）
│   ├── chat-reply.js          # 对话桥（卖家 → 买家）
│   └── seller-inbox.js        # 卖家收件箱数据
├── categories/                # 分类页（瓷器 / 玉器 / 铜器 / 钱币 / 书画 / 杂项）
├── sellers/                   # 藏家展馆（index + 各藏家页面）
├── tools/                     # 工具（年份计算器、干支换算器）
├── my/                        # 个人（我的收藏·关注 / 今日简报）
├── insights/                  # 情报内容
├── content/                   # 内容（bodies 等）
├── items/                     # 藏品数据 / 页面
├── data/                      # 数据
├── assets/                    # 品牌 / css / fonts / icons / images / js
├── scripts/                   # 生成与构建脚本
│   ├── generate.js            # 页面生成
│   ├── generate-sellers.js    # 藏家页面生成
│   └── build-insights.js      # 情报构建
├── airtable-script/           # Airtable 自动化脚本
├── templates/                 # 页面模板
├── prototypes/                # 原型（如修图弹窗）
├── docs/                      # 文档
│   ├── DEPLOYMENT.md          # 部署说明
│   ├── DATABASE_FIELDS.md     # 数据字段说明
│   └── CHAT_SETUP.md          # WhatsApp 对话配置
└── *.py / *.ps1               # 图片透明化 / 校验工具
```

---

## 本地开发

本项目为静态站点，无需复杂构建即可在本地预览：

```bash
# 用任意静态服务器预览（例如 VS Code Live Server / npx serve）
npx serve .
```

- 页面生成脚本：`node scripts/generate.js`、`node scripts/generate-sellers.js`、`node scripts/build-insights.js`
- Serverless 函数（`api/*.js`）需在 Vercel 环境联调；本地可用 `vercel dev`
- 环境变量参考 `.env.local` / `.env.production.local`（含 Airtable、WhatsApp 等密钥，勿提交到仓库）

---

## 部署

- 平台：**Vercel**（静态 + Serverless Functions）
- `vercel.json` 已配置 cleanUrls、CORS 头、`sw.js` 与 `seller-inbox.html` 的缓存策略
- 详细部署流程见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## 运营与收款流程

1. 卖家通过页面表单 / WhatsApp 申请服务；
2. 平台经 WhatsApp 发送 **PayNow / 银行转账** 付款二维码；
3. 卖家付款后回传付款截图，平台 **3 个工作日内** 完成上架 / 建馆 / 曝光；
4. 平台 **预收服务费、不按成交抽成**，保持 0 佣金与不碰货款定位。

---

## 相关文档

- [部署说明](docs/DEPLOYMENT.md)
- [数据字段说明](docs/DATABASE_FIELDS.md)
- [WhatsApp 对话配置](docs/CHAT_SETUP.md)

---

## License

Private — Dorothy Auction Pte. Ltd. All rights reserved.
