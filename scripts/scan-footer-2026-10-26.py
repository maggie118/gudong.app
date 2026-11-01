#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""扫描全站 <footer> 块并与 pricing.html 基线比对（只统计，不修改）。"""
import os, re, sys, json, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {'airtable-script', 'node_modules', '.workbuddy', 'prototypes',
                'scripts', 'templates', 'content', 'docs', '.vercel', '.git'}
EXCLUDE_FILES = {
    os.path.join('assets', 'images', 'lim-kw', 'item-lim-01.html'),
    os.path.join('assets', 'brand', 'logo-preview.html'),
}

FOOTER_RE = re.compile(rb'<footer\b.*?</footer>', re.S | re.I)


def is_excluded(rel):
    parts = rel.split(os.sep)
    for p in parts[:-1]:
        if p in EXCLUDE_DIRS or p.startswith('_'):
            return True
    if rel in EXCLUDE_FILES:
        return True
    return False


def norm(b):
    """归一化：去掉换行/多余空白，便于比较"""
    s = b.decode('utf-8', 'replace')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def main():
    pages = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in EXCLUDE_DIRS and not d.startswith('_')]
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT)
            if is_excluded(rel):
                continue
            pages.append((rel, full))
    pages.sort()

    # 基线
    base_path = os.path.join(ROOT, 'pricing.html')
    with open(base_path, 'rb') as f:
        base_raw = f.read()
    m = FOOTER_RE.search(base_raw)
    if not m:
        print('ERROR: pricing.html 未找到 footer'); sys.exit(1)
    base_footer = m.group(0)
    base_norm = norm(base_footer)
    print('基线块字节数: %d' % len(base_footer))
    print('=' * 70)

    no_footer, same, diff = [], [], []
    for rel, full in pages:
        with open(full, 'rb') as f:
            raw = f.read()
        ms = FOOTER_RE.findall(raw)
        if not ms:
            no_footer.append(rel)
            continue
        if len(ms) > 1:
            print('[WARN] %s 有 %d 个 footer 块' % (rel, len(ms)))
        fb = ms[0]
        if norm(fb) == base_norm:
            same.append(rel)
        else:
            diff.append((rel, fb))

    print('总页面: %d' % len(pages))
    print('完全一致: %d' % len(same))
    print('不一致:   %d' % len(diff))
    print('无 footer: %d' % len(no_footer))
    print('=' * 70)

    if no_footer:
        print('\n--- 无 footer ---')
        for r in no_footer:
            print('  ' + r)

    # 差异特征统计
    print('\n--- 差异页特征 ---')
    feat = {}
    for rel, fb in diff:
        s = fb.decode('utf-8', 'replace')
        flags = []
        if 'footer-brand' not in s:
            flags.append('缺footer-brand')
        if 'app-install-btn' not in s:
            flags.append('缺安装按钮')
        if '高端古董发现平台' not in s and 'Premium antiques discovery' not in s:
            flags.append('缺brand文案')
        if '不参与任何买卖交易' not in s and 'does not participate in any transaction' not in s:
            flags.append('缺免责文案')
        if '未经授权' in s or 'Unauthorized reproduction' in s:
            flags.append('仍在用旧版权声明')
        if 'footer-nav' not in s:
            flags.append('缺footer-nav')
        key = ','.join(flags) if flags else '结构同但内容微差'
        feat.setdefault(key, []).append(rel)
    for k in sorted(feat, key=lambda x: -len(feat[x])):
        print('\n[%s]  %d 个' % (k, len(feat[k])))
        for r in feat[k][:8]:
            print('    ' + r)
        if len(feat[k]) > 8:
            print('    ... 等 %d 个' % (len(feat[k]) - 8))

    # 保存完整差异清单
    out = os.path.join(ROOT, 'scripts', '_footer-scan-result.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'same': same, 'diff': [r for r, _ in diff],
                   'no_footer': no_footer}, f, ensure_ascii=False, indent=1)
    print('\n清单已存: %s' % out)


if __name__ == '__main__':
    main()
