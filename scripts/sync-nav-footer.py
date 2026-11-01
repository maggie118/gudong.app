# -*- coding: utf-8 -*-
"""以 index.html 为基准，统一全站左侧导航栏与底部 footer。
- 侧栏导航 16 项（6 主链接 + 10 子链接 + 语言按钮），按页面深度调整 ../ 前缀
- active 状态按页面类型设置
- privacy/terms 无侧栏，补齐 CSS/HTML/JS/header 按钮
- 顺带修复主页两处笔误：铜器链接 -> categories/bronze.html；footer ".pricing.html" -> "pricing.html"
"""
import io, re, os, glob

ROOT = r"C:/Users/Eastw Engineering/Documents/Gudong"

LANG_BTN = ('<button type="button" class="sidebar-lang-btn" onclick="toggleLang()" '
            'aria-label="Switch language"><span class="zh">🌐 English</span><span class="en">🌐 中文</span></button>')

# (key, href, zh, en, is_sub)
NAV_ITEMS = [
    ("home",       "index.html",               "首页",       "Home",                    False),
    (None,         "index.html#daily-intel",   "· 今日捡漏", "· Daily Radar",           True),
    (None,         "index.html#today-finds",   "· 今日好货", "· Today's Picks",         True),
    (None,         "index.html#new-listings",  "· 新上架好货", "· New Arrivals",        True),
    ("collection", "collection.html",          "藏品库",     "Collection",              False),
    (None,         "categories/porcelain.html","· 瓷器",     "· Porcelain",             True),
    (None,         "categories/jade.html",     "· 玉器",     "· Jade",                  True),
    (None,         "categories/bronze.html",   "· 铜器",     "· Bronzes",               True),
    (None,         "categories/coins.html",    "· 钱币",     "· Coins",                 True),
    (None,         "categories/paintings.html","· 书画",     "· Paintings &amp; Calligraphy", True),
    (None,         "categories/misc.html",     "· 杂项",     "· Miscellaneous",         True),
    ("sellers",    "sellers/index.html",       "卖家展馆",   "Seller Gallery",          False),
    ("pricing",    "pricing.html#seller-services", "刊登藏品", "List an Item",          False),
    ("insights",   "insights.html",            "情报 / 知识", "Insights",              False),
    ("about",      "about.html",               "关于我们",   "About",                   False),
]

COPYRIGHT = ('<p class="zh" style="margin-bottom:0;">© 2026 古董圈 · gudong.app '
             '<a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();">'
             '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>安装古董.app</a></p>\n'
             '        <p class="en" style="margin-bottom:0;">© 2026 Gudong · gudong.app '
             '<a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();">'
             '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>Install gudong.app</a></p>')


def build_sidebar(prefix="", active=None, home_anchors=False):
    lines = []
    for key, href, zh, en, is_sub in NAV_ITEMS:
        cls = "sidebar-sub" if is_sub else "sidebar-link"
        if key and key == active:
            cls += " active"
        if home_anchors and href.startswith("index.html"):
            href = href[len("index.html"):] or "#hero"
        lines.append('            <a href="%s%s" class="%s" onclick="closeSidebar()">'
                     '<span class="zh">%s</span><span class="en">%s</span></a>' % (prefix, href, cls, zh, en))
    lines.append('            ' + LANG_BTN)
    nav = "\n".join(lines)
    return ('<div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>\n'
            '    <aside class="sidebar" id="sidebar">\n'
            '        <button class="sidebar-toggle-inner" onclick="closeSidebar()" aria-label="close menu">☰</button>\n'
            '        <div class="sidebar-brand">\n'
            '            <span class="zh">古董圈</span><span class="en">GUDONG</span>\n'
            '        </div>\n'
            '        <nav class="sidebar-nav">\n'
            + nav + '\n'
            '        </nav>\n'
            '    </aside>')


def build_footer(prefix=""):
    nav = [
        ("about.html", "联系我们", "Contact"),
        ("pricing.html#seller-services", "卖家服务", "Seller Services"),
        ("pricing.html#buyer-services", "买家指南", "Buyer Guide"),
        ("pricing.html#price-table", "服务收费", "Price List"),
        ("privacy.html", "隐私政策", "Privacy"),
        ("terms.html", "用户条款", "Terms"),
    ]
    links = "\n".join('            <a href="%s%s" class="zh">%s</a><a href="%s%s" class="en">%s</a>'
                      % (prefix, h, zh, prefix, h, en) for h, zh, en in nav)
    return ('<footer>\n'
            '        <div class="footer-nav">\n'
            + links + '\n'
            '        </div>\n'
            '        <p class="footer-disclaimer zh">gudong.app 是信息发现平台，而非交易平台。</p>\n'
            '        <p class="footer-disclaimer en">gudong.app is an information and discovery platform for antiques and collectibles.</p>\n'
            '        ' + COPYRIGHT + '\n'
            '    </footer>')


SIDEBAR_RE = re.compile(r'<div class="sidebar-overlay".*?</aside>', re.S)
FOOTER_RE = re.compile(r'<footer>.*?</footer>', re.S)

SIDEBAR_CSS = """
        /* ---------- Sidebar (synced with index.html) ---------- */
        .menu-toggle { width: 38px; height: 38px; border: 1px solid var(--color-border); background: transparent; border-radius: 8px; font-size: 1.05rem; color: var(--color-text); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: .2s; }
        .menu-toggle:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
        .sidebar-overlay { position: fixed; inset: 0; background: rgba(20,17,14,.4); opacity: 0; pointer-events: none; transition: opacity .25s ease; z-index: 90; }
        .sidebar-overlay.show { opacity: 1; pointer-events: auto; }
        .sidebar { position: fixed; top: 0; left: 0; height: 100vh; width: 264px; max-width: 78vw; background: var(--color-white); box-shadow: 4px 0 24px rgba(37,34,30,.18); transform: translateX(-100%); transition: transform .3s ease; z-index: 95; overflow-y: auto; padding-bottom: 2rem; }
        .sidebar.open { transform: translateX(0); }
        .sidebar-toggle-inner { display: block; width: 100%; padding: .9rem 0; background: transparent; border: none; border-bottom: 1px solid var(--color-border); font-size: 1.15rem; color: var(--color-text-secondary); cursor: pointer; text-align: center; }
        .sidebar-toggle-inner:hover { color: var(--color-primary); }
        .sidebar-brand { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .1rem; padding: 1.1rem 0; font-weight: 700; color: var(--color-text); border-bottom: 1px solid var(--color-border); }
        .sidebar-brand .zh { font-size: 1.05rem; }
        .sidebar-brand .en { font-size: 1.05rem; letter-spacing: .04em; }
        .sidebar-nav { display: flex; flex-direction: column; padding: .3rem 0; }
        .sidebar-link { padding: .85rem 1.4rem; color: var(--color-text); text-decoration: none; font-size: .95rem; transition: .2s; }
        .sidebar-link:hover { background: var(--color-primary-light); color: var(--color-primary); }
        .sidebar-link.active { background: var(--color-primary-light); color: var(--color-primary); font-weight: 600; }
        .sidebar-sub { display: block; padding: .55rem 1.4rem .55rem 2.2rem; color: var(--color-text-secondary); text-decoration: none; font-size: .88rem; transition: .2s; }
        .sidebar-sub:hover { color: var(--color-primary); background: var(--color-primary-light); }
        .sidebar-lang-btn { display: flex; align-items: center; justify-content: center; gap: .4rem; width: calc(100% - 2.8rem); margin: 1rem 1.4rem .8rem; padding: .62rem .9rem; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-white); color: var(--color-text-secondary); font-family: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; transition: .2s; }
        .sidebar-lang-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
"""

SIDEBAR_JS = """function openSidebar() {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sidebarOverlay').classList.add('show');
            document.body.style.overflow = 'hidden';
        }
        function closeSidebar() {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('show');
            document.body.style.overflow = '';
        }
        function toggleLang() {"""


def add_sidebar_to_legal(html, sidebar_html):
    """给 privacy/terms 这类没有侧栏的页面补齐侧栏。"""
    # 1. header 加 menu-toggle 按钮
    m = re.search(r'(<header>\s*)<a href="index\.html" class="brand">', html)
    if not m:
        return None, "header brand anchor not found"
    html = html[:m.start()] + m.group(1) + (
        '<div style="display:flex; align-items:center; gap:.9rem;">\n'
        '            <button class="menu-toggle" onclick="openSidebar()" aria-label="menu">☰</button>\n'
        '            <a href="index.html" class="brand">'
    ) + html[m.end():]
    m2 = re.search(r'(</a>)(\s*<button class="lang-btn")', html)
    if not m2:
        return None, "lang-btn not found after brand"
    html = html[:m2.start()] + '</a>\n        </div>' + html[m2.end():]
    # 2. 插入侧栏 CSS
    if '</style>' not in html:
        return None, "no </style>"
    html = html.replace('</style>', SIDEBAR_CSS + '    </style>', 1)
    # 3. 插入侧栏 HTML（header 之后）
    m3 = re.search(r'(</header>)', html)
    if not m3:
        return None, "no </header>"
    html = html[:m3.end()] + '\n\n    ' + sidebar_html + html[m3.end():]
    # 4. 插入 JS（toggleLang 前）
    if 'function toggleLang()' not in html:
        return None, "no toggleLang"
    html = html.replace('function toggleLang()', SIDEBAR_JS, 1)
    return html, None


def process(path, prefix, active, home_anchors=False, is_legal=False):
    with io.open(path, encoding="utf-8") as f:
        html = f.read()
    orig = html
    sidebar_html = build_sidebar(prefix, active, home_anchors)

    if is_legal or not SIDEBAR_RE.search(html):
        # privacy/terms：无侧栏，补齐
        html, err = add_sidebar_to_legal(html, sidebar_html)
        if err:
            return False, err
    else:
        html = SIDEBAR_RE.sub(lambda m: sidebar_html, html, count=1)

    footer_html = build_footer(prefix)
    if not FOOTER_RE.search(html):
        return False, "footer not found"
    html = FOOTER_RE.sub(lambda m: footer_html, html, count=1)

    if html != orig:
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(html)
        return True, None
    return False, "no changes"


TARGETS = [("index.html", "", "home", True)]
for f in ["collection.html", "insights.html", "pricing.html", "about.html"]:
    TARGETS.append((f, "", {"collection.html": "collection", "insights.html": "insights",
                            "pricing.html": "pricing", "about.html": "about"}[f], False))
TARGETS += [("privacy.html", "", None, False), ("terms.html", "", None, False)]

for f in sorted(glob.glob(os.path.join(ROOT, "categories", "*.html"))) + \
          sorted(glob.glob(os.path.join(ROOT, "items", "*.html"))):
    TARGETS.append((os.path.relpath(f, ROOT).replace("\\", "/"), "../", "collection", False))
for f in sorted(glob.glob(os.path.join(ROOT, "sellers", "*.html"))):
    TARGETS.append((os.path.relpath(f, ROOT).replace("\\", "/"), "../", "sellers", False))
for f in sorted(glob.glob(os.path.join(ROOT, "insights", "*.html"))):
    TARGETS.append((os.path.relpath(f, ROOT).replace("\\", "/"), "../", "insights", False))

legal = {"privacy.html", "terms.html"}
changed, failed = [], []
for rel, prefix, active, ha in TARGETS:
    p = os.path.join(ROOT, rel)
    if not os.path.isfile(p):
        failed.append((rel, "file missing"))
        continue
    ok, err = process(p, prefix, active, ha, rel in legal)
    (changed if ok else failed).append((rel, err))

print("CHANGED: %d" % len(changed))
for rel, _ in changed:
    print("  +", rel)
print("FAILED/SKIPPED: %d" % len(failed))
for rel, err in failed:
    print("  -", rel, "::", err)

# 同步构建模板 templates/article.html（active=insights, prefix=../）
tp = os.path.join(ROOT, "templates", "article.html")
with io.open(tp, encoding="utf-8") as f:
    tpl = f.read()
tpl_new = SIDEBAR_RE.sub(lambda m: build_sidebar("../", "insights"), tpl, count=1)
tpl_new = FOOTER_RE.sub(lambda m: build_footer("../"), tpl_new, count=1)
if tpl_new != tpl:
    with io.open(tp, "w", encoding="utf-8", newline="") as f:
        f.write(tpl_new)
    print("  + templates/article.html")
