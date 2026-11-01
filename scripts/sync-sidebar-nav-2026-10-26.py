# -*- coding: utf-8 -*-
"""把全站侧边栏导航（<nav class="sidebar-nav">）统一为 index.html 的版本。

规则
1. 以 index.html 的导航为准：24 项、相同顺序、相同文案。
2. index 里的页内锚（#daily-intel / #today-finds / #new-listings）在其他页面改写为 <前缀>index.html#锚。
3. index 里的 #insights 在其他页面改写为 <前缀>insights.html。
4. 相对路径按页面深度加 ../ 前缀。
5. 重新计算 .active：精确命中优先，其次父栏目
   (insights/* → insights.html，items/* 与 item.html → collection.html，sellers/* → sellers/index.html)。
6. 幂等：生成结果与现有内容一致则跳过；保留各文件原有换行符。

用法： python scripts/sync-sidebar-nav-2026-10-26.py [--apply]
      默认 dry-run（只报告）。
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIR = lambda d: d.startswith('_backup') or d.startswith('_upload') or d in (
    'node_modules', 'airtable-script', '.workbuddy', '.vercel', 'scripts', 'assets',
    'content', 'prototypes')
def skip_file(rel):
    base = rel.rsplit('/', 1)[-1]
    if base.startswith('_') or base.startswith('google'):
        return True
    # 只跳过根目录的这几个（按完整路径判断，避免误伤 sellers/index.html 等）
    return rel in ('index.html', 'seller-inbox.html', 'seller-reply.html')

APPLY = '--apply' in sys.argv


def read(fp):
    return io.open(fp, encoding='utf-8', newline='').read()


def write(fp, s):
    io.open(fp, 'w', encoding='utf-8', newline='').write(s)


# ---------- 1. 从 index.html 抽取标准导航结构 ----------
idx = read(os.path.join(ROOT, 'index.html'))
m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', idx, re.S)
assert m, 'index nav not found'
IDX_NAV = m.group(1)

# 顺序保留：<a class="sidebar-*">、saved-hint、lang-btn
pat = re.compile(
    r'<a\s+href="([^"]*)"\s+class="sidebar-(link|sub)([^"]*)"([^>]*)>(.*?)</a>'
    r'|<div class="saved-hint"[^>]*>(.*?)</div>'
    r'|<button([^>]*class="sidebar-lang-btn"[^>]*)>(.*?)</button>', re.S)

STD = []
for mm in pat.finditer(IDX_NAV):
    if mm.group(1) is not None:
        STD.append({'kind': 'a', 'href': mm.group(1), 'cls': mm.group(2),
                    'extra': mm.group(3), 'attrs': mm.group(4), 'inner': mm.group(5)})
    elif mm.group(6) is not None:
        STD.append({'kind': 'hint', 'inner': mm.group(6), 'raw': mm.group(0)})
    else:
        STD.append({'kind': 'btn', 'attrs': mm.group(7), 'inner': mm.group(8), 'raw': mm.group(0)})

assert sum(1 for x in STD if x['kind'] == 'a') == 24, 'index nav item count != 24'


def pick_active(rel):
    """返回应高亮的目标 href（站内路径，不含前缀），None 表示不高亮"""
    exact = {'index.html': 'index.html', 'collection.html': 'collection.html',
             'insights.html': 'insights.html', 'about.html': 'about.html',
             'item.html': 'collection.html'}
    if rel in exact:
        return exact[rel]
    if rel.startswith('insights/'):
        return 'insights.html'
    if rel.startswith('items/'):
        return 'collection.html'
    if rel.startswith('sellers/'):
        return 'sellers/index.html'
    if rel.startswith(('categories/', 'tools/', 'my/')):
        return rel
    return None


def build_nav(rel, eol):
    depth = rel.count('/')
    prefix = '../' * depth
    is_home = (rel == 'index.html')
    active_target = pick_active(rel)
    out = []
    for it in STD:
        if it['kind'] == 'hint':
            if is_home:
                out.append(it['raw'])
            continue
        if it['kind'] == 'btn':
            out.append(it['raw'])
            continue
        href = it['href']
        target = None
        if href.startswith('#'):
            if is_home:
                newhref = href
                target = href.lstrip('#')          # 首页锚统一不高亮
            else:
                if href == '#insights':
                    newhref = prefix + 'insights.html'
                    target = 'insights.html'
                else:
                    newhref = prefix + 'index.html' + href
                    target = None
        else:
            newhref = prefix + href
            target = href
        cls = 'sidebar-' + it['cls']
        if target and active_target and target == active_target:
            cls += ' active'
        out.append('<a href="%s" class="%s"%s>%s</a>' % (newhref, cls, it['attrs'], it['inner']))
    return eol.join([''] + ['            ' + x for x in out] + ['        '])


changed, skipped, failed, nomatch = [], [], [], []
for dp, dn, fn in os.walk(ROOT):
    dn[:] = [d for d in dn if not SKIP_DIR(d)]
    for f in sorted(fn):
        if not f.endswith('.html'):
            continue
        fp = os.path.join(dp, f)
        rel = os.path.relpath(fp, ROOT).replace(os.sep, '/')
        if skip_file(rel):
            continue
        s = read(fp)
        m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', s, re.S)
        if not m:
            nomatch.append(rel)
            continue
        raw = io.open(fp, 'rb').read()
        eol = '\r\n' if raw.count(b'\r\n') > raw.count(b'\n') - raw.count(b'\r\n') else '\n'
        new_nav = build_nav(rel, eol)
        if m.group(1) == new_nav:
            skipped.append(rel)
            continue
        try:
            if APPLY:
                s2 = s[:m.start(1)] + new_nav + s[m.end(1):]
                write(fp, s2)
            changed.append(rel)
        except Exception as e:
            failed.append('%s: %s' % (rel, e))

print('APPLY =', APPLY)
print('已同步(将改写)：%d 页' % len(changed))
print('已一致(跳过)  ：%d 页' % len(skipped))
print('无 sidebar    ：%d 个 -> %s' % (len(nomatch), nomatch[:6]))
print('失败          ：%d' % len(failed))
if changed:
    print('\n样例（前 10）：')
    for x in changed[:10]:
        print('   ', x)
