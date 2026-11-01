#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把全站 <footer> 内容统一为 pricing.html 基线版。

处理项：
  1. 整块替换 <footer>...</footer>（自动按页面深度加 ../ 前缀）
  2. 缺失 footer 补丁样式（.footer-brand / .app-install-btn 等）的页面自动注入
  3. 给 .app-install-btn 的 --color-qianjinzong 补兜底色（部分页面无此变量）
  * 幂等：重复执行不产生二次改动

用法：
  python scripts/sync-footer-2026-10-26.py           # 预览
  python scripts/sync-footer-2026-10-26.py --apply   # 写入
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_PAGE = 'pricing.html'
APPLY = '--apply' in sys.argv

EXCLUDE_DIRS = {'airtable-script', 'node_modules', '.workbuddy', 'prototypes',
                'scripts', 'templates', 'content', 'docs', '.vercel', '.git'}
EXCLUDE_FILES = {
    os.path.join('assets', 'images', 'lim-kw', 'item-lim-01.html'),
    os.path.join('assets', 'brand', 'logo-preview.html'),
}

FOOTER_RE = re.compile(rb'<footer\b.*?</footer>', re.S | re.I)
HREF_RE = re.compile(rb'href="(?!#|javascript:|mailto:|https?:|//)([^"]+)"')
MARKER = b'gd-footer-sync-2026-10-26'

PATCH_CSS = """<style>
/* gd-footer-sync-2026-10-26 · 页脚统一补丁（与 pricing.html 一致） */
.footer-brand { font-weight: 700; font-size: .84rem; color: #5c564f; margin-bottom: .35rem; }
.footer-disclaimer { max-width: 680px; margin: 0 auto 1.1rem; font-size: .78rem; line-height: 1.65; color: #8a8178; }
.footer-copyright { margin-bottom: .3rem; }
.app-install-btn {
    display: inline-flex; align-items: center; gap: .3rem;
    margin-left: .6rem; padding: .5rem .85rem; min-height: 40px;
    border: 1px solid var(--color-border); border-radius: 999px;
    color: var(--color-qianjinzong, #8B6F47); font-size: .76rem; text-decoration: none;
    vertical-align: middle; transition: all .3s ease;
}
.app-install-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }
.app-install-btn svg { width: 12px; height: 12px; flex-shrink: 0; fill: currentColor; }
</style>
"""

# 兜底色：无 --color-qianjinzong 的页面按钮会掉色
COLOR_FIX = (b'color: var(--color-qianjinzong);',
             b'color: var(--color-qianjinzong, #8B6F47);')


def eol_of(raw: bytes) -> bytes:
    return b'\r\n' if raw.count(b'\r\n') * 2 > raw.count(b'\n') else b'\n'


def main():
    base_raw = open(os.path.join(ROOT, BASE_PAGE), 'rb').read()
    m = FOOTER_RE.search(base_raw)
    if not m:
        print('ERROR: %s 无 footer' % BASE_PAGE); sys.exit(1)
    base_footer = m.group(0).replace(b'\r\n', b'\n')
    print('基线 footer: %d 字节（源自 %s）' % (len(base_footer), BASE_PAGE))
    print('模式: %s' % ('写入 --apply' if APPLY else '预览（未写盘）'))
    print('=' * 70)

    stats = {'skipped_no_footer': [], 'footer_changed': 0, 'footer_same': 0,
             'css_injected': 0, 'color_fixed': 0, 'deep': [], 'errors': []}

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in EXCLUDE_DIRS and not d.startswith('_')]
        for fn in sorted(filenames):
            if not fn.endswith('.html') or fn.startswith('_'):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            if rel in EXCLUDE_FILES or rel == BASE_PAGE:
                continue

            raw = open(full, 'rb').read()
            eol = eol_of(raw)
            ms = FOOTER_RE.findall(raw)
            if not ms:
                stats['skipped_no_footer'].append(rel)
                continue

            depth = rel.count(os.sep)
            if depth >= 2:
                stats['deep'].append((rel, depth))
            prefix = ('../' * depth).encode()

            # 1) 生成目标 footer（给站内相对链接加深度前缀）
            new_footer = HREF_RE.sub(lambda mo: b'href="' + prefix + mo.group(1) + b'"',
                                     base_footer)
            new_footer = new_footer.replace(b'\n', eol)

            cur_footer = ms[0]
            changed = False

            if re.sub(rb'\s+', b' ', cur_footer) != re.sub(rb'\s+', b' ', new_footer):
                raw = raw.replace(cur_footer, new_footer, 1)
                stats['footer_changed'] += 1
                changed = True
            else:
                stats['footer_same'] += 1

            # 2) 缺补丁样式则注入
            if b'.app-install-btn' not in raw and MARKER not in raw:
                patch = PATCH_CSS.encode('utf-8').replace(b'\n', eol) + eol
                idx = raw.find(b'<footer')
                raw = raw[:idx] + patch + raw[idx:]
                stats['css_injected'] += 1
                changed = True

            # 3) 兜底色
            if COLOR_FIX[0] in raw:
                raw = raw.replace(COLOR_FIX[0], COLOR_FIX[1])
                stats['color_fixed'] += 1
                changed = True

            if changed and APPLY:
                tmp = full + '.__tmp'
                with open(tmp, 'wb') as f:
                    f.write(raw)
                os.replace(tmp, full)

            if changed:
                print('  [改] %s' % rel)

    print('=' * 70)
    print('footer 已更新 : %d' % stats['footer_changed'])
    print('footer 已一致 : %d' % stats['footer_same'])
    print('注入补丁样式 : %d' % stats['css_injected'])
    print('补兜底色     : %d' % stats['color_fixed'])
    print('无 footer 跳过: %d  -> %s' % (len(stats['skipped_no_footer']),
                                        stats['skipped_no_footer']))
    if stats['deep']:
        print('深度>=2 页面  : %s' % stats['deep'])
    if not APPLY:
        print('\n（预览模式，未写盘。加 --apply 生效）')


if __name__ == '__main__':
    main()
