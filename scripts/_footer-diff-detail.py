#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把各页 footer 与基线做细粒度 diff，只打印差异片段。"""
import os, re, sys, difflib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOTER_RE = re.compile(rb'<footer\b.*?</footer>', re.S | re.I)

base = FOOTER_RE.search(open(os.path.join(ROOT, 'pricing.html'), 'rb').read()).group(0)
base_s = base.decode('utf-8', 'replace')

targets = sys.argv[1:]
if not targets:
    targets = ['index.html', 'about.html', 'collection.html', 'insights.html',
               'items/item-lim-04.html', 'insights/guide-01.html',
               'categories/jade.html', 'sellers/index.html']

for t in targets:
    p = os.path.join(ROOT, t)
    if not os.path.exists(p):
        print('!! 不存在 ' + t); continue
    fb = FOOTER_RE.search(open(p, 'rb').read())
    if not fb:
        print('!! 无 footer ' + t); continue
    s = fb.group(0).decode('utf-8', 'replace')
    print('=' * 72)
    print(t)
    for line in difflib.unified_diff(base_s.splitlines(), s.splitlines(),
                                     'BASE', t, lineterm='', n=0):
        print(line[:400])
