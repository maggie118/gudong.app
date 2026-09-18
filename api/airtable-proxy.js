// /api/airtable-proxy.js
// Vercel Serverless Function — 读取 Airtable 真实数据
// 环境变量：AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN

const BASE  = process.env.AIRTABLE_BASE_ID;   // ← 注意是 _ID 后缀，对齐 Vercel 变量名
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;

// 内部字段：不对外输出（不删 price_display_*，暂时保持前端兼容）
const STRIP_PREFIX = ['校验_'];
const STRIP_EXACT  = [];

function shouldStrip(key) {
  if (STRIP_EXACT.includes(key)) return true;
  return STRIP_PREFIX.some(p => key.startsWith(p));
}

// 拉全量（自动翻页，突破 100 条上限）
async function fetchAllRecords() {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`airtable ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    records.push(...(j.records || []));
    offset = j.offset || null;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  // ---------- CORS ----------
  const origin = req.headers.origin || '';
  const allowed = ['https://gudong.app', 'https://www.gudong.app'];
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);

  if (allowed.includes(origin) || isLocal) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (req.method !== 'OPTIONS') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ---------- 环境变量检查 ----------
  if (!BASE || !TABLE || !TOKEN) {
    console.error('[proxy] env missing', {
      BASE: !!BASE, TABLE: !!TABLE, TOKEN: !!TOKEN,
    });
    return res.status(500).json({
      error: 'Airtable env vars missing',
      missing: {
        AIRTABLE_BASE_ID: !BASE,
        AIRTABLE_TABLE:   !TABLE,
        AIRTABLE_TOKEN:   !TOKEN,
      },
    });
  }

  // ---------- 查询参数 ----------
  const q   = String(req.query.q   || '').trim().toLowerCase();
  const cat = String(req.query.cat || 'all').trim();

  try {
    const rawRecords = await fetchAllRecords();

    // 清洗：字段剥离 + 补 item_id / _createdTime
    let items = rawRecords
      .filter(rec => {
        const st = String(rec.fields.status || 'active').toLowerCase();
        return st !== 'archived' && st !== 'deleted';
      })
      .map(rec => {
        const out = {
          item_id: rec.fields.item_id || rec.id,   // 优先用字段里的 item_id
          _createdTime: rec.createdTime,
        };
        for (const [k, v] of Object.entries(rec.fields)) {
          if (shouldStrip(k)) continue;
          out[k] = v;
        }
        return out;
      });

    // ---------- 关键词搜索（覆盖全字段） ----------
    if (q) {
      items = items.filter(f => {
        const hay = [
          f.title_zh, f.title_en,
          f.desc_zh,  f.desc_en,
          f.era_zh,   f.era_en,
          f.category,
          f.material_zh, f.material_en,
          f.kiln_zh,     f.kiln_en,
          f.mark_zh,     f.mark_en,
          f.certificate_no,
          f.seller_name_zh, f.seller_name_en,
          f.tags,
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    // ---------- 分类过滤 ----------
    if (cat && cat !== 'all') {
      const map = {
        porcelain: '瓷器', jade: '玉器', coins: '钱币',
        paintings: '书画', misc: '杂项',
      };
      const cn = map[cat];
      if (cn) items = items.filter(f => f.category === cn);
    }

    // ---------- 排序：新的在前 ----------
    items.sort((a, b) =>
      String(b._createdTime || '').localeCompare(String(a._createdTime || ''))
    );

    // ---------- 输出 ----------
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      todayFinds:  items.filter(f => f.is_today_finds),
      editorPicks: items.filter(f => f.is_editor_picks),
      newListing:  items,
      sellers:     [],            // 暂时返回空，前端已有兜底；后续再单独接 seller 表
      total:       items.length,
    });

  } catch (e) {
    console.error('[airtable-proxy]', e.message);
    return res.status(502).json({
      error: 'Upstream failed',
      detail: e.message,
    });
  }
}