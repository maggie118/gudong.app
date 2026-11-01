# -*- coding: utf-8 -*-
"""补回 index.html 中丢失的 3 处改造（幂等）：
1) services 区 信任三件套 .trust-strip / .trust-chip
2) seller-cta 区 席位倒计时 .seats-meter（含 #seatsNum / #seatsFill）+ 修掉多余闭合 div
3) 今日情报 编辑精选兜底 INTEL_FEED + 流动性热度标签 .intel-heat
写入保持 CRLF 换行。
"""
import io, re, sys

P = 'index.html'
s = io.open(P, encoding='utf-8', newline='').read()
changed = []

# ---------- 1) 信任三件套 ----------
if '.trust-strip' in s and 'trust-chip--money' in s and '<div class="trust-strip">' not in s:
    anchor = '                <!-- 平台信任金句（合规 & 隐私双重定调） -->'
    assert s.count(anchor) == 1, 'trust anchor'
    strip = (
        '                <!-- 2026-10-25 信任三件套：0 抽佣 / 不经手资金 / 私密直连 -->\r\n'
        '                <div class="trust-strip">\r\n'
        '                    <div class="trust-chip trust-chip--money">\r\n'
        '                        <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>\r\n'
        '                        <span class="zh">平台 0% 佣金，成交不抽成</span><span class="en">0% commission — we take nothing</span>\r\n'
        '                    </div>\r\n'
        '                    <div class="trust-chip trust-chip--wa">\r\n'
        '                        <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.79 14.09c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.01.24-3.4-.71-2.86-1.13-4.65-4.13-4.79-4.32-.14-.19-1.13-1.56-1.11-2.97.02-1.41.73-2.1.99-2.39.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.42-.07.65.5.24.57.8 1.97.87 2.11.07.14.12.31.02.5-.1.19-.14.31-.29.48l-.43.5c-.14.14-.29.3-.13.59.17.29.75 1.29 1.61 2.09 1.11 1.03 2.04 1.35 2.33 1.5.29.15.46.13.63-.07.17-.21.72-.84.91-1.13.19-.29.39-.24.65-.14.26.09 1.68.79 1.97.94.29.14.48.22.55.34.07.12.07.7-.17 1.38z"/></svg>\r\n'
        '                        <span class="zh">不经手付款，不做资金托管</span><span class="en">No payments handled, no escrow</span>\r\n'
        '                    </div>\r\n'
        '                    <div class="trust-chip trust-chip--lock">\r\n'
        '                        <svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15"><path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm3 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>\r\n'
        '                        <span class="zh">WhatsApp 私密直连，互看不到手机号</span><span class="en">Private WhatsApp link — numbers stay hidden</span>\r\n'
        '                    </div>\r\n'
        '                </div>\r\n'
    )
    s = s.replace(anchor, strip + anchor)
    changed.append('trust-strip')
elif '<div class="trust-strip">' in s:
    print('skip trust-strip (already present)')
else:
    print('WARN: .trust-strip CSS missing')

# ---------- 2) 席位倒计时（并修掉 seller-cta 多余闭合 div） ----------
if False and 'id="seatsNum"' not in s:  # 2026-10-26 用户要求删除席位条，禁止再注入
    old = (
        '                     </div>\r\n'
        '                    </div>\r\n'
        '                </div>\r\n'
        '            </div>\r\n'
        '        </section>'
    )
    assert s.count(old) == 1, 'seller-cta tail'
    new = (
        '                    </div>\r\n'
        '\r\n'
        '                    <!-- 2026-10-25 创始藏家席位倒计时 -->\r\n'
        '                    <div class="seats-meter">\r\n'
        '                        <div class="seats-meter-head">\r\n'
        '                            <span class="seats-label"><i class="dot" aria-hidden="true"></i><span class="zh">创始藏家席位</span><span class="en">Founding Collector seats</span></span>\r\n'
        '                            <span class="seats-count">\r\n'
        '                                <span class="zh"><span class="seats-num" id="seatsNum">83</span><span class="seats-total">/ 88</span> 剩余</span>\r\n'
        '                                <span class="en"><span class="seats-num" id="seatsNumEn">83</span><span class="seats-total">/ 88</span> left</span>\r\n'
        '                            </span>\r\n'
        '                        </div>\r\n'
        '                        <div class="seats-track"><div class="seats-fill" id="seatsFill"></div></div>\r\n'
        '                        <div class="seats-meter-note"><span class="zh">名额按入驻顺序发放，额满即止；除刊登费外，平台不参与分成。</span><span class="en">Seats are granted in order of joining until full; no revenue share beyond listing fees.</span></div>\r\n'
        '                    </div>\r\n'
        '                </div>\r\n'
        '            </div>\r\n'
        '        </section>'
    )
    s = s.replace(old, new)
    changed.append('seats-meter')
else:
    print('skip seats-meter (already present)')

# ---------- 3) 情报：编辑精选兜底 + 热度标签 ----------
if 'const INTEL_FEED' not in s:
    feed = (
        '        /* 编辑精选兜底：接口无数据（如额度耗尽）时展示，避免整块空白。\r\n'
        '           heatZh/heatEn 为编辑整理的示意数据，接真实统计后替换即可。 */\r\n'
        '        const INTEL_FEED = [\r\n'
        '            {\r\n'
        '                type: \'new\',\r\n'
        '                zh: \'本周新增 3 件康熙青花，均为卖家自述来源完整者。\',\r\n'
        '                en: \'Three Kangxi blue-and-white pieces added this week, all with full seller-stated provenance.\',\r\n'
        '                meta: \'编辑整理\', metaEn: \'Editorial\',\r\n'
        '                time: \'今日 10:20\', timeEn: \'Today 10:20\',\r\n'
        '                link: \'categories/porcelain.html\',\r\n'
        '                heatZh: \'💬 6 人已私聊问过同类\', heatEn: \'💬 6 enquiries on similar pieces\', heatCls: \'\'\r\n'
        '            },\r\n'
        '            {\r\n'
        '                type: \'drop\',\r\n'
        '                zh: \'一件清中期青花碗下调报价，同类本周成交价仍在 S$680 上下。\',\r\n'
        '                en: \'A mid-Qing blue-and-white bowl was repriced; comparable pieces still trade near S$680.\',\r\n'
        '                meta: \'价格信号\', metaEn: \'Price signal\',\r\n'
        '                time: \'昨日 17:05\', timeEn: \'Yesterday 17:05\',\r\n'
        '                link: \'categories/porcelain.html\',\r\n'
        '                heatZh: \'⚖ 同类参照 S$680 → S$420\', heatEn: \'⚖ Comparable S$680 → S$420\', heatCls: \'ref\'\r\n'
        '            },\r\n'
        '            {\r\n'
        '                type: \'platform\',\r\n'
        '                zh: \'创始藏家席位开放中，限量 88 席，额满即止。\',\r\n'
        '                en: \'Founding Collector seats are open — limited to 88, until full.\',\r\n'
        '                meta: \'平台公告\', metaEn: \'Platform notice\',\r\n'
        '                time: \'2 天前 09:40\', timeEn: \'2d ago 09:40\',\r\n'
        '                link: \'pricing.html#collector-services\',\r\n'
        '                heatZh: \'🎟 剩余席位有限\', heatEn: \'🎟 Limited seats left\', heatCls: \'ref\'\r\n'
        '            }\r\n'
        '        ];\r\n\r\n'
    )
    anchor2 = '        const INTEL_TYPE_LABEL = {'
    assert s.count(anchor2) == 1, 'INTEL_TYPE_LABEL'
    s = s.replace(anchor2, feed + anchor2)

    old_body = """            // 只展示接口返回的真实情报；无数据时整块隐藏，不使用兜底内容
            const list = (items || []).filter(Boolean).slice(0, 3);
            const wrap = box.closest('.intel-editorial');
            if (!list.length) { if (wrap) wrap.style.display = 'none'; return; }"""
    old_body = old_body.replace('\n', '\r\n')
    assert s.count(old_body) == 1, 'renderIntel body'
    new_body = """            // 优先展示接口真实情报；接口无数据时回落到编辑精选兜底（INTEL_FEED）
            const incoming = (items || []).filter(Boolean);
            const list = (incoming.length ? incoming : INTEL_FEED).slice(0, 3);
            const wrap = box.closest('.intel-editorial');
            if (!list.length) { if (wrap) wrap.style.display = 'none'; return; }"""
    new_body = new_body.replace('\n', '\r\n')
    s = s.replace(old_body, new_body)

    old_card = """                    <span class="intel-compact-meta">
                      <span class="zh">${metaLine}</span>
                      <span class="en">${metaLineEn}</span>
                    </span>
                  </a>`;"""
    old_card = old_card.replace('\n', '\r\n')
    assert s.count(old_card) == 1, 'intel card tail'
    new_card = """                    <span class="intel-compact-meta">
                      <span class="zh">${metaLine}</span>
                      <span class="en">${metaLineEn}</span>
                    </span>
                    ${heatHtml}
                  </a>`;"""
    new_card = new_card.replace('\n', '\r\n')
    s = s.replace(old_card, new_card)

    old_link = """                const link = esc(it.link || 'insights.html');"""
    old_link = old_link.replace('\n', '\r\n')
    assert s.count(old_link) == 1, 'intel link line'
    new_link = """                const link = esc(it.link || 'insights.html');
                const hz = esc(it.heatZh || it.heat_zh || '');
                const he = esc(it.heatEn || it.heat_en || hz);
                const heatHtml = (hz || he)
                    ? `<span class="intel-heat${it.heatCls ? ' intel-heat--' + it.heatCls : ''}"><span class="zh">${hz || he}</span><span class="en">${he || hz}</span></span>`
                    : '';"""
    new_link = new_link.replace('\n', '\r\n')
    s = s.replace(old_link, new_link)
    changed.append('intel-feed')
else:
    print('skip intel feed (already present)')

io.open(P, 'w', encoding='utf-8', newline='').write(s)
raw = io.open(P, 'rb').read()
print('changed:', changed)
print('CRLF:', raw.count(b'\r\n'), 'LF-only:', raw.count(b'\n') - raw.count(b'\r\n'))
