# -*- coding: utf-8 -*-
"""校验全站侧边栏导航是否已与 index.html 一致：
1. 每项数量/顺序/href(深度修正后)/文案 与 index 完全一致
2. 链接目标文件真实存在（含 index.html#锚 的锚点在首页存在）
3. 每页恰好一个 .active（除无匹配项页面允许 0 个）
4. 保留各文件原有换行符
"""
import io, os, re, sys, posixpath

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIR = lambda d: d.startswith('_backup') or d.startswith('_upload') or d in (
    'node_modules', 'airtable-script', '.workbuddy', '.vercel', 'scripts', 'assets',
    'content', 'prototypes')
def skip_file(rel):
    base = rel.rsplit('/', 1)[-1]
    if base.startswith('_') or base.startswith('google'):
        return True
    return rel in ('seller-inbox.html', 'seller-reply.html')


def read(fp):
    return io.open(fp, encoding='utf-8', newline='').read()


# ---- 基准 ----
idx = read(os.path.join(ROOT, 'index.html'))
IDX_NAV = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', idx, re.S).group(1)
A = re.compile(r'<a\s+href="([^"]*)"\s+class="sidebar-(link|sub)([^"]*)"([^>]*)>(.*?)</a>', re.S)
STD = [(mm.group(1), mm.group(2), mm.group(5)) for mm in A.finditer(IDX_NAV)]
HOME_ANCHORS = set(re.findall(r'id="([^"]+)"', idx))

bad = []
checked = 0
active_zero = []
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
            bad.append('%s: 无 sidebar-nav' % rel)
            continue
        items = [(mm.group(1), mm.group(2), mm.group(5)) for mm in A.finditer(m.group(1))]
        checked += 1
        depth = rel.count('/')
        prefix = '../' * depth
        is_home = rel == 'index.html'
        if len(items) != len(STD):
            bad.append('%s: 项数 %d != %d' % (rel, len(items), len(STD)))
            continue
        actives = re.findall(r'class="sidebar-(?:link|sub) active"', m.group(1))
        if len(actives) > 1:
            bad.append('%s: 多处 active (%d)' % (rel, len(actives)))
        if len(actives) == 0:
            active_zero.append(rel)
        for (h1, c1, i1), (h0, c0, i0) in zip(items, STD):
            if h0.startswith('#'):
                if is_home:
                    exp = h0
                elif h0 == '#insights':
                    exp = prefix + 'insights.html'
                else:
                    exp = prefix + 'index.html' + h0
            else:
                exp = prefix + h0
            if h1 != exp:
                bad.append('%s: href 不符 %s != %s' % (rel, h1, exp))
            if c1 != c0:
                bad.append('%s: 类型不符 %s != %s (%s)' % (rel, c1, c0, h1))
            if i1 != i0:
                bad.append('%s: 文案不符 (%s)' % (rel, h0))
            # 目标存在性
            tgt = exp.split('#')[0]
            real = posixpath.normpath(posixpath.join(posixpath.dirname(rel), tgt))
            if not os.path.exists(os.path.join(ROOT, real)):
                bad.append('%s: 目标不存在 %s -> %s' % (rel, exp, real))
            elif '#' in exp:
                anc = exp.split('#')[1]
                if anc not in HOME_ANCHORS:
                    bad.append('%s: 锚点缺失 #%s' % (rel, anc))
        # 换行符
        raw = io.open(fp, 'rb').read()
        crlf, lf = raw.count(b'\r\n'), raw.count(b'\n') - raw.count(b'\r\n')
        if crlf > 0 and lf > 0:
            bad.append('%s: CRLF/LF 混用 (%d/%d)' % (rel, crlf, lf))

print('已校验页面：%d' % checked)
print('无 active 的页面：%d -> %s' % (len(active_zero), active_zero[:8]))
print('问题数：%d' % len(bad))
for x in bad[:60]:
    print('  -', x)
sys.exit(1 if bad else 0)
