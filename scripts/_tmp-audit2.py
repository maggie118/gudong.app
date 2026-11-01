# -*- coding: utf-8 -*-
"""规范化路径（去掉 ../ 与中间目录前缀）后对比各页 sidebar 导航项"""
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


def norm(h):
    h = h.replace('../', '')
    h = re.sub(r'^(my|categories|sellers|tools|insights)/', r'\1/', h)
    return h


groups = collections.defaultdict(list)
for fp in sorted(files):
    rel = os.path.relpath(fp, ROOT).replace(os.sep, '/')
    s = io.open(fp, encoding='utf-8', newline='').read()
    m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', s, re.S)
    if not m:
        continue
    links = [norm(h) for h in re.findall(r'<a href="([^"]*)"[^>]*class="sidebar-(?:link|sub)', m.group(1))]
    groups['|'.join(links)].append(rel)

print('规范化后组合数：', len(groups))
for k, v in sorted(groups.items(), key=lambda x: -len(x[1])):
    ls = k.split('|')
    print('\n--- %d 页，%d 项，例：%s' % (len(v), len(ls), v[0]))
    print('   ', ' | '.join(ls))
    if len(v) <= 12:
        print('    包含页面:', v)
