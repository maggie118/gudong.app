# -*- coding: utf-8 -*-
"""验证全站侧栏/底部统一结果 v2"""
import io, re, os, glob

ROOT = r"C:/Users/Eastw Engineering/Documents/Gudong"
pages = ["index.html", "collection.html", "insights.html", "pricing.html",
         "about.html", "privacy.html", "terms.html"]
pages += [os.path.relpath(f, ROOT).replace("\\", "/")
          for d in ("categories", "items", "sellers", "insights")
          for f in sorted(glob.glob(os.path.join(ROOT, d, "*.html")))]

NAV_ANCHORS = 15  # 6 主链接 + 9 子链接
problems = []
for rel in pages:
    p = os.path.join(ROOT, rel)
    with io.open(p, encoding="utf-8") as f:
        html = f.read()
    d = os.path.dirname(p)
    m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', html, re.S)
    fm = re.search(r'<footer>(.*?)</footer>', html, re.S)
    # 1. 结构
    if html.count('<aside class="sidebar"') != 1 or html.count('id="sidebarOverlay"') != 1 or not m or not fm:
        problems.append((rel, "sidebar/footer structure"))
        continue
    nav, footer = m.group(1), fm.group(1)
    if len(re.findall(r'<a href=', nav)) != NAV_ANCHORS:
        problems.append((rel, "nav links=%d" % len(re.findall(r'<a href=', nav))))
    # 2. JS 函数与按钮
    for fn in ("function openSidebar", "function closeSidebar", "function toggleLang"):
        if fn not in html:
            problems.append((rel, "missing " + fn))
    if 'class="menu-toggle"' not in html:
        problems.append((rel, "missing menu-toggle button"))
    # 3. 旧版残留（仅导航区）
    for old in ("今日情报", "藏家主页", "· 今日发现", "footer-links"):
        if old in nav:
            problems.append((rel, "stale in nav: " + old))
    if ".pricing.html" in html:
        problems.append((rel, "stale .pricing.html"))
    # 4. active 唯一
    if len(re.findall(r'sidebar-link active', html)) > 1:
        problems.append((rel, "multiple active"))
    # 5. 链接可达性
    for h in re.findall(r'href="([^"]*)"', nav + footer):
        if not h or h.startswith(("#", "http", "javascript:", "mailto:", "/")):
            continue
        path = h.split("#")[0]
        if path and not os.path.isfile(os.path.normpath(os.path.join(d, path))):
            problems.append((rel, "broken link: " + h))
    # 6. footer 六项齐全
    for t in ("联系我们", "卖家服务", "买家指南", "服务收费", "隐私政策", "用户条款"):
        if t not in footer:
            problems.append((rel, "footer missing: " + t))

print("pages checked:", len(pages))
if problems:
    print("PROBLEMS: %d" % len(problems))
    for rel, msg in problems:
        print("  !", rel, "::", msg)
else:
    print("ALL OK")
