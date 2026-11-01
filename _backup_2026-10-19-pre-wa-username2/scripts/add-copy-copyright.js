// 批量为 insights/*.html 添加复制时自动追加版权信息的脚本
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'insights');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const scriptBlock = `
<!-- 复制时自动追加版权信息 -->
<script>
(function () {
    var MIN_LEN = 30; // 复制文字超过该长度才追加，避免干扰短词复制
    document.addEventListener('copy', function (e) {
        var sel = window.getSelection();
        var text = sel ? sel.toString() : '';
        if (!text || text.length < MIN_LEN) return;
        if (text.indexOf('gudong.app原创内容') !== -1) return; // 避免重复追加
        var url = location.href.split('#')[0].split('?')[0];
        var lang = document.documentElement.lang || '';
        var notice = lang.indexOf('zh') === 0
            ? '\\n\\n本文为gudong.app原创内容，转载请注明出处\\n原文链接：' + url
            : '\\n\\nOriginal content by gudong.app. Please cite the source when reposting.\\nSource: ' + url;
        if (e.clipboardData && typeof e.clipboardData.setData === 'function') {
            e.clipboardData.setData('text/plain', text + notice);
            e.preventDefault();
        }
    });
})();
</script>
</body>`;

let ok = 0, skip = 0, fail = 0;
for (const f of files) {
    const fp = path.join(dir, f);
    try {
        let html = fs.readFileSync(fp, 'utf8');
        if (html.includes('gudong.app原创内容')) { skip++; continue; }
        if (!html.includes('</body>')) { console.error('NO </body>: ' + f); fail++; continue; }
        html = html.replace(/<\/body>/i, scriptBlock);
        fs.writeFileSync(fp, html, 'utf8');
        ok++;
    } catch (err) {
        console.error('FAIL ' + f + ': ' + err.message);
        fail++;
    }
}
console.log('Total: ' + files.length + ' | Inserted: ' + ok + ' | Skipped: ' + skip + ' | Failed: ' + fail);
