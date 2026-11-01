# -*- coding: utf-8 -*-
import io, os, re, difflib, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('syncmod', os.path.join(ROOT, 'scripts', 'sync-sidebar-nav-2026-10-26.py'))
mod = importlib.util.module_from_spec(spec)
sys.argv = ['x']
spec.loader.exec_module(mod)

targets = sys.argv[1:] or ['index.html', 'insights/qing-porcelain-dating.html', 'items/item-lim-04.html']
for rel in ['index.html', 'insights/qing-porcelain-dating.html', 'items/item-lim-04.html']:
    fp = os.path.join(ROOT, rel)
    s = mod.read(fp)
    raw = io.open(fp, 'rb').read()
    eol = '\r\n' if raw.count(b'\r\n') > raw.count(b'\n') - raw.count(b'\r\n') else '\n'
    m = re.search(r'<nav class="sidebar-nav">(.*?)</nav>', s, re.S)
    new = mod.build_nav(rel, eol)
    old = m.group(1)
    print('==== %s ====' % rel)
    for line in difflib.unified_diff(old.splitlines(), new.splitlines(), 'OLD', 'NEW', lineterm='', n=0):
        print(line[:200])
    print()
