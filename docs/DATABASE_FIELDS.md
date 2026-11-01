# 古懂集 — 数据库字段说明文档

> 基于 `supabase/schema.sql`，涵盖全部 4 张业务表、索引设计、RLS 策略及公开视图。

---

## 目录

1. [profiles — 用户扩展表](#1-profiles--用户扩展表)
2. [categories — 分类表](#2-categories--分类表)
3. [listings — 藏品/情报表](#3-listings--藏品情报表核心表)
4. [orders — 订单表](#4-orders--订单表)
5. [listings_public — 公开视图](#5-listings_public--公开视图)
6. [索引设计](#6-索引设计)
7. [RLS 策略要点](#7-rls-策略要点)
8. [辅助函数与触发器](#8-辅助函数与触发器)

---

## 1. profiles — 用户扩展表

用户注册后由触发器自动创建，存储角色、会员状态、卖家额度等业务信息。

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `id` | uuid | — | ✅ | 用户唯一标识，外键关联 `auth.users(id)` | 与 Supabase Auth 用户 ID 一致，级联删除 |
| `role` | text | `'buyer'` | ✅ | 用户角色 | `buyer`（买家）/ `seller`（卖家）/ `admin`（管理员） |
| `display_name` | text | `null` | ❌ | 显示名称 / 店铺名 | 自由文本，前端展示用 |
| `avatar_url` | text | `null` | ❌ | 头像图片 URL | 完整 URL，建议使用 Supabase Storage |
| `phone` | text | `null` | ❌ | 联系电话 | 建议格式：+65 XXXX XXXX |
| `whatsapp` | text | `null` | ❌ | WhatsApp 联系方式 | 卖家填写，会员可见 |
| `free_listings_used` | int4 | `0` | ✅ | 已使用的免费上架额度 | 整数，上限 3（前 3 条免费） |
| `membership_type` | text | `null` | ❌ | 会员类型 | `null`（非会员）/ `pass_7d`（7天通行证）/ `vip_yearly`（VIP年费） |
| `membership_expires_at` | timestamptz | `null` | ❌ | 会员到期时间 | ISO 8601 时间戳，过期后会员失效 |
| `created_at` | timestamptz | `now()` | ✅ | 记录创建时间 | 自动生成 |
| `updated_at` | timestamptz | `now()` | ✅ | 记录最后更新时间 | 触发器自动更新 |

---

## 2. categories — 分类表

藏品分类，预置 6 个标准分类，仅管理员可增删改。

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `id` | uuid | `gen_random_uuid()` | ✅ | 分类唯一标识 | 自动生成 |
| `slug` | text | — | ✅ | URL 友好标识，唯一 | 如 `porcelain`、`jade`、`painting`、`furniture`、`coin`、`other` |
| `name_zh` | text | — | ✅ | 中文分类名 | 如"瓷器"、"玉器"、"书画"等 |
| `name_en` | text | — | ✅ | 英文分类名 | 如"Porcelain"、"Jade"、"Painting"等 |
| `icon` | text | `null` | ❌ | 图标标识 | 字符串标识，前端映射图标组件 |
| `sort_order` | int4 | `0` | ✅ | 排序权重 | 数字越小越靠前 |
| `created_at` | timestamptz | `now()` | ✅ | 记录创建时间 | 自动生成 |

**预置数据：**

| slug | name_zh | name_en | sort_order |
|------|---------|---------|------------|
| porcelain | 瓷器 | Porcelain | 1 |
| jade | 玉器 | Jade | 2 |
| painting | 书画 | Painting | 3 |
| furniture | 家具 | Furniture | 4 |
| coin | 钱币 | Coin | 5 |
| other | 其他 | Other | 6 |

---

## 3. listings — 藏品/情报表（核心表）

存储所有藏品/捡漏情报，包含公开字段和隐藏字段（仅会员/卖家本人可见）。

### 3.1 基础信息字段

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `id` | uuid | `gen_random_uuid()` | ✅ | 藏品唯一标识 | 自动生成 |
| `seller_id` | uuid | — | ✅ | 卖家用户 ID | 外键关联 `profiles(id)`，级联删除 |
| `category_id` | uuid | — | ✅ | 分类 ID | 外键关联 `categories(id)`，限制删除（RESTRICT） |
| `title_zh` | text | — | ✅ | 中文标题 | 自由文本 |
| `title_en` | text | — | ✅ | 英文标题 | 自由文本 |
| `description_zh` | text | `null` | ❌ | 中文描述 | 自由文本，支持长文本 |
| `description_en` | text | `null` | ❌ | 英文描述 | 自由文本，支持长文本 |
| `images` | text[] | `'{}'` | ✅ | 图片 URL 数组 | Supabase Storage 公开 URL 数组，最多 10 张 |
| `condition` | text | `null` | ❌ | 品相等级 | `mint`（全新）/ `excellent`（极佳）/ `good`（良好）/ `fair`（一般）/ `poor`（较差） |
| `era` | text | `null` | ❌ | 年代 | 如"清光绪"、"明永乐"、"民国"等自由文本 |
| `origin` | text | `null` | ❌ | 来源/产地 | 如"景德镇"、"苏州"等自由文本 |

### 3.2 隐藏字段（仅会员 / 卖家本人 / admin 可见）

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `hidden_price` | numeric | `null` | ❌ | 隐藏报价（SGD） | 卖家期望价格，会员可见 |
| `hidden_whatsapp` | text | `null` | ❌ | 隐藏 WhatsApp 联系方式 | 卖家私密联系方式，会员可见 |
| `market_report` | text | `null` | ❌ | 市场参考报告 | 鉴定评估/市场行情分析，会员可见 |

### 3.3 审核与付费状态字段

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `is_approved` | boolean | `false` | ✅ | 是否审核通过 | 原型阶段自动设为 `true`；生产环境需人工审核 |
| `is_pinned` | boolean | `false` | ✅ | 是否首页置顶 | 付费服务 `pin_24h` 生效时为 `true` |
| `pinned_expires_at` | timestamptz | `null` | ❌ | 置顶到期时间 | 置顶 24 小时后过期 |
| `is_boosted` | boolean | `false` | ✅ | 是否擦亮（Explore Items） | 付费服务 `boost_7d` 生效时为 `true` |
| `boosted_expires_at` | timestamptz | `null` | ❌ | 擦亮到期时间 | 擦亮 7 天后过期 |
| `is_priority` | boolean | `false` | ✅ | 是否分类优先展示 | 付费服务 `priority_tag` 生效时为 `true` |
| `priority_expires_at` | timestamptz | `null` | ❌ | 优先展示到期时间 | 30 天后过期 |
| `is_featured` | boolean | `false` | ✅ | 是否精品展区 | 付费服务 `full_package` 生效时为 `true` |
| `view_count` | int4 | `0` | ✅ | 浏览次数 | 整数，每次详情页访问递增 |
| `status` | text | `'active'` | ✅ | 藏品状态 | `active`（在售）/ `sold`（已售）/ `removed`（已下架/软删除） |
| `created_at` | timestamptz | `now()` | ✅ | 创建时间 | 自动生成 |
| `updated_at` | timestamptz | `now()` | ✅ | 最后更新时间 | 触发器自动更新 |

---

## 4. orders — 订单表

记录所有付费交易，包括卖家服务费和买家会员费。

| 字段名 | 类型 | 默认值 | 必填 | 业务含义 | 取值范围 / 说明 |
|--------|------|--------|------|----------|-----------------|
| `id` | uuid | `gen_random_uuid()` | ✅ | 订单唯一标识 | 自动生成 |
| `user_id` | uuid | — | ✅ | 下单用户 ID | 外键关联 `profiles(id)`，级联删除 |
| `listing_id` | uuid | `null` | ❌ | 关联藏品 ID | 卖家服务类订单必填；会员类订单为 `null`；外键关联 `listings(id)`，删除时置空 |
| `order_type` | text | — | ✅ | 订单类型 | 见下方枚举表 |
| `amount` | numeric | — | ✅ | 订单金额 | SGD 货币单位，如 `5.00`、`199.00` |
| `currency` | text | `'SGD'` | ✅ | 货币代码 | 固定为 `SGD`（新加坡元） |
| `status` | text | `'pending'` | ✅ | 订单状态 | `pending`（待支付）/ `paid`（已支付）/ `failed`（支付失败）/ `refunded`（已退款） |
| `stripe_checkout_session_id` | text | `null` | ❌ | Stripe Checkout Session ID | 用于关联 Stripe 支付会话 |
| `stripe_payment_intent_id` | text | `null` | ❌ | Stripe Payment Intent ID | Webhook 支付成功后回写 |
| `paid_at` | timestamptz | `null` | ❌ | 支付完成时间 | Webhook 确认支付后回写 |
| `created_at` | timestamptz | `now()` | ✅ | 订单创建时间 | 自动生成 |

**order_type 枚举与价格：**

| order_type | 中文名称 | 英文名称 | 价格(SGD) | 类别 | 需 listing_id |
|------------|----------|----------|-----------|------|---------------|
| `listing_fee` | 上架审核费 | Listing Fee | 5 | 卖家服务 | ✅ |
| `pin_24h` | 首页置顶24小时 | Pin to Home 24h | 10 | 卖家服务 | ✅ |
| `priority_tag` | 分类标签优先展示 | Priority Tag | 10 | 卖家服务 | ✅ |
| `full_package` | 卖家全套服务包 | Full Package | 30 | 卖家服务 | ✅ |
| `boost_7d` | 浏览藏品擦亮7天 | Boost 7 Days | 8 | 卖家服务 | ✅ |
| `pass_7d` | 7天通行证 | 7-Day Pass | 12 | 买家会员 | ❌ |
| `vip_yearly` | VIP年费会员 | VIP Yearly | 199 | 买家会员 | ❌ |

---

## 5. listings_public — 公开视图

### 作用

`listings_public` 是一个 **SECURITY DEFINER 视图**，用于安全地向公众暴露藏品的公开字段，同时严格隔离隐藏字段。

### 关键特性

| 特性 | 说明 |
|------|------|
| **字段隔离** | 仅包含 25 个公开字段，**不包含** `hidden_price`、`hidden_whatsapp`、`market_report` |
| **状态过滤** | 仅返回 `is_approved = true` 且 `status = 'active'` 的藏品 |
| **SECURITY DEFINER** | 以视图所有者（postgres）权限运行，绕过 RLS 限制 |
| **公开授权** | `GRANT SELECT TO anon, authenticated`，匿名用户也可查询 |
| **只读** | 视图不可 INSERT/UPDATE/DELETE |

### 包含字段

```
id, seller_id, category_id, title_zh, title_en,
description_zh, description_en, images, condition, era, origin,
is_approved, is_pinned, pinned_expires_at,
is_boosted, boosted_expires_at, is_priority, priority_expires_at,
is_featured, view_count, status, created_at, updated_at
```

> **注意**：当前 API 层直接查询 `listings` 表并使用 `LISTING_PUBLIC_FIELDS` 字段列表 + `stripHiddenFields()` 双重保险来确保隐藏字段不泄露。`listings_public` 视图作为额外的安全层，可在未来直接替换 API 查询源。

---

## 6. 索引设计

### listings 表索引（7个）

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_listings_seller_id` | `seller_id` | 卖家藏品列表查询 |
| `idx_listings_category_id` | `category_id` | 按分类筛选 |
| `idx_listings_is_approved` | `is_approved` | 审核状态过滤 |
| `idx_listings_pinned` | `is_pinned, pinned_expires_at` | 首页置顶查询（复合索引） |
| `idx_listings_boosted` | `is_boosted, boosted_expires_at` | Explore Items 擦亮查询（复合索引） |
| `idx_listings_status` | `status` | 状态过滤 |
| `idx_listings_created_at` | `created_at DESC` | 按创建时间排序 |

### orders 表索引（3个）

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_orders_user_id` | `user_id` | 用户订单列表查询 |
| `idx_orders_status` | `status` | 按状态筛选 |
| `idx_orders_created_at` | `created_at DESC` | 按创建时间排序 |

---

## 7. RLS 策略要点

所有 4 张表均启用 Row Level Security。

### profiles

| 操作 | 策略 | 条件 |
|------|------|------|
| SELECT | `profiles_select_own` | `auth.uid() = id OR is_admin()` |
| INSERT | `profiles_insert_own` | `auth.uid() = id` |
| UPDATE | `profiles_update_own` | `auth.uid() = id OR is_admin()` |

> 用户只能读取/修改自己的 profile；admin 可操作全部。新用户注册时由触发器自动创建 profile。

### categories

| 操作 | 策略 | 条件 |
|------|------|------|
| SELECT | `categories_select_public` | `true`（公开可读） |
| INSERT | `categories_insert_admin` | `is_admin()` |
| UPDATE | `categories_update_admin` | `is_admin()` |
| DELETE | `categories_delete_admin` | `is_admin()` |

> 分类数据对所有人公开读取，仅管理员可增删改。

### listings

| 操作 | 策略 | 条件 |
|------|------|------|
| SELECT | `listings_select_own_or_admin` | `auth.uid() = seller_id OR is_admin()` |
| INSERT | `listings_insert_auth` | `auth.uid() = seller_id` |
| UPDATE | `listings_update_own_or_admin` | `auth.uid() = seller_id OR is_admin()` |
| DELETE | `listings_delete_own_or_admin` | `auth.uid() = seller_id OR is_admin()` |

> **关键设计**：`listings` 表本身的 SELECT 仅允许卖家本人和 admin（含隐藏字段）。公开读取通过 `listings_public` 视图（SECURITY DEFINER，已授权 anon/authenticated）实现，确保隐藏字段永远不会通过表级查询泄露给非授权用户。

### orders

| 操作 | 策略 | 条件 |
|------|------|------|
| SELECT | `orders_select_own_or_admin` | `auth.uid() = user_id OR is_admin()` |
| INSERT | `orders_insert_own` | `auth.uid() = user_id` |
| UPDATE | `orders_update_admin` | `is_admin()` |

> 用户只能查看自己的订单；订单状态更新仅允许 admin（Stripe Webhook 通过 Service Role 密钥操作，绕过 RLS）。

---

## 8. 辅助函数与触发器

### 辅助函数

| 函数名 | 返回类型 | 说明 |
|--------|----------|------|
| `is_admin()` | boolean | 判断当前用户是否为 admin（SECURITY DEFINER，避免 RLS 递归） |
| `handle_updated_at()` | trigger | 自动更新 `updated_at` 字段为 `now()` |
| `handle_new_user()` | trigger | 新用户注册时自动创建 profile（role='buyer'） |

### 触发器

| 触发器名 | 表 | 时机 | 函数 |
|----------|-----|------|------|
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` |
| `handle_profiles_updated_at` | `profiles` | BEFORE UPDATE | `handle_updated_at()` |
| `handle_listings_updated_at` | `listings` | BEFORE UPDATE | `handle_updated_at()` |

---

## 附录：类型对应关系

数据库字段与 `lib/types.ts` 中 TypeScript 类型的对应：

| 数据库表 | TypeScript 类型 | 说明 |
|----------|-----------------|------|
| profiles | `Profile` | 完整字段 |
| categories | `Category` | 完整字段 |
| listings（公开） | `ListingPublic` | 不含隐藏字段，含 seller/category 关联 |
| listings（完整） | `ListingFull` | 继承 ListingPublic，含 hidden_price/hidden_whatsapp/market_report |
| orders | `Order` | 完整字段 |
| — | `ExploreCategory` | Explore Items 聚合视图类型（非数据库表） |
| — | `ApiResponse<T>` | API 统一响应包装类型 |
