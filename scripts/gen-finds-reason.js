// scripts/gen-finds-reason.js
// 给「行家私语」补文案：只填空着的 reason_zh / reason_en，表里已写的一律不动。
// 用词只写「看什么」与卖家已如实标注的事实（年代、款识、品相、价格），不做真伪判断，
// 与平台「不鉴定、只记录藏家自述」的口径一致。
//
// 在 build 里排在 refresh-listings.js 之后：listings.json 每次部署都是新拉的，
// 新藏品如果没有人工私语，这里会补一句；填过的人工文案原样保留。
// 用法：node scripts/gen-finds-reason.js [listings.json 路径]

const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.join(path.resolve(__dirname, '..'), 'data', 'listings.json');

const CATS = ['瓷器', '玉器', '铜器', '钱币', '书画', '杂项'];

function catOf(raw) {
  const v = String(raw || '').trim();
  if (CATS.includes(v)) return v;
  if (/瓷|ceramic|porcelain/i.test(v)) return '瓷器';
  if (/玉|jade/i.test(v)) return '玉器';
  if (/铜|bronze/i.test(v)) return '铜器';
  if (/钱|币|coin|numismat/i.test(v)) return '钱币';
  if (/书|画|painting|calligraph/i.test(v)) return '书画';
  return '杂项';
}

// 稳定散列：同一件藏品的措辞每次都一样，不会因部署而变
function seedOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return h;
}
function pick(arr, seed) { return arr[seed % arr.length]; }

// ---- 看点：按标题里的工艺/釉色分材质，每种材质 3 句轮换 ----
function materialZh(cat, title) {
  const t = String(title || '');
  if (cat === '瓷器') {
    if (/青花釉里红|釉里红/.test(t)) return 'blueRed';
    if (/青花/.test(t)) return 'blueWhite';
    if (/粉彩|洋彩/.test(t)) return 'familleRose';
    if (/五彩|斗彩|珐琅/.test(t)) return 'polychrome';
    if (/矾红/.test(t)) return 'ironRed';
    if (/窑变|钧红|郎窑红|祭红|红釉/.test(t)) return 'flambe';
    if (/霁蓝|蓝地|蓝釉/.test(t)) return 'blue';
    if (/哥釉|汝釉|官窑|青釉|粉青/.test(t)) return 'celadon';
    if (/黄地|绿地/.test(t)) return 'ground';
    if (/三彩/.test(t)) return 'sancai';
    return 'porcelain';
  }
  if (cat === '钱币') return 'coin';
  if (cat === '玉器') return 'jade';
  if (cat === '铜器') return 'bronze';
  if (cat === '书画') return 'painting';
  return 'misc';
}

const LOOK_ZH = {
  blueWhite: [
    '青花看发色是否沉、笔意是否连贯，釉面别浮亮',
    '青花先看钴料发色，再看笔触有没有停顿与交代',
    '青花的层次靠分水，深浅过渡顺不顺一眼能看出',
  ],
  blueRed: [
    '青花釉里红难点在两种温度，红发得稳不稳是重点',
    '釉里红看红色是否沉得住，青花与红的呼应是否自然',
  ],
  familleRose: [
    '粉彩看彩料堆叠与过渡，彩面应有柔和的蛤蜊光',
    '粉彩先看彩料厚薄，再看花瓣枝叶的晕染是否自然',
  ],
  polychrome: [
    '彩瓷看色料的层次与衔接，边线是否利落',
    '五彩斗彩看填彩是否压线，色与线交代得清不清',
  ],
  ironRed: ['矾红看红色是否沉实，细笔处有没有发灰'],
  flambe: [
    '窑变看釉色流动是否自然，红蓝交界处最见功夫',
    '红釉看口沿是否自然脱釉、釉面光泽是否内敛',
  ],
  blue: ['霁蓝看釉色是否匀净，口沿与积釉处最易露破绽'],
  celadon: ['青釉看釉质肥厚度与开片，光泽宜温润不刺眼'],
  ground: ['色地看地色是否均匀，彩绘处与地色的交界最考工艺'],
  sancai: ['三彩看釉面流动与开片，釉与胎的结合处要自然'],
  porcelain: [
    '瓷器看胎釉、纹饰与圈足修整，三处能互相印证',
    '瓷器先看釉面与圈足，再看纹饰的画工与布局',
  ],
  coin: [
    '银币看点集中在字口、齿边与重量，三者对得上才谈品相',
    '钱币先看字口深浅与齿边规整，再看包浆是否贴骨',
  ],
  jade: [
    '玉器看玉质细度与绺裂，自然光下最清楚；工艺看收刀是否利落',
    '玉器先看玉质与沁色，再看打磨抛光是否一致',
  ],
  bronze: [
    '铜器看皮壳、铸痕与重量，三者对照；敲击声宜沉稳不尖',
    '铜器先看皮壳层次，再看范线与垫片痕迹是否自然',
  ],
  painting: ['书画看纸绢、墨色与款识递藏，三处对照再谈时代'],
  misc: ['杂项看材质与工艺细节，图上看不出的一定要上手'],
};

const LOOK_EN = {
  blueWhite: [
    'Blue-and-white: the cobalt should sit deep and the brushwork should read continuously; a glassy-sharp glaze is a warning',
    'Blue-and-white: read the cobalt first, then whether the brushwork pauses and resolves',
  ],
  blueRed: [
    'Blue-and-white with underglaze red: two firing temperatures — the red should stay controlled, not blown',
  ],
  familleRose: [
    'Famille rose: check how the enamels layer and soften; gentle iridescence on the enamel surface is expected',
    'Famille rose: enamel thickness first, then how petals and leaves are shaded',
  ],
  polychrome: [
    'Polychrome: colour should layer cleanly and outlines should stay crisp',
  ],
  ironRed: ['Iron red: the red should read dense, not ashen at the fine strokes'],
  flambe: [
    'Flambe glaze: the colour should flow naturally; the red-blue boundary shows the control',
    'Red glaze: look for natural glaze pull-back at the rim and a restrained surface',
  ],
  blue: ['Sacrificial blue: evenness across the body; rim and pooling are where faults show'],
  celadon: ['Celadon: glaze thickness and crackle; the surface should feel soft, not shiny'],
  ground: ['Coloured ground: evenness of the ground, and how the painted areas meet it'],
  sancai: ['Sancai: glaze flow and crackle; the glaze-to-body junction should look natural'],
  porcelain: [
    'Porcelain: body, glaze, decoration and foot-ring should agree with one another',
    'Porcelain: glaze and foot first, then the drawing and composition of the decoration',
  ],
  coin: [
    'Coins: characters, edge milling and weight should line up before condition is discussed',
    'Coins: depth of the characters and the regularity of the milling, then whether the patina sits on the metal',
  ],
  jade: [
    'Jade: grain and inclusions read best in daylight; check how the carving finishes',
    'Jade: stone quality and staining first, then consistency of the polish',
  ],
  bronze: [
    'Bronze: patina, casting marks and weight should agree; the ring should be low, not shrill',
    'Bronze: layers of patina first, then whether mould seams and spacers look natural',
  ],
  painting: ['Paintings: paper or silk, ink tone and inscriptions should corroborate each other'],
  misc: ['Works of art: material and workmanship first; anything unclear in photos needs handling'],
};

// 款识：标题里出现「××年制款 / 御制款」时点一句（引号里不带末尾的「款」字）
function sealZh(title) {
  const hit = String(title || '').match(/((?:大清)?[\u4e00-\u9fa5]{1,4}(?:年制|御制))款/);
  return hit ? `款识作「${hit[1]}」` : '';
}
function sealEn(title) {
  const hit = String(title || '').match(/((?:大清)?[\u4e00-\u9fa5]{1,4}(?:年制|御制))款/);
  return hit ? `marked “${hit[1]}”` : '';
}

function condZh(f, seed) {
  const wear = f.has_surface_wear === true;
  const dmg = f.has_surface_damage === true;
  if (wear && dmg) return '卖家如实标注表面有磨损及破损，按品相议价更合适';
  if (wear) return pick(['卖家标注表面轻微磨损', '品相按卖家标注：表面有轻微磨损', '表面轻微磨损已由卖家标注'], seed);
  if (dmg) return pick(['卖家标注表面有破损', '品相按卖家标注：表面有破损'], seed);
  return pick(['卖家标注品相完整', '品相按卖家标注为完整', '卖家自述品相完整'], seed);
}
function condEn(f, seed) {
  const wear = f.has_surface_wear === true;
  const dmg = f.has_surface_damage === true;
  if (wear && dmg) return 'seller notes surface wear and damage — price accordingly';
  if (wear) return 'seller notes minor surface wear';
  if (dmg) return 'seller notes surface damage';
  return 'seller notes it as intact';
}

function priceZh(f, seed) {
  const type = String(f.price_type || '').trim();
  if (/私聊|询价|面议|enquir|inquir|message/i.test(type)) return pick(['价格私聊', '价格私聊，欢迎直接问'], seed);
  const fixed = Number(f.fixed_price);
  if (isFinite(fixed) && fixed > 0) {
    return pick([`一口价 S$${fmt(fixed)}，可与同类横向比`, `标价 S$${fmt(fixed)}，可对比同类再谈`], seed);
  }
  const lo = Number(f.price_min), hi = Number(f.price_max);
  if (isFinite(lo) && lo > 0 && isFinite(hi) && hi > 0) return `报价区间 S$${fmt(lo)}–${fmt(hi)}`;
  if (isFinite(lo) && lo > 0) return `S$${fmt(lo)} 起`;
  return '';
}
function priceEn(f, seed) {
  const type = String(f.price_type || '').trim();
  if (/私聊|询价|面议|enquir|inquir|message/i.test(type)) return 'price on enquiry';
  const fixed = Number(f.fixed_price);
  if (isFinite(fixed) && fixed > 0) return `fixed at S$${fmt(fixed)} — worth comparing with peers`;
  const lo = Number(f.price_min), hi = Number(f.price_max);
  if (isFinite(lo) && lo > 0 && isFinite(hi) && hi > 0) return `range S$${fmt(lo)}–${fmt(hi)}`;
  if (isFinite(lo) && lo > 0) return `from S$${fmt(lo)}`;
  return '';
}
function fmt(n) { return Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 }); }

function build(f) {
  const seed = seedOf(String(f.item_id || f.title_zh || '').replace(/[^a-zA-Z0-9-]/g, '') || 'x');
  const cat = catOf(f.category);
  const mat = materialZh(cat, f.title_zh); // 中英都用中文标题判材质，英文标题常缺工艺词

  const zh = [pick(LOOK_ZH[mat] || LOOK_ZH.misc, seed)]
    .concat(sealZh(f.title_zh) ? [sealZh(f.title_zh)] : [])
    .concat([condZh(f, seed)])
    .concat(priceZh(f, seed) ? [priceZh(f, seed)] : [])
    .join('；') + '。';

  const en = [pick(LOOK_EN[mat] || LOOK_EN.misc, seed)]
    .concat(sealEn(f.title_zh) ? [sealEn(f.title_zh)] : [])
    .concat([condEn(f, seed)])
    .concat(priceEn(f, seed) ? [priceEn(f, seed)] : [])
    .join('; ') + '.';

  return { zh, en };
}

function main() {
  let db;
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { console.log('[gen-finds-reason] listings.json 读取失败，跳过:', e.message); return; }

  // listings.json 里 newListing / todayFinds / editorPicks 是各自独立的副本，
  // 只在 newListing 上填会让「今日发现」卡片仍是空私语，所以三处都填（同一 item_id 文案一致）
  const all = [];
  for (const key of ['newListing', 'todayFinds', 'editorPicks']) {
    if (Array.isArray(db[key])) all.push(...db[key]);
  }
  const cache = new Map();
  let filled = 0, kept = 0;
  for (const f of all) {
    const hasZh = String(f.reason_zh || '').trim();
    const hasEn = String(f.reason_en || '').trim();
    if (hasZh && hasEn) { kept++; continue; }
    const id = String(f.item_id || '');
    let r = cache.get(id);
    if (!r) { r = build(f); cache.set(id, r); }
    if (!hasZh) f.reason_zh = r.zh;
    if (!hasEn) f.reason_en = r.en;
    filled++;
  }
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`[gen-finds-reason] 补写 ${filled} 条行家私语，保留人工文案 ${kept} 条`);
}

main();
