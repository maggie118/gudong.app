# 创始藏家编号分配表（Founding Collector Numbers）

**用途**：给每位创始藏家分配全局唯一的「创始藏家编号」，避免重复、方便统一管理。
编号会出现在 3 处：卖家页头部徽章、卖家页馆主信息栏、该藏家各藏品详情页徽章。

**规则**：
- 编号 **全局唯一**，每位藏家一个号，不得与他人重复。
- 分配后立即在本表登记，再改页面里的 `badge-num`。
- 目前已分配：**Ng-CY = 001**。

---

## 分配表

| 创始编号 | 藏家/商号 | Seller ID | 卖家页 | 状态 | 分配日期 |
|---------|-----------|-----------|--------|------|---------|
| 001 | 博古斋 Ng CY Antiques | Ng-CY | sellers/seller-ng-cy-antiques.html | ✅ 已分配 | 2026-11-04 |
| 002 | 林记古玩 Lim KW Antiques | Lim-KW | sellers/seller-lim-kw-antiques.html | ⏳ 待分配 | — |
| 003 | 古韵斋 Yak BC Antiques | Yak-BC | sellers/seller-yak-bc-antiques.html | ⏳ 待分配 | — |
| 004 | 聚珍阁 Ng LK Antiques | Ng-LK | sellers/seller-ng-lk-antiques.html | ⏳ 待分配 | — |
| 005 | 林氏 Lim CK Antiques | Lim-CK | sellers/seller-lim-ck.html | ⏳ 待分配 | — |

> 注：002–005 的编号为**示例占位**，实际顺序按你确认的分配为准；如需调整改本表即可。
> 另：当前各藏品页创始徽章默认显示「18」（意为 18 位创始藏家之一）；只有已被分配编号的藏家，其藏品页才改成对应编号。

---

## 如何新增一位藏家的编号（数据驱动，无需手工改页）

编号已接入**数据层 + 生成链**，页面由脚本生成、不再手工改：

1. 在本表追加一行，取下一个未用编号（全局唯一）。
2. **Airtable Sellers 表**新增字段 `founding_no`，为这位藏家填上编号（如 `001`）；
   同时（或先在本地）更新 `data/listings.json` 里该卖家的 `founding_no` 字段。
3. 部署时 `scripts/build-sellers.js` 会自动：卖家页徽章 + 馆主信息栏注入该号；
   `item.html`（线上藏品页实际模板）按卖家 `founding_no` 实时渲染藏品页徽章；
   目录页 `sellers/index.html` 该藏家卡片自动带同号。
4. **未分配编号的藏家不显示任何号**（生成时整段移除），不会误用占位。

> ⚠️ **部署注意**：`founding_no` 的**权威来源是 Airtable Sellers 表**。若 Airtable API 配额恢复，
> `refresh-listings.js` 会用 Airtable 数据**覆盖** `listings.json`——若 Airtable 表里没填该字段，
> 编号会被抹掉。所以给某位藏家定号时，务必**同时**在 Airtable 表填 `founding_no`，再部署。

**技术落点**（编号贯穿的数据流）：
- `scripts/refresh-listings.js` → `mapSeller()` 读取 `founding_no`（兼容 `Founding No/创始编号/创始藏家编号` 等字段名）。
- `scripts/build-sellers.js` → `buildPage()` 注入卖家页徽章/信息栏；`buildIndex()` 注入目录卡片。
- `item.html` → `setSellerCard()` 按卖家 `founding_no` 写入徽章 `#sellerFoundingNo`。
- 分配表（本文件）为**业务登记簿**；Airtable 表为**线上数据源**。
