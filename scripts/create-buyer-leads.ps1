# 在 Airtable 里创建 buyer_leads 表（Gudong 买家名单）
# 用法：
#   .\scripts\create-buyer-leads.ps1 -Pat "patXXXXXXXXXXXXXX"
#   .\scripts\create-buyer-leads.ps1 -Pat "pat..." -Base "appXXXXXXXXXXXXXX"
# 需要的 PAT scope：data.records:read / data.records:write / schema.bases:read / schema.bases:write
# 可重复执行：表已存在时只做字段体检，不会重复建表、不会动已有数据。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Pat,
    [string]$Base = 'apprn6XDQnAm8bkaT',
    [string]$Table = 'buyer_leads'
)

$ErrorActionPreference = 'Stop'
$headers = @{ Authorization = "Bearer $Pat" }
$api = "https://api.airtable.com/v0/meta/bases/$Base/tables"

# 期望的字段（名字必须一字不差，代码按名字读写）
$spec = @(
    @{ name = 'contact';      type = 'singleLineText'; why = 'WhatsApp 或邮箱（主字段）' },
    @{ name = 'contact_type'; type = 'singleLineText'; why = 'whatsapp / email' },
    @{ name = 'seller';       type = 'singleLineText'; why = '藏家 ID，首页与名录为空' },
    @{ name = 'source';       type = 'singleLineText'; why = 'home / sellers-index / seller-page / item-page' },
    @{ name = 'lang';         type = 'singleLineText'; why = 'zh / en' },
    @{ name = 'page';         type = 'singleLineText'; why = '提交页路径' },
    @{ name = 'follows';      type = 'multilineText';  why = 'seller:xxx; tag:瓷器' },
    @{ name = 'created_at';   type = 'singleLineText'; why = 'ISO 时间' },
    @{ name = 'status';       type = 'singleLineText'; why = 'active / unsubscribed' }
)

function ShowApiError($err) {
    $status = $null
    if ($err.Exception.PSObject.Properties.Name -contains 'Response' -and $err.Exception.Response) {
        $status = $err.Exception.Response.StatusCode.value__
    }
    $body = $err.ErrorDetails.Message
    Write-Host ("[X] HTTP {0}" -f $status) -ForegroundColor Red
    if ($body) { Write-Host $body }
    switch ($status) {
        401 { Write-Host '提示：PAT 无效或未授权这个 base。' -ForegroundColor Yellow }
        403 {
            Write-Host '提示：PAT 少了 scope。建表需要 schema.bases:write，读写记录需要 data.records:read / data.records:write。' -ForegroundColor Yellow
            Write-Host '      重新生成：https://airtable.com/create/tokens' -ForegroundColor Yellow
        }
        404 { Write-Host ("提示：base id 不对？当前用的是 {0}" -f $Base) -ForegroundColor Yellow }
        default { Write-Host '提示：把上面这段原文发我，我按返回码给下一步。' -ForegroundColor Yellow }
    }
}

Write-Host ("base = {0} / table = {1}" -f $Base, $Table)

# 1) 先列出现有表
try {
    $existing = Invoke-RestMethod -Uri $api -Method Get -Headers $headers
} catch {
    ShowApiError($_)
    exit 1
}

$hit = $existing.tables | Where-Object { $_.name -eq $Table }

if ($hit) {
    Write-Host '[*] 表已存在，做字段体检（不改动任何数据）' -ForegroundColor Green
    $have = @($hit.fields | ForEach-Object { $_.name })
    $missing = @()
    foreach ($f in $spec) {
        $ok = $have -contains $f.name
        if (-not $ok) { $missing += $f.name }
        Write-Host ("    {0,-14} {1}" -f $f.name, $(if ($ok) { 'OK' } else { '缺失' }))
    }
    if ($missing.Count -gt 0) {
        Write-Host ("[!] 缺字段：{0} —— 在 Airtable 里手工加同名字段即可，类型见 docs/BUYER_LIST.md" -f ($missing -join ', ')) -ForegroundColor Yellow
        exit 2
    }
    Write-Host '[OK] 字段齐全，不用再做别的。' -ForegroundColor Green
    exit 0
}

# 2) 建表
Write-Host '[*] 未发现 buyer_leads，开始创建'
$body = @{
    name        = $Table
    description = 'Gudong 买家名单：WhatsApp / 邮箱 + 关注的藏家与品类'
    fields      = @($spec | ForEach-Object { @{ name = $_.name; type = $_.type } })
} | ConvertTo-Json -Depth 6
$bytes = [Text.Encoding]::UTF8.GetBytes($body)

try {
    $created = Invoke-RestMethod -Uri $api -Method Post -Headers $headers `
        -ContentType 'application/json' -Body $bytes
} catch {
    ShowApiError($_)
    exit 1
}

Write-Host ("[OK] 已创建 {0}（{1} 个字段）" -f $created.name, @($created.fields).Count) -ForegroundColor Green
foreach ($f in $created.fields) { Write-Host ("    {0,-14} {1}" -f $f.name, $f.type) }

Write-Host ''
Write-Host '下一步（上线后各跑一次）：'
Write-Host '  1) 冒烟写入：'
Write-Host '     curl.exe -X POST https://www.gudong.app/api/lead -H "Content-Type: application/json" -d "{\"contact\":\"+6591234567\",\"contact_type\":\"whatsapp\",\"seller\":\"Lim-KW\",\"source\":\"smoke\",\"lang\":\"zh\",\"page\":\"/pricing.html\"}"'
Write-Host '  2) 打开 Airtable 看 buyer_leads 是否多了一行 source=smoke'
Write-Host '  3) 确认 Vercel 有 AIRTABLE_BASE_ID / AIRTABLE_TOKEN 两个环境变量'
