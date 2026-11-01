# -*- coding: utf-8 -*-
"""扫描全站 sidebar 现状：结构完整性 + 导航项差异（只读，不改动任何文件）"""
import io, os, re, json, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'_backup_2026-10-14', '_backup_2026-10-16-pre-header', '_backup_2026-10-16-pre-logo-fit',
             '_backup_2026-10-16-pre-share-fix', '_backup_2026-10-18-pre-canonical', '_backup_2026-10-18-pre-wa-bind-v2',
             '_backup_2026-10-18-pre-wa-username', '_backup_2026-10-18-pre-whatsapp', '_backup_2026-10-19-pre-header-mobile',
             '_backup_2026-10-19-pre-wa-username2', '_backup_2026-10-24-pre-item-snapshot', '_backup_2026-10-24-pre-sidebar-about',
             '_backup_2026-10-25-pre-pricing-revamp', '_upload-2026-10-17', '_upload-2026-10-24', '_upload-2026-10-24-b',
             'node_modules', 'airtable-script', '.workbuddy', '.vercel', 'scripts', 'assets'}

htmls = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('_backup') and not d.startswith('_upload')]
    for fn in filenames:
        if fn.endswith('.html'):
            htmls.append(os.path.join(dirpath, fn))

idx = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8', newline='').read()
m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', idx, re.S)
std_nav = re.findall(r'<a href="([^"]*)"[^>]*class="sidebar-(?:link|sub)', m.group(1))
std_links = [h for h in std_nav]
print('index 导航项数：', len(std_links))
print('index 导航项：')
for h in std_links:
    print('   ', h)

stats = collections.Counter()
missing_struct = collections.defaultdict(list)
diff_groups = collections.defaultdict(list)
no_sidebar = []

for fp in sorted(htmls):
    rel = os.path.relpath(fp, ROOT).replace('\\', '/')
    s = io.open(fp, encoding='utf-8', newline='').read()
    if 'sidebar-overlay' not in s and 'class="sidebar"' not in s:
        no_sidebar.append(rel)
        continue
    nav = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', s, re.S)
    if not nav:
        missing_struct['NO_NAV'].append(rel)
        continue
    links = re.findall(r'<a href="([^"]*)"[^>]*class="sidebar-(?:link|sub)', nav.group(1))
    key = '|'.join(links)
    diff_groups[key].append(rel)
    # 结构完整性
    if 'id="sidebarOverlay"' not in s: missing_struct['no_overlay'].append(rel)
    if 'class="sidebar-brand"' not in s: missing_struct['no_brand'].append(rel)
    if 'sidebar-lang-btn' not in s: missing_struct['no_langbtn'].append(rel)
    if '.sidebar-link {' not in s: missing_struct['no_css'].append(rel)
    if 'closeSidebar' not in s: missing_struct['no_js'].append(rel)
    stats[len(links)] += 1

print('\n总 HTML：', len(htmls), ' 无 sidebar：', len(no_sidebar))
print('导航项个数分布：', dict(stats))
print('\n=== 不同的导航组合（%d 组）===' % len(diff_groups))
for i, (k, v) in enumerate(sorted(diff_groups.items(), key=lambda x: -len(x[1]))):
    ls = k.split('|')
    print('\n[%d] %d 个页面，%d 项  e.g. %s' % (i, len(v), len(ls), v[0]))
    if len(ls) != len(std_links):
        print('    缺失:', [h for h in std_links if h not in ls])
        print('    多余:', [h for h in ls if h not in std_links])
    else:
        print('    顺序差异:', 'YES' if ls != std_links else 'no')

print('\n=== 结构缺失 ===')
for k, v in missing_struct.items():
    print(k, len(v), v[:8])
print('\n=== 无 sidebar 的页面 ===', no_sidebar[:20])
