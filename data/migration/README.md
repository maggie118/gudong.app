# 数据源迁移：Airtable → 仓库 CSV / Google 表格

Airtable 免费版每月只有 1000 次 API 调用，而一次部署要拉 items + sellers 两张表，
一个月几次部署就会耗尽（返回 `PUBLIC_API_BILLING_LIMIT_EXCEEDED`），构建回退到仓库里的
旧快照，线上会出现藏品、藏馆「凭空消失」。因此数据源已改为下面两条路，都不受 Airtable 额度限制。

## 现在的默认方式：仓库内 CSV（已在用）

- `data/items.csv` — 藏品表，24 行
- `data/sellers.csv` — 卖家 / 专属藏馆表，9 行

`scripts/refresh-listings.js` 在每次构建时读这两份 CSV，生成 `data/listings.json`，
后面的静态页、藏馆页、情报全部沿用原有逻辑，所以 SEO / 页面 / 分享卡片的行为没有变化。

**日常怎么改**
1. 下载 `data/items.csv` / `data/sellers.csv`，用 Excel 或 Numbers 打开编辑
2. 存成 UTF-8 CSV（Excel 里选「CSV UTF-8（逗号分隔）」），覆盖回仓库同路径
3. 提交并触发部署，线上即同步

字段约定（改错这几列会直接导致页面出错）：
- 布尔列一律写 `TRUE` / `FALSE`：`has_surface_wear`、`has_surface_damage`、`is_today_finds`、`is_new_listing`、`gallery`（sellers 表）
- `img_file` 是空格分隔的多图列表，例如 `sun/item-sun-04.jpg sun/item-sun-04b.jpg`（相对 `assets/images/`）
- `status` 只认 `active`，其它值会被过滤掉
- `seller_id` 必须与 `sellers.csv` 中的 `seller_id` 完全一致（不要带多余空格）
- `gallery=TRUE` 才会生成私家藏馆页并出现在 `/sellers`；`founding_no` 填了就显示创始卖家席号
- 日期写 `YYYY-MM-DD`；`listed_at` 留空则规则上不会有 6 个月到期日

### 「今日发现」的入选规则（重要）

今日发现是**付了私家藏馆费才有的首页曝光位**，不是编辑随手挑：

- **私家藏馆免费 7 天**：`sellers.csv` 里 `gallery=TRUE` 且填了 `gallery_started_at` 的卖家，
  从开馆当天起 7 天内，店内藏品自动进入今日发现候选池；第 8 天起自动退出，无需人工清理
- **单独买曝光位**：藏品表勾 `is_today_finds=TRUE` 即视为买位；如填了 `exposure_until`，
  过了该日期自动掉出
- **可选档位**：`exposure_tier` 数字越大越靠前（没填按 1 档）
- 排序 = 档位高者优先 → 同档位先到期者优先 → 上架早者优先；同一卖家在队列前排有数量上限，
  不会让一家占满整屏
- 首页只展示 4 件，按卖家轮转取样（保证每件在有效期内都能轮到），点「换一批」看下一组

## 想用 Google 表格界面编辑（可选，代码已支持）

1. 新建一个 Google 表格，建两个工作表，命名必须是 `items` 和 `sellers`
2. 分别把 `data/items.csv`、`data/sellers.csv` 导入到对应工作表（「文件 → 导入 → 上传」，选「替换当前工作表」）
3. 右上角「共享」→ 通用访问 → **知道链接的任何人（查看者）**
4. 在 Vercel 项目环境变量里加 `SHEET_ID=<表格 URL 里 /d/ 与 /edit 之间那串>`
   （可选：`SHEET_TAB_ITEMS` / `SHEET_TAB_SELLERS` 改工作表名，默认就是 items / sellers）
5. 重新部署。构建日志会出现「数据源：Google 表格 …」，说明已切过去

取数走的是 `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=items`
这种公开 CSV 导出，不需要 API key、不消耗任何额度。配置了 `SHEET_ID` 时优先生效；
未配置则自动读仓库 CSV；两者都没有才回退到 Airtable（保留这条是为了应急）。

> 注意：Google 表格是「当前状态」，仓库 CSV 是「版本快照」。用表格编辑时，定期把表格导出成
> CSV 覆盖回 `data/` 再提交一次，仓库里就始终有可回溯的历史版本。

## 本地自检

```bash
node scripts/refresh-listings.js     # 只跑取数，看日志里打印的是哪个数据源、多少行
npm run build                        # 完整构建链
```

临时用本地目录里的 CSV 调试（不联网）：

```bash
SHEET_ID=local SHEET_LOCAL_DIR=data/migration node scripts/refresh-listings.js
```
