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
    '青花看青白交界是否干净，留白处的釉最见功底',
    '青花纹饰看构图疏密，主次交代清楚才耐看',
  ],
  blueRed: [
    '青花釉里红难点在两种温度，红发得稳不稳是重点',
    '釉里红看红色是否沉得住，青花与红的呼应是否自然',
    '青花釉里红看红彩有无泛紫发黑，这是火候的直接证据',
  ],
  familleRose: [
    '粉彩看彩料堆叠与过渡，彩面应有柔和的蛤蜊光',
    '粉彩先看彩料厚薄，再看花瓣枝叶的晕染是否自然',
    '粉彩看雪白底的净度与彩料的粉质感，轧道工艺另说',
  ],
  polychrome: [
    '彩瓷看色料的层次与衔接，边线是否利落',
    '五彩斗彩看填彩是否压线，色与线交代得清不清',
    '彩瓷看釉上彩有无磨损脱彩，最容易在口沿与折角处先掉',
  ],
  ironRed: ['矾红看红色是否沉实，细笔处有没有发灰', '矾红看红彩薄厚是否均匀，过薄处容易见底'],
  flambe: [
    '窑变看釉色流动是否自然，红蓝交界处最见功夫',
    '红釉看口沿是否自然脱釉、釉面光泽是否内敛',
    '窑变看铜红发色是否沉稳，流纹是否顺器型而下',
  ],
  blue: ['霁蓝看釉色是否匀净，口沿与积釉处最易露破绽'],
  celadon: ['青釉看釉质肥厚度与开片，光泽宜温润不刺眼', '青釉看开片是否自然、釉层是否通透', '哥釉看开片的疏密与深浅，铁线金丝要交代得清', '青釉看积釉处是否泛水光，釉薄处露出胎色才自然'],
  ground: ['色地看地色是否均匀，彩绘处与地色的交界最考工艺'],
  sancai: ['三彩看釉面流动与开片，釉与胎的结合处要自然'],
  porcelain: [
    '瓷器看胎釉、纹饰与圈足修整，三处能互相印证',
    '瓷器先看釉面与圈足，再看纹饰的画工与布局',
    '瓷器看器型线条是否挺拔，肩腹转折处最见修坯功夫',
    '瓷器看釉面有无桔皮与缩釉点，老釉的温润感仿不出来',
  ],
  coin: [
    '银币看字口、齿边与重量三者是否互相对得上',
    '钱币先看字口深浅与齿边规整，再看包浆是否贴骨',
    '钱币看地章是否平整、字口是否锋利，边齿的规律性最关键',
    '钱币看包浆层次是否自然，擦痕与流通痕要分得清',
    '银币看龙鳞与文字的压印深浅，边齿的均匀度最易被忽略',
  ],
  jade: [
    '玉器看玉质细度与绺裂，自然光下最清楚，工艺看收刀是否利落',
    '玉器先看玉质与沁色，再看打磨抛光是否一致',
    '玉器看阴线是否一刀到底，转弯处的接刀最能看出工手',
  ],
  bronze: [
    '铜器看皮壳、铸痕与重量，三者对照，敲击声宜沉稳不尖',
    '铜器先看皮壳层次，再看范线与垫片痕迹是否自然',
    '铜器看铭文与纹饰的铸造痕迹，范缝位置最能说明做法',
  ],
  painting: [
    '书画看纸绢、墨色与款识递藏，三处对照再谈时代',
    '书画看用笔的起收与墨色层次，装裱与纸绢年份也要对上',
  ],
  misc: [
    '杂项看材质与工艺细节，图上看不出的一定要上手',
    '杂项看做工的收口与打磨，细节处理得干不干净最能说明水准',
  ],
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

function fmt(n) { return Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 }); }

// 同材质挑一句尚未用过的，避免一页看到三张卡片都写同一句话；用完一轮再从头轮换
function pickFresh(arr, seed, used) {
  const start = seed % arr.length;
  for (let k = 0; k < arr.length; k++) {
    const cand = arr[(start + k) % arr.length];
    if (!used.has(cand)) { used.add(cand); return cand; }
  }
  return arr[start];
}

function build(f, usedZh, usedEn) {
  const seed = seedOf(String(f.item_id || f.title_zh || '').replace(/[^a-zA-Z0-9-]/g, '') || 'x');
  const cat = catOf(f.category);
  const mat = materialZh(cat, f.title_zh); // 中英都用中文标题判材质，英文标题常缺工艺词

  // 只写一句话，只讲这件东西该看什么（工艺/釉色/字口等），
  // 不写品相套话、不写价格（卖家已在规格区标明，私语里重复只会显得敷衍）。
  const zhBody = pickFresh(LOOK_ZH[mat] || LOOK_ZH.misc, seed, usedZh);
  const seal = sealZh(f.title_zh);
  const zh = zhBody + (seal ? `，${seal}` : '') + '。';

  const enBody = pickFresh(LOOK_EN[mat] || LOOK_EN.misc, seed, usedEn);
  const sealE = sealEn(f.title_zh);
  const en = enBody + (sealE ? `; ${sealE}` : '') + '.';

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
  const usedZh = new Set(), usedEn = new Set();
  let filled = 0, kept = 0;
  for (const f of all) {
    const hasZh = String(f.reason_zh || '').trim();
    const hasEn = String(f.reason_en || '').trim();
    if (hasZh && hasEn) { kept++; continue; }
    const id = String(f.item_id || '');
    let r = cache.get(id);
    if (!r) { r = build(f, usedZh, usedEn); cache.set(id, r); }
    if (!hasZh) f.reason_zh = r.zh;
    if (!hasEn) f.reason_en = r.en;
    filled++;
  }
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`[gen-finds-reason] 补写 ${filled} 条行家私语，保留人工文案 ${kept} 条`);
}

main();
