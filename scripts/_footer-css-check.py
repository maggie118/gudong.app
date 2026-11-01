#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""检查各页是否已有 .app-install-btn / .footer-brand 的样式定义，以及深度分布。"""
import os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {'airtable-script', 'node_modules', '.workbuddy', 'prototypes',
                'scripts', 'templates', 'content', 'docs', '.vercel', '.git'}
FOOTER_RE = re.compile(rb'<footer\b.*?</footer>', re.S | re.I)

depth = collections.Counter()
no_btn_css, no_brand_css = [], []
nav_variants = collections.Counter()

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith('_')]
    for fn in filenames:
        if not fn.endswith('.html') or fn.startswith('_'):
            continue
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, ROOT)
        raw = open(full, 'rb').read()
        depth[rel.count(os.sep)] += 1
        if not FOOTER_RE.search(raw):
            continue
        s = raw.decode('utf-8', 'replace')
        if '.app-install-btn' not in s:
            no_btn_css.append(rel)
        if '.footer-brand' not in s:
            no_brand_css.append(rel)
        m = re.search(r'<div class="footer-nav">(.*?)</div>', s, re.S)
        if m:
            key = re.sub(r'\s+', ' ', re.sub(r'href="[^"]*"', 'href=?', m.group(1))).strip()
            nav_variants[key] += 1

print('深度分布:', dict(depth))
print('\n缺少 .app-install-btn 样式定义的页 (%d):' % len(no_btn_css))
for r in no_btn_css[:10]: print('  ' + r)
print('\n缺少 .footer-brand 样式定义的页 (%d):' % len(no_brand_css))
for r in no_brand_css[:10]: print('  ' + r)

print('\n--- footer-nav 变体 (共 %d 种) ---' % len(nav_variants))
for k, c in nav_variants.most_common():
    print('\n[%d 页] %s' % (c, k))
