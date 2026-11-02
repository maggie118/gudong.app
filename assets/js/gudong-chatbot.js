/* ============ Gudong 社区引导员 / 内容推荐官 ============
 * 纯前端静态方案（免费、零后端）：资讯检索 + 发布向导 + 合规拦截 + 双语客服菜单。
 * 2026-11-01 上线。
 */
(function () {
  'use strict';
  if (window.__gdChatLoaded) return;
  window.__gdChatLoaded = true;

  var root = document.getElementById('gudong-chatbot');
  if (!root) return;
  var ASSETS = (root.getAttribute('data-assets') || 'assets/').replace(/\/?$/, '/');

  var I18N = {
    zh: {
      name: '小顾 · 社区引导员', sub: '古董圈 Gudong 智能客服',
      hello: '你好，我是古董圈的社区引导员 <span class="gd-hi">小顾</span> 👋\n想看干货、发布藏品或了解平台规则，都可以问我。',
      menuHint: '也可以从下面选一个方向：',
      welcomeChips: ['铜镜怎么断代', '青花底款', '怎么发布藏品', '发布要收费吗？', '创始藏家优惠', '怎么上首页推荐？', '怎么预约专家顾问？', '帮我找货/求购', '想转人工'],
      sendPh: '输入问题，如「铜镜」…',
      resultsTitle: '为您找到相关深度好文：',
      noResult: '暂时没找到完全匹配的深度好文。换个词试试（比如「铜镜」「青花」「底款」「翡翠」），或从下方菜单选一个方向。',
      typing: '小顾正在翻书…',
      read: '阅读全文 →',
      toHuman: '转人工',
      humanTitle: '人工服务',
      human: '人工服务时间：<span class="gd-b">每日 10:00–17:00</span>（新加坡时间），老师们收到您的消息后通常在 <span class="gd-b">1 小时内</span> 回复。<br>⚠️ 我们<b>仅接受文字留言</b>，暂不支持电话 / 语音通话。\n也可以直接到「关于我们」页通过 WhatsApp / 邮件联系我们。',
      toWa: '📱 直接 WhatsApp 我',
      toWaNote: '💬 先留言，再发 WhatsApp',
      toMail: '📧 发邮件给我们',
      waPrompt: '好的，请直接在下方输入您的留言，发送后会帮您打开 WhatsApp 并带上这段留言，人工会尽快回复。',
      waSent: '已帮您打开 WhatsApp 并带上留言 ✅ 我们通常在每日 10:00–17:00、1 小时内回复。若未自动跳转，请检查是否拦截了弹窗。',
      waIntro: '你好，我在 Gudong.app 想咨询：',
      contactHint: '老师们正在撰写文玩干货，收到您的消息后会在 1 小时内（或每日 10:00–17:00）给您回复哦～ 解决不了的，点选人工。'
    },
    en: {
      name: 'Xiao Gu · Community Guide', sub: 'Gudong.app smart assistant',
      hello: 'Hi, I\'m <span class="gd-hi">Xiao Gu</span>, your Gudong community guide 👋\nAsk me about collecting guides, publishing, or platform rules.',
      menuHint: 'Or pick a topic:',
      welcomeChips: ['Bronze mirrors', 'Blue-and-white marks', 'How to publish', 'Publishing fees?', 'Founding collector deal', 'Homepage feature?', 'Book an expert', 'Sourcing / hunting', 'Talk to a human'],
      sendPh: 'Ask me, e.g. "bronze mirror"…',
      resultsTitle: 'Here are some related reads:',
      noResult: 'No exact match yet. Try another word (e.g. bronze mirror, blue-and-white, reign mark, jadeite), or pick a topic from the menu.',
      typing: 'Xiao Gu is browsing…',
      read: 'Read full article →',
      toHuman: 'Talk to a human',
      humanTitle: 'Human support',
      human: 'Human support: <span class="gd-b">daily 10:00–17:00</span> (Singapore time); we usually reply within <span class="gd-b">1 hour</span>.<br>⚠️ We <b>only accept text messages</b> — no phone calls or voice notes.\nYou can also reach us via WhatsApp / email on the About page.',
      toWa: '📱 Chat on WhatsApp',
      toWaNote: '💬 Write a note, then WhatsApp',
      toMail: '📧 Email us',
      waPrompt: 'Sure — type your message below and hit send; it\'ll open WhatsApp with your note and we\'ll reply shortly.',
      waSent: 'WhatsApp opened with your message ✅ We usually reply within 1 hour (daily 10:00–17:00). If it didn\'t open, please allow pop-ups.',
      waIntro: 'Hi, I\'m contacting you from Gudong.app: ',
      contactHint: 'Our editors are writing more guides — replies usually within 1 hour (daily 10:00–17:00). Need more? Tap "Talk to a human".'
    }
  };

  var MENU = [
    { key: 'publish', zh: '📁 藏品发布指引', en: '📁 Publishing guide', items: [
      { key: 'pub_how', zh: '怎样发布我的藏品？', en: 'How do I publish an item?' },
      { key: 'pub_photo', zh: '为什么我的照片上传失败/被驳回？', en: 'Why was my photo rejected?' },
      { key: 'pub_edit', zh: '如何编辑/删除已发布的藏品？', en: 'How do I edit or remove a listing?' }
    ]},
    { key: 'insights', zh: '📰 资讯与活动', en: '📰 Insights & Events', items: [
      { key: 'ev_market', zh: '最近有什么线下大集/拍卖会信息？', en: 'Any upcoming flea markets or auctions?' },
      { key: 'ev_submit', zh: '怎么向平台投稿（资讯采纳是否有奖）？', en: 'How do I submit an article?' }
    ]},
    { key: 'partner', zh: '🤝 合作与入驻', en: '🤝 Partners', items: [
      { key: 'pt_expert', zh: '专家/行家如何申请认证专栏？', en: 'How do experts get a verified column?' },
      { key: 'pt_ad', zh: '广告投放与商务合作联系方式？', en: 'Ad or business cooperation contact?' }
    ]},
    { key: 'account', zh: '👤 账号与安全', en: '👤 Account & Safety', items: [
      { key: 'ac_phone', zh: '怎么修改绑定手机号？', en: 'How do I change my phone number?' },
      { key: 'ac_report', zh: '举报垃圾广告/违规藏品？', en: 'How do I report spam or violations?' }
    ]}
  ];

  var FAQ = {
    pub_how: {
      zh: '<span class="gd-b">发布藏品前，建议您准备好三张高清图：</span><br>① 正面全景（整体造型与主纹饰）<br>② 底部圈足 / 底款特写（断代关键）<br>③ 局部微距（工艺细节与包浆）<br><br>再配上尺寸、大致年代依据、品相瑕疵和来源说明，能获得更多藏友围观和点赞。平台为免注册制，发布走「藏家服务」：到定价页查看发布服务，或联系平台提交资料。',
      en: '<span class="gd-b">Before publishing, prep 3 clear photos:</span><br>① Overall front view (shape & main decoration)<br>② Base / reign-mark close-up (key for dating)<br>③ Macro of craft details & patina<br><br>Add dimensions, dating clues, condition and provenance — collectors love that. Gudong is sign-up free; publishing goes through our Collector Service (see Pricing) or contact us to submit.'
    },
    pub_photo: {
      zh: '照片被驳回常见原因：不够清晰或失焦、光线不足、底部/底款没拍到、带遮挡性水印或杂乱背景、内容涉及违禁品。重拍时选自然光、对准主纹饰和底款、背景干净即可。',
      en: 'Common rejection reasons: blurry or low light, base/reign-mark missing, covering watermark, messy background, or restricted content. Reshoot in daylight, focus the main decoration and the base mark, keep the background clean.'
    },
    pub_edit: {
      zh: '平台为免注册制，藏家通过「藏家服务」发布后，如需修改或下架，请直接通过「关于我们」页的联系方式（WhatsApp / 邮件）告知平台，说明藏品名称即可，工作人员会协助处理。',
      en: 'Gudong is sign-up free. Once published via Collector Service, to edit or remove a listing, reach us through the About page (WhatsApp / email) with the item name and we\'ll assist.'
    },
    ev_market: {
      zh: '我们会不定期发布新加坡本地市集、拍卖会与线下活动资讯，欢迎常逛「情报 / 科普」板块。需要我把你感兴趣的方向转告编辑团队吗？',
      en: 'We post Singapore flea-market, auction and event info from time to time — check the Insights section. Want me to pass your interests to our editors?'
    },
    ev_submit: {
      zh: '欢迎投稿！平台重视深度科普与行情观察，投稿建议以「上手判断」为角度并附图片说明。请通过「关于我们」页联系编辑团队沟通选题与采用规则（被采纳的文章会标注作者与专栏入口）。',
      en: 'We welcome pitches! We value hands-on guides and market observation. Send your topic + photo captions via the About page; accepted pieces get author credit and a column entry.'
    },
    pt_expert: {
      zh: '欢迎专家/行家入驻。请准备您的从业背景、专业方向与代表作品/文章，通过「关于我们」页联系平台，审核通过后为您开通认证专栏。',
      en: 'Experts welcome. Share your background, speciality and representative work via the About page; we\'ll review and open a verified column.'
    },
    pt_ad: {
      zh: '广告与商务合作请联系平台商务团队：通过「关于我们」页获取联系方式（WhatsApp / 邮件），简要说明合作形式即可，我们会尽快回复。',
      en: 'For advertising and business cooperation, contact us via the About page (WhatsApp / email) with your proposal and we\'ll respond shortly.'
    },
    ac_phone: {
      zh: '平台目前为免注册制，不绑定手机号，也无登录账号。如需处理账户相关事务，请通过「关于我们」页的联系方式告知平台即可。',
      en: 'Gudong is sign-up free and doesn\'t bind a phone number or require login. For account matters, just reach us via the About page.'
    },
    ac_report: {
      zh: '感谢维护社区环境。如发现垃圾广告或违规藏品，请通过「关于我们」页联系平台，附上链接与截图，我们会尽快核实处理。',
      en: 'Thanks for keeping the community clean. To report spam or violations, contact us via the About page with a link and screenshot; we\'ll review promptly.'
    }
  };

  // 盈利 / 服务问答（收费、优惠、首页推荐、顾问、找货、入驻、合作、投稿）
  var SALES = [
    { key: 'pricing',
      q: '发布要收费吗？', qen: 'Publishing fees?',
      k: ['收费', '费用', '多少钱', '发布要收费', '怎么收费', 'pricing', 'fee', 'cost'],
      a: '<span class="gd-b">平台免费与付费两种方式，都 0% 成交佣金：</span><br>· <b>免费自助上架</b>（席位限定，0 佣金）<br>· <b>标准专业发布</b> S$188/件：团队协助整理资料与图片，展示期 6 个月<br>· <b>高级专业发布</b> S$388/件：含首页推荐 7 天<br>· <b>专属线上藏馆</b> S$888/年（创始优惠 S$588/年）：含首页推荐、0% 佣金<br><br>买家直接联系您，平台不经手交易、不收取成交佣金。',
      aen: '<span class="gd-b">Two ways to list, both 0% commission:</span><br>· <b>Free self-listing</b> (limited slots, 0% commission)<br>· <b>Standard Pro</b> S$188/item: our team helps prep photos & details, 6-month display<br>· <b>Premium Pro</b> S$388/item: includes a 7-day homepage feature<br>· <b>Collector Gallery</b> S$888/yr (Founding S$588/yr): homepage feature + 0% commission<br><br>Buyers contact you directly — we never join transactions or take sale commission.',
      cta: '查看完整定价', ctaEn: 'See full pricing', url: 'pricing.html' },

    { key: 'promo',
      q: '创始藏家优惠', qen: 'Founding collector deal',
      k: ['优惠', '折扣', '促销', '创始', 'deal', 'discount', 'promo'],
      a: '<span class="gd-b">创始藏家优惠：</span>专属线上藏馆原价 S$888/年，创始会员价 <b>S$588/年</b>（约每月 S$74），限量创始席位，先到先得。单件发布也可加购首页推荐（S$100 / 7 天）。',
      aen: '<span class="gd-b">Founding Collector rate:</span> Collector Gallery is S$888/yr, but founding members pay just <b>S$588/yr</b> (≈S$74/month). Limited founding slots. You can also add a 7-day homepage feature to a single listing for S$100.',
      cta: '查看优惠定价', ctaEn: 'See the offer', url: 'pricing.html' },

    { key: 'feature',
      q: '怎么上首页推荐？', qen: 'Homepage feature?',
      k: ['首页推荐', '上首页', '推荐位', '上架首页', 'homepage feature', 'featured'],
      a: '首页推荐 7 天：标准专业发布可加购 <b>S$100</b>；<b>高级专业发布（S$388）</b>与<b>专属藏馆（S$888/年）</b>已内含首页推荐权益。首页展示能大幅提升曝光与询问量。',
      aen: 'A 7-day homepage feature: add <b>S$100</b> to a Standard Pro listing; it\'s already included in <b>Premium Pro (S$388)</b> and the <b>Collector Gallery (S$888/yr)</b>. Homepage placement boosts visibility and enquiries a lot.',
      cta: '查看发布服务', ctaEn: 'See publishing services', url: 'pricing.html' },

    { key: 'expert',
      q: '怎么预约专家顾问？', qen: 'Book an expert',
      k: ['顾问', '专家连线', '专家意见', '专家看', '连线', 'book an expert'],
      a: '平台提供<b>专家顾问远程连线</b>（参考意见）：单次 <b>S$188</b>，专家基于您提供的照片/视频，结合断代与市场经验给参考意见。<br>⚠️ 注意：这是顾问参考，<b>不是法定鉴定</b>，不能作为交易或诉讼依据。提交后经 WhatsApp 完成 PayNow 付款并安排时段。',
      aen: 'We offer <b>remote expert consultations</b> (reference opinions): <b>S$188</b> per session. An expert reviews your photos/video and shares dating & market views.<br>⚠️ Note: this is a reference opinion, <b>not a legal appraisal</b>, and can\'t be used for transactions or disputes. Pay by PayNow via WhatsApp to schedule.',
      cta: '联系平台预约', ctaEn: 'Contact us to book', url: 'about.html' },

    { key: 'sourcing',
      q: '帮我找货/求购', qen: 'Sourcing / hunting',
      k: ['找货', '求购', '委托找', '想找', 'sourcing'],
      a: '平台提供<b>私人找货（Private Sourcing）</b>：告诉我们您想找的品类、年代、预算与用途，团队会在平台内外为您留意合适来源与藏家。通过「关于我们」页联系即可。',
      aen: 'We offer <b>Private Sourcing</b>: tell us the category, period, budget and purpose, and our team will keep an eye out across the platform and beyond. Just reach us via the About page.',
      cta: '去联系团队', ctaEn: 'Contact the team', url: 'about.html' },

    { key: 'column',
      q: '怎么申请专家认证专栏？', qen: 'How do experts get a column?',
      k: ['认证专栏', '申请专栏', '专家专栏', '专栏', 'verified column'],
      a: '欢迎专家/行家入驻认证专栏：请准备您的<b>从业背景、专业方向与代表作品/文章</b>，通过「关于我们」页提交，审核通过后为您开通认证专栏，获得作者署名与专栏入口。',
      aen: 'Experts welcome: prepare your <b>background, speciality and representative work</b>, submit via the About page, and we\'ll open a verified column with author credit.',
      cta: '去申请入驻', ctaEn: 'Apply now', url: 'about.html' },

    { key: 'ad',
      q: '广告/商务合作联系谁？', qen: 'Advertising / partnership?',
      k: ['广告', '商务合作', '推广', '投放', 'advertise', 'business', 'sponsor'],
      a: '广告投放与商务合作请联系平台商务团队：通过「关于我们」页获取 WhatsApp / 邮件，简要说明合作形式与目标，我们会尽快回复。',
      aen: 'For advertising and business cooperation, contact our team via the About page (WhatsApp / email) with your proposal and we\'ll respond shortly.',
      cta: '联系商务团队', ctaEn: 'Contact business team', url: 'about.html' },

    { key: 'submit',
      q: '怎么向平台投稿？', qen: 'How do I pitch an article?',
      k: ['投稿', '投稿奖励', '资讯采纳', '写文章', 'pitch'],
      a: '欢迎投稿深度科普与行情观察！请以「上手判断」为角度并附图片说明，通过「关于我们」页联系编辑团队沟通选题与采用规则。被采纳的文章会标注作者与专栏入口。',
      aen: 'We welcome pitches on hands-on guides and market observation. Share your topic + photo captions via the About page; accepted pieces get author credit and a column entry.',
      cta: '联系编辑团队', ctaEn: 'Contact editors', url: 'about.html' }
  ];

  // 合规 / 敏感词拦截
  var SENSITIVE = ['出土', '盗墓', '盗掘', '走私', '象牙', '犀角', '虎骨', '穿山甲', '玳瑁', '违禁', '赃', '一级文物', '来历不明', 'excavat', 'loot', 'smuggl', 'ivory', 'rhino', 'tiger bone', 'pangolin', 'stolen', 'contraband'];
  var SENSITIVE_MSG = {
    zh: '感谢您的关注。按照相关法律法规和平台规范，古董圈<span class="gd-b">不展示来源不明的出土文物、象牙及犀角等濒危物种制品</span>，也不参与任何涉嫌走私、盗掘或来历不明的交易。请提供清晰的合法来源说明；如涉及上述内容，我们无法接受发布。如您持有合规的传世藏品，欢迎按「藏品发布指引」操作。',
    en: 'Thanks for reaching out. In line with heritage-protection and wildlife laws, Gudong does <span class="gd-b">not display excavated artefacts of unclear provenance, or items made from ivory, rhino horn or other endangered species</span>, and never engages in smuggling or unverifiable sourcing. Please provide a clear legal provenance when publishing. If you have a lawful heirloom piece, follow the Publishing guide.'
  };

  // 口语词 → 相关文章（补充标题检索，命中即推荐；顺序即优先级）
  var ALIASES = [
    { slug: 'bronze-age-copper', k: ['铜镜', '青铜镜', '青铜', '铜器', '鼎', '铜鼎', 'bronze mirror', 'bronze'] },
    { slug: 'tang-ceramics-trade', k: ['唐三彩', '三彩', '唐代', '唐瓷', 'sancai'] },
    { slug: 'bronze-censer-patina', k: ['香炉', '宣德炉', '铜香炉', '香薰', 'censer', 'incense burner'] },
    { slug: 'qinghua-cobalt', k: ['青花', '青花瓷', '青料', '钴料', 'blue and white', 'qinghua', 'blue-and-white'] },
    { slug: 'qing-porcelain-dating', k: ['清代', '清瓷', '清花', 'qing dynasty', 'qing porcelain'] },
    { slug: 'ming-porcelain-dating', k: ['明代', '明瓷', '明朝', '明青花', 'ming porcelain', 'ming'] },
    { slug: 'republic-porcelain-dating', k: ['民国', '民国瓷', 'republic porcelain'] },
    { slug: 'porcelain-marks', k: ['底款', '款识', '印章款', 'reign mark', 'porcelain mark'] },
    { slug: 'glaze-crackle-basics', k: ['开片', '冰裂', '窑裂', '裂纹', 'crackle'] },
    { slug: 'hetian-seeds-vs-mountain', k: ['籽料', '山料', '留皮', '和田', 'seed jade', 'boulder', 'hetian'] },
    { slug: 'ancient-jade-stains', k: ['沁色', '古玉', '血沁', 'jade stain'] },
    { slug: 'jadeite-abc', k: ['翡翠', 'a货', 'b货', 'c货', 'fei cui', 'jadeite'] },
    { slug: 'jade-buyer-pitfalls', k: ['买玉', '玉器', '和田玉', 'buy jade', 'jade buyer'] },
    { slug: 'silver-dollar-edges', k: ['银元', '袁大头', '龙洋', '鹰洋', '边齿', 'silver dollar'] },
    { slug: 'silver-patina', k: ['银器', '银饰', '银包浆', 'silver patina'] },
    { slug: 'nyonya-ware', k: ['娘惹', '娘惹瓷', 'nyonya', 'peranakan'] },
    { slug: 'what-is-jianlou', k: ['捡漏'] },
    { slug: 'auction-house-watch', k: ['拍卖', '拍卖会', '举牌', 'auction'] },
    { slug: 'singapore-flea-market-map', k: ['市集', '跳蚤', '旧货市场', 'flea market'] },
    { slug: 'singapore-coin-market', k: ['钱币', '铜钱', '古钱', '康熙', '通宝', '硬币', 'coin', 'coins'] },
    { slug: 'coin-aging-tricks', k: ['做旧', '钱币做旧', 'coin aging'] },
    { slug: 'painting-seals-signatures', k: ['书画', '钤印', '印章', '题跋', '落款', 'painting', 'seal', 'calligraphy'] },
    { slug: 'amber-baked-vs-natural', k: ['琥珀', '蜜蜡', '烤色', 'amber'] },
    { slug: 'furniture-patina', k: ['家具', '紫檀', '黄花梨', '木纹', 'furniture'] },
    { slug: 'antique-shipping', k: ['运输', '物流', '快递', '包装', 'shipping'] },
    { slug: 'how-to-store-collection', k: ['存储', '保养', '保存', '防潮', 'store'] },
    { slug: 'how-to-negotiate', k: ['砍价', '议价', '谈判', 'negotiate'] },
    { slug: 'how-to-brief-a-sourcing', k: ['委托', '找货', '求购', 'sourcing'] }
  ];

  var INDEX = [];
  var lang = (localStorage.getItem('gd-chat-lang') || (document.documentElement.lang || 'zh').toLowerCase().indexOf('en') === 0 ? 'en' : 'zh');

  var state = { open: false, busy: false, waMode: false, messages: [] };

  /* ---------- 构建 UI ---------- */
  var el = {};
  function build() {
    root.insertAdjacentHTML('beforeend',
      '<button class="gd-chat-fab" id="gdFab" aria-label="Chat with Xiao Gu"><span class="gd-chat-fab-badge"></span>' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C7 3 3 6.6 3 11c0 2.5 1.3 4.7 3.4 6.1L5.5 21l4-2c.8.2 1.6.3 2.5.3 5 0 9-3.6 9-8s-4-8-9-8z"/></svg></button>' +
      '<div class="gd-chat-panel" id="gdPanel" hidden>' +
        '<div class="gd-chat-head">' +
          '<div class="gd-chat-avatar">🔍</div>' +
          '<div class="gd-chat-head-text"><div class="gd-chat-name" id="gdName"></div><div class="gd-chat-sub" id="gdSub"></div></div>' +
          '<div class="gd-chat-lang"><button type="button" data-lang="zh">中</button><button type="button" data-lang="en">EN</button></div>' +
          '<button type="button" class="gd-chat-close" id="gdClose" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="gd-chat-msgs" id="gdMsgs"></div>' +
        '<div class="gd-chat-inputbar"><input id="gdInput" type="text" autocomplete="off" placeholder=""><button type="button" class="gd-send" id="gdSend" aria-label="Send"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></div>' +
      '</div>');
    el.fab = root.querySelector('#gdFab');
    el.panel = root.querySelector('#gdPanel');
    el.msgs = root.querySelector('#gdMsgs');
    el.input = root.querySelector('#gdInput');
    el.name = root.querySelector('#gdName');
    el.sub = root.querySelector('#gdSub');
    el.close = root.querySelector('#gdClose');
    el.send = root.querySelector('#gdSend');
    root.querySelectorAll('.gd-chat-lang button').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); });
    });

    el.fab.addEventListener('click', toggle);
    el.close.addEventListener('click', function () { setOpen(false); });
    el.send.addEventListener('click', submit);
    el.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    // 事件委托：菜单 / 卡片 / 按钮
    el.msgs.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act'), val = t.getAttribute('data-val');
      if (act === 'ask') { pushUser(loc(val)); }
      else if (act === 'faq') { answerFaq(val); }
      else if (act === 'human') { showHuman(); }
      else if (act === 'wa') { window.open('https://wa.me/6591888952?text=' + encodeURIComponent(I18N[lang].waIntro), '_blank'); }
      else if (act === 'wa-note') { state.waMode = true; bot({ role: 'bot', text: { zh: I18N.zh.waPrompt, en: I18N.en.waPrompt } }); setTimeout(function () { el.input.focus(); }, 60); }
      else if (act === 'email') { if (window.__gdContactOpen) { window.__gdContactOpen(); } else { window.open('mailto:contact@gudong.app?subject=' + encodeURIComponent('Gudong.app 咨询'), '_blank'); } }
      else if (act === 'open') { window.open(t.getAttribute('href'), '_blank'); }
    });
    applyLang();
  }

  function toggle() { setOpen(!state.open); }
  function setOpen(v) {
    state.open = v;
    el.panel.hidden = !v;
    // 面板打开时隐藏悬浮球，避免误点 / 遮挡内容
    el.fab.style.opacity = v ? '0' : '1';
    el.fab.style.pointerEvents = v ? 'none' : 'auto';
    el.fab.classList.toggle('gd-has-new', false);
    if (v) {
      if (state.messages.length === 0) { pushWelcome(); }
      setTimeout(function () { el.input.focus(); }, 80);
    }
  }

  /* ---------- 消息管理 ---------- */
  function pushUser(text) {
    state.messages.push({ role: 'user', text: text });
    render();
    handleUser(text);
  }
  function bot(m) { state.messages.push(m); render(); }

  function render() {
    el.msgs.innerHTML = '';
    state.messages.forEach(function (m) {
      el.msgs.appendChild(renderMsg(m));
    });
    el.msgs.scrollTop = el.msgs.scrollHeight;
  }
  function renderMsg(m) {
    function txt(v) { if (v && typeof v === 'object') return v[lang] || v.zh || ''; return v || ''; }
    var wrap = document.createElement('div');
    wrap.className = 'gd-msg ' + (m.role === 'user' ? 'gd-user' : 'gd-bot');
    var av = document.createElement('div'); av.className = 'gd-msg-avatar'; av.textContent = m.role === 'user' ? '藏友' : '🔍';
    wrap.appendChild(av);
    var bub = document.createElement('div'); bub.className = 'gd-bubble';
    if (m.role === 'user') {
      var tu = document.createElement('div'); tu.textContent = m.text; bub.appendChild(tu);
    } else {
      if (m.menu) {
        var mh = document.createElement('div'); mh.innerHTML = txt(m.menuHint); bub.appendChild(mh);
        var menu = document.createElement('div'); menu.className = 'gd-menu';
        m.menu.forEach(function (g) {
          var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gd-menu-item';
          btn.setAttribute('data-act', 'faq'); if (g.key) btn.setAttribute('data-val', g.key);
          var label = document.createElement('span');
          label.innerHTML = g.zh === null ? '' : (lang === 'zh' ? g.zh : g.en);
          btn.innerHTML = '<span class="gd-m-ic">' + (lang === 'zh' ? g.icZ : g.icE) + '</span>';
          btn.appendChild(label);
          menu.appendChild(btn);
        });
        bub.appendChild(menu);
      }
      if (m.text) { var tx = document.createElement('div'); tx.innerHTML = txt(m.text); bub.appendChild(tx); }
      if (m.chips) {
        var cr = document.createElement('div'); cr.className = 'gd-chip-row';
        var chList = (m.chips && m.chips.zh) ? (lang === 'zh' ? m.chips.zh : m.chips.en) : m.chips;
        chList.forEach(function (c) {
          var ch = document.createElement('button'); ch.type = 'button'; ch.className = 'gd-chip';
          ch.setAttribute('data-act', 'ask'); ch.setAttribute('data-val', c.v);
          ch.textContent = txt(c.t); cr.appendChild(ch);
        });
        bub.appendChild(cr);
      }
      if (m.cards) {
        m.cards.forEach(function (a) {
          var card = document.createElement('a'); card.className = 'gd-card'; card.href = a.url; card.target = '_blank'; card.rel = 'noopener';
          var t = document.createElement('div'); t.className = 'gd-card-t'; t.textContent = lang === 'zh' ? a.title_zh : (a.title_en || a.title_zh);
          var d = document.createElement('div'); d.className = 'gd-card-d'; d.textContent = a.desc || '';
          var go = document.createElement('div'); go.className = 'gd-card-go'; go.textContent = I18N[lang].read;
          card.appendChild(t); card.appendChild(d); card.appendChild(go);
          bub.appendChild(card);
        });
      }
      if (m.actions) {
        var ar = document.createElement('div'); ar.className = 'gd-msg-actions';
        m.actions.forEach(function (a) {
          var btn = document.createElement('button'); btn.type = 'button';
          btn.className = 'gd-btn' + (a.primary ? ' gd-primary' : '');
          if (a.act) { btn.setAttribute('data-act', a.act); if (a.val) btn.setAttribute('data-val', a.val); }
          if (a.href) { btn.setAttribute('data-act', 'open'); btn.href = a.href; }
          btn.textContent = txt(a.t); ar.appendChild(btn);
        });
        bub.appendChild(ar);
      }
      if (m.note) { var nt = document.createElement('div'); nt.className = 'gd-note'; nt.textContent = txt(m.note); bub.appendChild(nt); }
    }
    wrap.appendChild(bub);
    return wrap;
  }

  /* ---------- 交互 ---------- */
  function loc(v) { return v; } // placeholder kept for structure

  function pushWelcome() {
    state.messages.push({
      role: 'bot',
      text: { zh: I18N.zh.hello, en: I18N.en.hello },
      menu: MENU.map(function (g) { return { key: g.key, zh: g.zh, en: g.en, icZ: g.zh.slice(0, 2), icE: g.en.slice(0, 2) }; }),
      menuHint: { zh: I18N.zh.menuHint, en: I18N.en.menuHint },
      chips: {
        zh: I18N.zh.welcomeChips.map(function (c) { return { t: c, v: c }; }),
        en: I18N.en.welcomeChips.map(function (c) { return { t: c, v: c }; })
      },
      note: { zh: I18N.zh.contactHint, en: I18N.en.contactHint }
    });
    render();
  }

  function handleUser(text) {
    var q = String(text || '').trim();
    if (!q) return;
    // 语言自适应：输入含中文 → 中文
    if (/[\u4e00-\u9fff]/.test(q) && lang !== 'zh') setLang('zh', true);
    // 合规拦截
    var hit = SENSITIVE.some(function (k) { return q.toLowerCase().indexOf(String(k).toLowerCase()) !== -1; });
    if (hit) { bot({ role: 'bot', text: { zh: SENSITIVE_MSG.zh, en: SENSITIVE_MSG.en } }); return; }
    // 盈利 / 服务问答（收费、优惠、首页推荐、顾问、找货、入驻、合作、投稿）
    var sv = SALES.filter(function (x) {
      return q === x.q || q === x.qen || x.k.some(function (kw) { return q.toLowerCase().indexOf(String(kw).toLowerCase()) !== -1; });
    })[0];
    if (sv) {
      var ctaIsContact = sv.url && sv.url.indexOf('about.html') !== -1;
      bot({ role: 'bot', text: { zh: sv.a, en: sv.aen }, actions: [{ t: { zh: sv.cta, en: sv.ctaEn }, act: ctaIsContact ? 'email' : 'open', href: ctaIsContact ? '' : rootBase() + sv.url, primary: true }] });
      return;
    }
    // 菜单意图
    var intent = matchIntent(q);
    if (intent) { answerFaq(intent); return; }
    // 人工意图
    if (/(转人工|人工|客服|human|agent|support|contact)/i.test(q) && /[转人工客服human agent support]/.test(q)) { showHuman(); return; }
    // 关键词映射：口语词 → 相关文章（命中即推荐）
    var hits = [];
    ALIASES.forEach(function (al) {
      if (al.k.some(function (kw) { return q.toLowerCase().indexOf(kw.toLowerCase()) !== -1; })) hits.push(al.slug);
    });
    if (hits.length) {
      var acards = [];
      hits.forEach(function (slug) {
        var found = INDEX.filter(function (x) { return x.slug === slug; })[0];
        if (found && acards.length < 4) acards.push(found);
      });
      if (acards.length) { bot({ role: 'bot', text: { zh: I18N.zh.resultsTitle, en: I18N.en.resultsTitle }, cards: acards }); return; }
    }
    // 资讯检索
    if (INDEX.length) {
      var cards = search(q, 4);
      if (cards.length) { bot({ role: 'bot', text: { zh: I18N.zh.resultsTitle, en: I18N.en.resultsTitle }, cards: cards }); return; }
    }
    bot({ role: 'bot', text: { zh: I18N.zh.noResult, en: I18N.en.noResult }, chips: { zh: I18N.zh.welcomeChips.map(function (c) { return { t: c, v: c }; }), en: I18N.en.welcomeChips.map(function (c) { return { t: c, v: c }; }) } });
  }

  function matchIntent(q) {
    var map = [
      ['pub_how', ['发布', '上传', '上架', '怎么卖', '刊登', 'publish', 'post', 'upload', 'sell', 'listing']],
      ['pub_photo', ['照片', '图片', '驳回', '上传失败', 'photo', 'image', 'reject', 'picture']],
      ['pub_edit', ['编辑', '删除', '修改', '下架', '移除', 'edit', 'delete', 'remove', 'remove listing']],
      ['ev_market', ['市集', '拍卖', '活动', '线下', '展会', 'market', 'auction', 'event', 'flea', 'fair']],
      ['ev_submit', ['投稿', '投稿', '文章', '专栏', '合作投稿', 'submit', 'article', 'write', 'pitch']],
      ['pt_expert', ['专家', '行家', '认证', '入驻', '鉴定师', 'expert', 'verify', 'authenticate', 'join']],
      ['pt_ad', ['广告', '商务', '合作', '推广', 'ad', 'business', 'sponsor', 'promote']],
      ['ac_phone', ['手机', '手机号', '绑定', '账号', 'phone', 'account', 'bind']],
      ['ac_report', ['举报', '投诉', '垃圾', '违规', 'report', 'abuse', 'spam', 'violation', 'complain']]
    ];
    for (var i = 0; i < map.length; i++) {
      if (map[i][1].some(function (k) { return q.toLowerCase().indexOf(k.toLowerCase()) !== -1; })) return map[i][0];
    }
    return null;
  }

  function answerFaq(key) {
    var a = FAQ[key];
    if (!a) return;
    bot({ role: 'bot', text: a, actions: [{ t: { zh: I18N.zh.toHuman, en: I18N.en.toHuman }, act: 'human' }] });
  }

  function showHuman() {
    state.waMode = false;
    bot({ role: 'bot', text: { zh: I18N.zh.human, en: I18N.en.human }, actions: [
      { t: { zh: I18N.zh.toWa, en: I18N.en.toWa }, act: 'wa', primary: true },
      { t: { zh: I18N.zh.toWaNote, en: I18N.en.toWaNote }, act: 'wa-note' },
      { t: { zh: I18N.zh.toMail, en: I18N.en.toMail }, act: 'email' }
    ] });
  }

  function rootBase() {
    // 子目录页面返回 ../ 以定位根；由注入 data-assets 推断（"" 或 "../"）
    var a = root.getAttribute('data-assets') || 'assets/';
    return a.indexOf('/') === 0 || a.indexOf(':') !== -1 ? a : (a === 'assets/' ? '' : '../');
  }

  function submit() {
    var v = el.input.value;
    if (!v.trim()) return;
    if (state.waMode) {
      state.waMode = false;
      el.input.value = '';
      state.messages.push({ role: 'user', text: v });
      render();
      window.open('https://wa.me/6591888952?text=' + encodeURIComponent('【Gudong.app 访客留言】' + v), '_blank');
      bot({ role: 'bot', text: { zh: I18N.zh.waSent, en: I18N.en.waSent }, actions: [{ t: { zh: I18N.zh.toWa, en: I18N.en.toWa }, act: 'wa' }, { t: { zh: I18N.zh.toHuman, en: I18N.en.toHuman }, act: 'human' }] });
      return;
    }
    el.input.value = '';
    pushUser(v);
  }

  /* ---------- 检索 ---------- */
  function tokenize(q) {
    q = String(q).toLowerCase();
    var zh = (q.match(/[\u4e00-\u9fff]+/g) || []).join('');
    var en = (q.replace(/[\u4e00-\u9fff]+/g, ' ')).match(/[a-z0-9]+/g) || [];
    var zhToks = [];
    for (var i = 0; i < zh.length - 1; i++) zhToks.push(zh.substr(i, 2));
    if (zhToks.length === 0 && zh) zhToks.push(zh);
    return { zh: zhToks, en: en, raw: zh };
  }
  function search(q, n) {
    var tk = tokenize(q);
    var scored = INDEX.map(function (a) {
      var s = 0;
      var tz = (a.title_zh || ''), te = (a.title_en || '').toLowerCase(), tx = a.text || '';
      tk.zh.forEach(function (t) {
        if (tz.indexOf(t) !== -1) s += 8; else if (tx.indexOf(t) !== -1) s += 3;
      });
      if (tk.raw && tk.zh.length === 0) { if (tz.indexOf(tk.raw) !== -1) s += 8; else if (tx.indexOf(tk.raw) !== -1) s += 3; }
      tk.en.forEach(function (t) {
        if (te.indexOf(t) !== -1) s += 8; if (a.desc && a.desc.toLowerCase().indexOf(t) !== -1) s += 3;
        else if (tx.indexOf(t) !== -1) s += 1;
      });
      return { a: a, s: s };
    }).filter(function (x) { return x.s > 0; }).sort(function (x, y) { return y.s - x.s; });
    return scored.slice(0, n).map(function (x) { return x.a; });
  }

  /* ---------- 语言 ---------- */
  function setLang(l, silent) {
    lang = l;
    try { localStorage.setItem('gd-chat-lang', l); } catch (e) {}
    applyLang();
    if (!silent) render();
  }
  function applyLang() {
    var t = I18N[lang];
    el.name.textContent = t.name; el.sub.textContent = t.sub;
    el.input.placeholder = t.sendPh;
    root.querySelectorAll('.gd-chat-lang button').forEach(function (b) {
      b.classList.toggle('gd-on', b.getAttribute('data-lang') === lang);
    });
    if (state.messages.length) render();
  }

  /* ---------- 加载索引 ---------- */
  function loadIndex() {
    var url = ASSETS + 'data/chat-index.json';
    fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Array.isArray(d.articles)) {
          INDEX = d.articles;
          // 确保 URL 前缀与当前页面层级一致
          var pre = rootBase();
          INDEX.forEach(function (a) {
            if (a.url && a.url.indexOf('://') === -1 && a.url.charAt(0) !== '/' && a.url.indexOf('../') !== 0) {
              a.url = pre + a.url;
            }
          });
        }
      }).catch(function () {});
  }

  build();
  loadIndex();
})();
