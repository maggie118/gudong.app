# -*- coding: utf-8 -*-
"""逐页细查 sidebar 问题：active 高亮、相对路径深度、saved-hint、锚点有效性（只读）"""
import io, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = lambda d: d.startswith('_backup') or d.startswith('_upload') or d in (
    'node_modules', 'airtable-script', '.workbuddy', '.vercel', 'scripts', 'assets')

files = []
for dp, dn, fn in os.walk(ROOT):
    dn[:] = [d for d in dn if not SKIP(d)]
    for f in fn:
        if f.endswith('.html'):
            files.append(os.path.join(dp, f))

NAV_TARGETS = ['index.html', 'my/saved.html', 'my/briefing.html', 'collection.html', 'insights.html',
               'sellers/index.html', 'tools/index.html', 'about.html', 'pricing.html']

problems = collections.defaultdict(list)
active_info = collections.Counter()

for fp in sorted(files):
    rel = os.path.relpath(fp, ROOT).replace(os.sep, '/')
    if rel.startswith('content/') or rel.startswith('prototypes/') or rel.startswith('_') or rel.startswith('google'):
        continue
    s = io.open(fp, encoding='utf-8', newline='').read()
    m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', s, re.S)
    if not m:
        continue
    depth = rel.count('/')
    need = '../' * depth
    nav = m.group(1)
    items = re.findall(r'<a href="([^"]*)"\s+class="sidebar-(link|sub)([^"]*)"', nav)
    hrefs = [a[0] for a in items]

    # 1) 相对路径前缀深度
    for h in hrefs:
        if h.startswith('#'):
            continue
        base = h.split('#')[0]
        if base.startswith('../') or '/' in base or base.endswith('.html'):
            exp = need + base.lstrip('./').replace('../', '')
            up = base.count('../')
            if up != depth:
                problems['DEPTH_WRONG'].append('%s  href=%s (应 %d 层 ../)' % (rel, h, depth))
    # 2) active 高亮
    active = [a for a in items if 'active' in a[2]]
    if len(active) == 0:
        problems['NO_ACTIVE'].append(rel)
    elif len(active) > 1:
        problems['MULTI_ACTIVE'].append('%s -> %s' % (rel, [a[0] for a in active]))
    else:
        active_info[active[0][0]] += 1
        # 高亮项应与当前页匹配（规范化后）
        cur = rel.replace('../', '')
        ah = active[0][0].replace('../', '').split('#')[0]
        if ah not in (cur, os.path.basename(cur)) and ah != cur:
            problems['ACTIVE_MISMATCH'].append('%s  高亮=%s' % (rel, active[0][0]))
    # 3) saved-hint
    if 'saved-hint' not in nav:
        problems['NO_SAVED_HINT'].append(rel)
    # 4) 页内锚点有效性
    for h in hrefs:
        if h.startswith('#'):
            anchor = h[1:]
            if 'id="%s"' % anchor not in s:
                problems['DEAD_ANCHOR'].append('%s  #%s' % (rel, anchor))

print('=== 问题汇总 ===')
for k, v in problems.items():
    print('\n[%s] %d 个' % (k, len(v)))
    for x in v[:12]:
        print('   ', x)
    if len(v) > 12:
        print('    ...(%d)' % (len(v) - 12))

print('\n=== 当前 highligh 分布（前 20）===')
for k, v in active_info.most_common(20):
    print('   %-40s %d' % (k, v))
