# 买家名单（Buyer List）— 上线说明

> 2026-11-07 新增。目标：把「逛一次就走」的买家，变成**可再次触达的名单资产**。
> 前端已全站接好，后端只差一张 Airtable 表。

## 1. 已经做了什么

| 位置 | 买家能做什么 | 落库 |
|---|---|---|
| 首页 `#buyer-list` | 留 WhatsApp / 邮箱，勾选品类，可选开浏览器通知 | `buyer_leads` + 本机 |
| 藏家名录 `sellers/index.html` | 同上（可按品类关注） | 同上 |
| 5 个藏家主页 | 关注此藏家 → 面板留联系方式 | 同上，带 `seller` |
| 18 个藏品详情页 | 关注此藏家 → 面板留联系方式 | 同上，带 `seller` |
| 页头铃铛（原有） | Web Push 上新通知 | `push_subs` |

写入逻辑：`assets/js/buyer-list.js` → `POST /api/lead` → Airtable `buyer_leads`。
同时本地 `localStorage.gudong_buyer` 存一份，页面刷新后输入框自动回填；`gudong_follow` 继续负责「关注了谁」（我的收藏页可用）。

**降级策略**：表没建、字段对不上、额度受限时，`/api/lead` 返回 `202 {ok:false, code:'table_missing'}`，前端仍然显示「已加入名单（名单同步稍后完成，本机提醒已生效）」，不会把买家挡在门外。

## 2. 上线前必须做的一步：建表

Airtable → 当前 base（`apprn6XDQnAm8bkaT`）→ 新建表 **`buyer_leads`**，字段：

| 字段名（必须一字不差） | 类型 | 说明 |
|---|---|---|
| `contact` | Single line text | 主键用途：WhatsApp（如 `+6591234567`）或邮箱（小写） |
| `contact_type` | Single line text | `whatsapp` / `email` |
| `seller` | Single line text | 藏家 ID（如 `Lim-KW`），首页/名录为空 |
| `source` | Single line text | `home` / `sellers-index` / `seller-page` / `item-page` |
| `lang` | Single line text | `zh` / `en` |
| `page` | Single line text | 提交页路径 |
| `follows` | Long text | 形如 `seller:lim-kw; tag:瓷器` |
| `created_at` | Single line text | ISO 时间（也可改 Date 类型） |
| `status` | Single line text | `active` / `unsubscribed` |

可选环境变量：`BUYER_LEADS_TABLE`（默认就是 `buyer_leads`）。已有的 `AIRTABLE_BASE_ID`、`AIRTABLE_TOKEN` 直接复用。
`push_subs` 表如想记录「这条订阅关注了哪个藏家」，可加 `seller`、`contact`、`contact_type` 三个字段；不加也能正常订阅（`api/subscribe.js` 会自动退回最小字段集）。

## 3. 验证

```bash
curl -X POST https://www.gudong.app/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"contact":"+6591234567","contact_type":"whatsapp","seller":"Lim-KW","source":"smoke","follows":[{"type":"tag","term":"瓷器"}],"lang":"zh","page":"/pricing.html"}'
```

- `{"ok":true,"id":"rec..."}` → 通了，去 Airtable 看记录。
- `{"ok":false,"code":"store_unconfigured"}` → Vercel 没配 `AIRTABLE_BASE_ID` / `AIRTABLE_TOKEN`。
- `{"ok":false,"code":"table_missing"}` → 表名不对，或表还没建。
- `{"ok":false,"code":"field_mismatch"}` → 字段名和上表不一致（大小写也算）。

## 4. 边界（写清楚，别对外夸大）

- **Web Push** 只能推给点过「允许通知」的浏览器，不是邮箱/WhatsApp 群发。
- 名单里的 WhatsApp / 邮箱目前用于**人工或后续营销工具触达**；项目内还没有接邮件服务商（Resend / Mailgun 之类）和 WhatsApp Business API，所以「自动按品类群发邮件」尚未实现。
- 联系方式只用于上新提醒，页面已写明不公开、不转卖；退订会把 `status` 改成 `unsubscribed`，但不会删除历史记录（便于审计）。
- 频率限制按实例内存做（同 IP 10 分钟 8 次），Vercel 多实例下是弱限流，不替代平台风控。

## 5. 怎么用这份名单

1. Airtable 视图按 `created_at` 倒序 → 每周看新增买家。
2. 按 `follows` 里的品类分组，新上架时人工挑人发 WhatsApp（转化率最高的一步）。
3. 满 100 条左右再接邮件服务商做自动化，别一上来就群发——名单小的时候，人工发更像藏家之间的介绍。
