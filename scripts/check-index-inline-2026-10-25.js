/* 提取 index.html 内联 <script>（跳过 application/ld+json）并交给 node --check 校验 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const FILE = process.argv[2] || 'index.html';
const html = fs.readFileSync(FILE, 'utf8');
const eol = html.includes('\r\n') ? '\r\n' : '\n';

const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, fail = 0, ok = 0;
while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/type\s*=\s*["']application\/ld\+json/i.test(attrs)) { ok++; continue; }
    if (/\bsrc\s*=/i.test(attrs)) { ok++; continue; }
    i++;
    const code = m[2];
    if (!code.trim()) { ok++; continue; }
    const tmp = path.join(os.tmpdir(), 'gd-idx-inline-' + i + '.js');
    fs.writeFileSync(tmp, code);
    try {
        execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
        ok++;
        console.log('  ✔ script#' + i + ' OK (' + code.split(/\r?\n/).length + ' 行)');
    } catch (e) {
        fail++;
        console.log('  ✖ script#' + i + ' SYNTAX ERROR');
        console.log(String(e.stderr || e.stdout || e).split(/\r?\n/).slice(0, 12).join('\n'));
    }
}
console.log('index.html 内联脚本校验：' + ok + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
