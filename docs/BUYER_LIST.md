# 买家名单（Buyer List）— 上线说明

> 2026-11-07 新增。目标：把「逛一次就走」的买家，变成**可再次触达的名单资产**。
> 前端已全站接好；`buyer_leads` 表已在 base `apprn6XDQnAm8bkaT` 建好（9 个字段全部就位，0 条记录）。
> 仍差一步：`AIRTABLE_TOKEN` 需要 **data.records:write** 权限（当前 Token 只能读，写入会 403）。

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

## 2. 建表（已完成）与权限

`buyer_leads` 表已于 2026-11-07 在 base `apprn6XDQnAm8bkaT` 建好，字段如下（一字不差，代码按名读写）：

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
| `name` | Single line text | 称呼（2026-11-09 起，藏品页询价弹层必填） |
| `intent` | Single line text | 意向：`自用收藏` / `送礼` / `投资考量` / `只是询价` |
| `item_id` | Single line text | 所询藏品 ID（如 `item-limck-01`） |
| `item_title` | Single line text | 所询藏品名（中文优先） |
| `consent_at` | Single line text | 同意隐私政策的时间（ISO，UTC） |

> 后 5 个字段是 2026-11-09 询价身份确认上线时加的；若没建好，`/api/lead` 会自动降级，把称呼/意向/藏品打包进 `follows`。


可选环境变量：`BUYER_LEADS_TABLE`（默认就是 `buyer_leads`）。已有的 `AIRTABLE_BASE_ID`、`AIRTABLE_TOKEN` 直接复用。

**Token 权限（关键）**：`AIRTABLE_TOKEN` 必须带 `data.records:write`（同时通常需要 `data.records:read`，退订按 `contact` 反查要用）。2026-11-07 实测：现有 Token 能读 `buyer_leads`（GET 200），但 POST 返回
`403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND` —— 这是**只读** Token。修复：Airtable → Developer hub → Personal access tokens → 新建/改权限，勾上 `data.records:write`，Access 里选 base「Gudong」(`apprn6XDQnAm8bkaT`) → 把新值写进 Vercel 的 `AIRTABLE_TOKEN` → 重新部署。改完前后端代码一行都不用动。

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
- `{"ok":false,"code":"store_error"}` → 表在、字段对，但 Token 没写权限（或额度受限）。见上一节。

## 4. 边界（写清楚，别对外夸大）

- **Web Push** 只能推给点过「允许通知」的浏览器，不是邮箱/WhatsApp 群发。
- 名单里的 WhatsApp / 邮箱目前用于**人工或后续营销工具触达**；项目内还没有接邮件服务商（Resend / Mailgun 之类）和 WhatsApp Business API，所以「自动按品类群发邮件」尚未实现。
- 联系方式只用于上新提醒，页面已写明不公开、不转卖；退订会把 `status` 改成 `unsubscribed`，但不会删除历史记录（便于审计）。
- 频率限制按实例内存做（同 IP 10 分钟 8 次），Vercel 多实例下是弱限流，不替代平台风控。

## 5. 怎么用这份名单

1. Airtable 视图按 `created_at` 倒序 → 每周看新增买家。
2. 按 `follows` 里的品类分组，新上架时人工挑人发 WhatsApp（转化率最高的一步）。
3. 满 100 条左右再接邮件服务商做自动化，别一上来就群发——名单小的时候，人工发更像藏家之间的介绍。

## 6. 月度归档（导出 → 清理 → 再进新的）

```powershell
pwsh -File scripts/archive-buyer-leads.ps1          # 全量导出 + 去重 + 统计
pwsh -File scripts/archive-buyer-leads.ps1 -KeepRaw # 额外保留未去重原始表，便于核对
pwsh -File scripts/archive-buyer-leads.ps1 -SelfTest # 不联网，验证归并逻辑
```

- 只读：脚本只 `GET`，不写入不删除。
- 输出到 `.archive/`（已 gitignore，含联系方式，**不要提交、不要公开发**）：`buyer-leads-YYYYMMDD-HHmm.csv` + 同名 `-summary.txt`，每次跑递增，不覆盖历史。
- 去重规则：按 `contact` 归并（邮箱小写、手机只留数字）→ `created_at` 取最新、`status` 取最严重（`unsubscribed` 优先）、`follows` 取并集、`submissions` 记录提交次数。
- `created_at` 存 UTC，CSV 里另给 `created_at_sgt`（+8，新加坡本地时间）。
- 额度告警：原始记录 ≥800 提醒、≥960 危险（免费版单表约 1000 条上限）。

清理顺序（先导出核对行数，再删）：

1. **不能删**：`status = unsubscribed`（"别联系"压制名单，删了下次同一人再留邮箱会以 active 重新入表，属合规风险）。
2. **不能删**：还在跟的 active 买家（`follows` 有内容），删了等于清空推送对象。
3. 可删：已导出 + 已触达 + 非 unsubscribed + 非近期仍在跟的那批。
4. 删完再点一次「关注此藏家」冒烟，确认写入仍通。