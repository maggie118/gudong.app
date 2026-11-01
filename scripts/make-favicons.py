# -*- coding: utf-8 -*-
"""
小尺寸 favicon 生成：裁边(居中) -> 阶梯 Lanczos 缩放 -> 分级锐化 -> PNG

为什么这么麻烦：
1. 直接从 120px 缩到 16px 会糊（一次缩放跨越 7 倍，细节全糊在一起）；
   从高清源图做「阶梯减半」再落靶，边缘保留度高得多。
2. 原图四周留白很多且不居中（上 141 / 下 182），小尺寸下等于白白丢像素，
   按内容裁成正方形并只留极窄边距，16px 下能多出约 30% 的有效像素。
3. 16px 太小，缩放后必须做一次针对性的 USM 锐化 + 轻微提对比，否则发灰发虚。

用法：
    python scripts/make-favicons.py                       # 默认生成 16/32 到 assets/icons
    python scripts/make-favicons.py --compare             # 额外输出对比图（含旧版）
    python scripts/make-favicons.py --src <图> --out <目录> --sizes 16 32 48
"""

import argparse
import os
import sys
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "assets", "icons", "icon-1024.png")
DEFAULT_OUT = os.path.join(ROOT, "assets", "icons")
PAD_RATIO = 0.03  # 内容外统一留白比例（极小，小尺寸下才有足够像素）


def content_bbox(im, threshold=24):
    """按与四角底色的差异找出主体边界。"""
    rgb = im.convert("RGB")
    bg = rgb.getpixel((4, 4))
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg)).convert("L")
    return diff.point(lambda v: 255 if v > threshold else 0).getbbox()


def square_crop(im, bbox, pad_ratio=PAD_RATIO, recenter=True):
    """裁成包含主体的正方形，边距极窄；recenter 时把主体居中（原图偏上）。"""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    side = max(w, h)
    cx = (x0 + x1) / 2 if recenter else im.width / 2
    cy = (y0 + y1) / 2 if recenter else im.height / 2
    side_pad = side * (1 + pad_ratio)
    half = side_pad / 2
    left, top = cx - half, cy - half
    # 允许贴边时平移，不裁掉内容、也不引入白框
    left = max(0, min(left, im.width - side_pad))
    top = max(0, min(top, im.height - side_pad))
    box = (int(round(left)), int(round(top)),
           int(round(left + side_pad)), int(round(top + side_pad)))
    return im.crop(box)


def resize_sharp(im, target, boost=1.0):
    """阶梯减半到 2x 目标，轻锐化后再落到目标，末端按尺寸分级锐化。"""
    cur = im
    while cur.width // 2 >= target * 2:
        cur = cur.resize((cur.width // 2, cur.height // 2), Image.LANCZOS)
    cur = cur.resize((target * 2, target * 2), Image.LANCZOS)
    cur = cur.filter(ImageFilter.UnsharpMask(radius=0.7, percent=70, threshold=2))
    cur = cur.resize((target, target), Image.LANCZOS)
    if target <= 20:
        cur = cur.filter(ImageFilter.UnsharpMask(radius=0.5, percent=110, threshold=2))
        cur = ImageEnhance.Contrast(cur).enhance(1.08 * boost)
    elif target <= 48:
        cur = cur.filter(ImageFilter.UnsharpMask(radius=0.6, percent=85, threshold=2))
        cur = ImageEnhance.Contrast(cur).enhance(1.05 * boost)
    else:
        cur = cur.filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=2))
    return cur


def make(im, size, crop=True, sharpen=True):
    src = square_crop(im, content_bbox(im)) if crop else im
    return resize_sharp(src, size) if sharpen else src.resize((size, size), Image.LANCZOS)


def make_ico(im, sizes, path):
    """多尺寸 ICO：把已锐化好的每一档原样内嵌，避免 Pillow 再插值一次。"""
    frames = [make(im, s).convert("RGBA") for s in sizes]
    frames[-1].save(path, format="ICO",
                    sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    return os.path.getsize(path)


def edge_energy(im):
    """清晰度指标：边缘能量均值，越大越锐。"""
    g = im.convert("L").filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(g).mean[0]


def save(im, path):
    im.convert("RGBA").save(path, "PNG", optimize=True)
    return os.path.getsize(path)


def montage(pairs, zoom, out_path, label_h=18, gap=14):
    """把多张图按同一放大倍率拼成对比图（最近邻，便于看像素）。"""
    from PIL import ImageDraw
    tiles = []
    for label, im in pairs:
        big = im.convert("RGBA").resize((im.width * zoom, im.height * zoom), Image.NEAREST)
        tiles.append((label, big))
    w = sum(t.width for _, t in tiles) + gap * (len(tiles) + 1)
    h = max(t.height for _, t in tiles) + label_h + gap * 2
    sheet = Image.new("RGB", (w, h), (245, 242, 236))
    d = ImageDraw.Draw(sheet)
    x = gap
    for label, t in tiles:
        sheet.paste(t, (x, gap + label_h), t)
        d.text((x, gap), label, fill=(60, 50, 42))
        x += t.width + gap
    sheet.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--sizes", nargs="*", type=int, default=[16, 32])
    ap.add_argument("--compare", action="store_true", help="输出对比图")
    ap.add_argument("--ico", action="store_true", help="同时重建根目录 favicon.ico（16/32/48 多尺寸）")
    ap.add_argument("--ico-sizes", nargs="*", type=int, default=[16, 32, 48])
    ap.add_argument("--zoom", type=int, default=12)
    args = ap.parse_args()

    src_hi = Image.open(args.src).convert("RGB")
    leg = Image.open(os.path.join(DEFAULT_OUT, "apple-touch-icon-120x120.png")).convert("RGB")
    old = {}
    for size in args.sizes:
        p = os.path.join(args.out, f"favicon-{size}x{size}.png")
        if os.path.exists(p):
            old[size] = Image.open(p).convert("RGB").copy()

    comparison = []
    for size in args.sizes:
        got = make(src_hi, size)
        path = os.path.join(args.out, f"favicon-{size}x{size}.png")
        n = save(got, path)
        print(f"[{size}px] 高清源+裁边+锐化  edge={edge_energy(got):6.2f}  {n:>6}B  -> {path}")
        naive = make(leg, size, crop=False, sharpen=False)
        print(f"[{size}px] 120px源直接缩放      edge={edge_energy(naive):6.2f}  （对照，仅供比较）")
        if size in old:
            print(f"[{size}px] 旧版文件             edge={edge_energy(old[size]):6.2f}")
        if args.compare:
            comparison.append((f"{size}px 新: 1024源+裁边+锐化", got))
            if size in old:
                comparison.append((f"{size}px 旧: 原文件", old[size]))
            comparison.append((f"{size}px 120源直接缩放", naive))
            comparison.append((f"{size}px 1024源不裁边", make(src_hi, size, crop=False)))

    if args.ico:
        ico_path = os.path.join(ROOT, "favicon.ico")
        n = make_ico(src_hi, args.ico_sizes, ico_path)
        back = Image.open(ico_path)
        print(f"[ico] {back.info.get('sizes')}  {n}B  -> {ico_path}")
        # 回读逐档比对，确认内嵌的就是锐化后的帧，而不是被再插值一遍
        for s in args.ico_sizes:
            want = make(src_hi, s)
            back.size = (s, s)
            back.load()
            got = back.convert("RGB")
            same = ImageChops.difference(want, got).getbbox() is None
            print(f"[ico] {s}x{s} 帧一致: {same}")

    if args.compare:
        tmp = os.path.join(ROOT, ".workbuddy", "tmp")
        os.makedirs(tmp, exist_ok=True)
        out = montage(comparison, args.zoom, os.path.join(tmp, "favicon-compare.png"))
        print("对比图:", out)


if __name__ == "__main__":
    sys.exit(main())
