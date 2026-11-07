<#
.SYNOPSIS
  导出 Gudong 买家名单（Airtable buyer_leads）到本地 CSV，并按 contact 去重、给出统计与额度告警。

.DESCRIPTION
  - 只读：仅调用 GET /v0/{base}/{table}，不写入、不删除任何记录。
  - 分页拉取（pageSize=100 + offset），记录多时也不漏。
  - created_at 是 UTC，导出时转成 Asia/Singapore（+8）另列，原始 UTC 保留。
  - 按 contact 归并重复提交：created_at 取最新，status 取最"严重"值（unsubscribed 优先），follows 取并集。
  - 每次运行写一个新文件（带本地时间戳），从不覆盖历史归档。
  - 输出到 .archive/（已在 .gitignore 里，含买家联系方式，切勿提交仓库）。

.PARAMETER Token
  Airtable PAT。不给则依次读：$env:AIRTABLE_TOKEN、.env.production.local、.env.local 里的 AIRTABLE_TOKEN。

.PARAMETER Base
  base id，默认 apprn6XDQnAm8bkaT（Gudong）。

.PARAMETER Table
  表名，默认 buyer_leads。

.PARAMETER OutDir
  输出目录，默认仓库根下 .archive。

.PARAMETER KeepRaw
  额外导出原始（未去重）记录表，便于核对 submitted_at 顺序。

.PARAMETER SelfTest
  用内置样例数据跑一遍归并/统计逻辑（不联网、不需要 Token），用来校验脚本本身。

.EXAMPLE
  pwsh -File scripts/archive-buyer-leads.ps1

.EXAMPLE
  pwsh -File scripts/archive-buyer-leads.ps1 -Token "patXXXX" -KeepRaw
#>
[CmdletBinding()]
param(
  [string]$Token,
  [string]$Base = 'apprn6XDQnAm8bkaT',
  [string]$Table = 'buyer_leads',
  [string]$OutDir,
  [switch]$KeepRaw,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not $PSScriptRoot) { $Root = (Get-Location).Path }
if (-not $OutDir) { $OutDir = Join-Path $Root '.archive' }

# ---------- Token 解析 ----------
function Resolve-Token {
  param([string]$Explicit)
  if ($Explicit) { return $Explicit.Trim().Trim('"') }
  if ($env:AIRTABLE_TOKEN) { return $env:AIRTABLE_TOKEN.Trim().Trim('"') }
  foreach ($f in @('.env.production.local', '.env.local', '.env')) {
    $p = Join-Path $Root $f
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $line = (Select-String -LiteralPath $p -Pattern '^AIRTABLE_TOKEN=' | Select-Object -First 1)
    if ($line) {
      $v = ($line.Line -split '=', 2)[1]
      if ($v) { return $v.Trim().Trim('"') }
    }
  }
  return $null
}

$token = $null
if (-not $SelfTest) {
  $token = Resolve-Token -Explicit $Token
  if (-not $token) {
    Write-Host '找不到 AIRTABLE_TOKEN。请 -Token 传入，或在 .env.production.local 里配置。' -ForegroundColor Red
    exit 2
  }
}

# ---------- 拉取 ----------
function Get-AllRecords {
  param([string]$Tok, [string]$B, [string]$T)
  $records = @()
  $offset = $null
  $page = 0
  do {
    $uri = "https://api.airtable.com/v0/${B}/${T}?pageSize=100"
    if ($offset) { $uri += "&offset=$([uri]::EscapeDataString($offset))" }
    $resp = Invoke-WebRequest -Uri $uri -Headers @{ Authorization = "Bearer $Tok" } -TimeoutSec 60 -UseBasicParsing
    $json = $resp.Content | ConvertFrom-Json
    if ($json.records) { $records += $json.records }
    $offset = $json.offset
    $page++
    if ($offset) { Start-Sleep -Milliseconds 220 }   # 避开 5 req/s 限流
  } while ($offset -and $page -lt 200)
  return $records
}

if ($SelfTest) {
  # 内置样例：验证「同号码重复提交取最新 / 退订压制 / follows 并集 / 邮箱大小写归一」
  $raw = @(
    [pscustomobject]@{ id = 'recA1'; createdTime = '2026-11-01T04:00:00.000Z'; fields = [pscustomobject]@{
      contact = '+6591234567'; contact_type = 'whatsapp'; seller = 'Lim-KW'; source = 'seller-page'
      lang = 'zh'; page = '/sellers/seller-lim-kw-antiques.html'; follows = 'seller:Lim-KW'
      created_at = '2026-11-01T04:00:00.000Z'; status = 'active' } }
    [pscustomobject]@{ id = 'recA2'; createdTime = '2026-11-05T09:30:00.000Z'; fields = [pscustomobject]@{
      contact = '6591234567'; contact_type = 'whatsapp'; seller = 'Lim-KW'; source = 'item-page'
      lang = 'en'; page = '/items/item-limck-01.html'; follows = 'tag:瓷器; seller:Lim-KW'
      created_at = '2026-11-05T09:30:00.000Z'; status = 'active' } }
    [pscustomobject]@{ id = 'recB1'; createdTime = '2026-10-20T02:00:00.000Z'; fields = [pscustomobject]@{
      contact = 'alice@example.com'; contact_type = 'email'; seller = ''; source = 'home'
      lang = 'zh'; page = '/'; follows = 'tag:玉器'
      created_at = '2026-10-20T02:00:00.000Z'; status = 'unsubscribed' } }
    [pscustomobject]@{ id = 'recB2'; createdTime = '2026-10-25T02:00:00.000Z'; fields = [pscustomobject]@{
      contact = 'ALICE@Example.com'; contact_type = 'email'; seller = ''; source = 'home'
      lang = 'en'; page = '/'; follows = 'tag:玉器'
      created_at = '2026-10-25T02:00:00.000Z'; status = 'active' } }
    [pscustomobject]@{ id = 'recC0'; createdTime = '2026-11-02T02:00:00.000Z'; fields = [pscustomobject]@{} }
  )
  Write-Host '自检模式：使用内置样例，不联网。' -ForegroundColor Magenta
} else {
  try {
    $raw = Get-AllRecords -Tok $token -B $Base -T $Table
  } catch {
  $code = $null
  if ($_.Exception.Response) { $code = $_.Exception.Response.StatusCode.value__ }
  $body = $null
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
  switch ($code) {
    401 { Write-Host '401：Token 无效或已撤销。' -ForegroundColor Red }
    403 { Write-Host '403：Token 没有这个 base 的读权限（Access 里要选 base「Gudong」）。' -ForegroundColor Red }
    404 { Write-Host "404：base 或表名不存在（base=$Base, table=$Table）。" -ForegroundColor Red }
    default { Write-Host "读取失败：$($_.Exception.Message)" -ForegroundColor Red }
  }
  if ($body) { Write-Host $body -ForegroundColor DarkGray }
  exit 3
  }
}

Write-Host ("读到原始记录 " + $raw.Count + " 条（去重前）") -ForegroundColor Cyan
if ($raw.Count -eq 0) {
  Write-Host '表里还没有记录，无需归档。' -ForegroundColor Yellow
}

# ---------- 工具函数 ----------
function CsvField {
  param($v)
  $s = [string]$v
  $needsQuote = $false
  if ($s.IndexOf([char]34) -ge 0) { $needsQuote = $true }        # 双引号
  if ($s.IndexOf(',') -ge 0) { $needsQuote = $true }            # 逗号
  if ($s.IndexOf("`r") -ge 0 -or $s.IndexOf("`n") -ge 0) { $needsQuote = $true }   # 换行
  if ($needsQuote) { return '"' + $s.Replace('"', '""') + '"' }
  return $s
}

function To-Sgt {
  param([string]$iso)
  if (-not $iso) { return '' }
  try {
    $dto = [datetimeoffset]::Parse($iso, [System.Globalization.CultureInfo]::InvariantCulture)
    return $dto.ToOffset([timespan]::FromHours(8)).ToString('yyyy-MM-dd HH:mm:ss')
  } catch { return '' }
}

function To-UtcSortable {
  param([string]$iso)
  if (-not $iso) { return '' }
  try {
    $dto = [datetimeoffset]::Parse($iso, [System.Globalization.CultureInfo]::InvariantCulture)
    return $dto.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  } catch { return '' }
}

# ---------- 归并去重 ----------
$map = @{}
$blank = 0
foreach ($r in $raw) {
  $f = $r.fields
  $contact = ''
  if ($f.contact) { $contact = ([string]$f.contact).Trim() }
  if (-not $contact) { $blank++; continue }

  $type = ''
  if ($f.contact_type) { $type = ([string]$f.contact_type).Trim().ToLower() }
  if (-not $type) { $type = if ($contact.Contains('@')) { 'email' } else { 'whatsapp' } }

  # 归一键：邮箱小写、手机只留数字
  $key = if ($type -eq 'email') { $contact.ToLower() } else { ($contact -replace '[^\d]', '') }
  if (-not $key) { $key = $contact.ToLower() }

  $created = ''
  if ($f.created_at) { $created = [string]$f.created_at } else { $created = [string]$r.createdTime }
  $createdUtc = To-UtcSortable $created

  $status = ''
  if ($f.status) { $status = ([string]$f.status).Trim().ToLower() }

  $row = [pscustomobject]@{
    Key       = $key
    Contact   = $contact
    Type      = $type
    Seller    = ([string]$f.seller).Trim()
    Source    = ([string]$f.source).Trim()
    Lang      = ([string]$f.lang).Trim()
    Page      = ([string]$f.page).Trim()
    Follows   = ([string]$f.follows).Trim()
    CreatedUtc= $createdUtc
    Status    = $status
    RecId     = $r.id
    Count     = 1
  }

  if (-not $map.ContainsKey($key)) {
    $map[$key] = $row
    continue
  }

  # 已有同键记录：合并
  $prev = $map[$key]
  $prev.Count += 1
  # created_at 取最新
  if ($row.CreatedUtc -and ($row.CreatedUtc -gt $prev.CreatedUtc)) {
    $prev.CreatedUtc = $row.CreatedUtc
    $prev.Contact = $row.Contact
    $prev.Type = $row.Type
    if ($row.Seller) { $prev.Seller = $row.Seller }
    if ($row.Source) { $prev.Source = $row.Source }
    if ($row.Lang) { $prev.Lang = $row.Lang }
    if ($row.Page) { $prev.Page = $row.Page }
    $prev.RecId = $row.RecId
  } else {
    if (-not $prev.Seller -and $row.Seller) { $prev.Seller = $row.Seller }
    if (-not $prev.Source -and $row.Source) { $prev.Source = $row.Source }
  }
  # status 取最严重：unsubscribed 赢
  if ($row.Status -eq 'unsubscribed') { $prev.Status = 'unsubscribed' }
  elseif (-not $prev.Status) { $prev.Status = $row.Status }

  # follows 取并集（形如 seller:x; tag:y）
  if ($row.Follows) {
    $tokens = @()
    foreach ($src in @($prev.Follows, $row.Follows)) {
      if (-not $src) { continue }
      foreach ($t in ($src -split ';')) {
        $t = $t.Trim()
        if ($t) { $tokens += $t }
      }
    }
    $uniq = @()
    foreach ($t in $tokens) { if ($uniq -notcontains $t) { $uniq += $t } }
    $prev.Follows = ($uniq -join '; ')
  }
}

$merged = @($map.Values)

# ---------- 统计 ----------
$totalRaw   = $raw.Count
$totalUniq  = $merged.Count
$dupRows    = $totalRaw - $totalUniq - $blank
$whatsapp   = @($merged | Where-Object { $_.Type -eq 'whatsapp' }).Count
$email      = @($merged | Where-Object { $_.Type -eq 'email' }).Count
$active     = @($merged | Where-Object { $_.Status -ne 'unsubscribed' }).Count
$unsub      = @($merged | Where-Object { $_.Status -eq 'unsubscribed' }).Count
$noFollow   = @($merged | Where-Object { -not $_.Follows }).Count

$nowUtc = [datetimeoffset]::UtcNow
$last7 = @($merged | Where-Object {
  if (-not $_.CreatedUtc) { return $false }
  ([datetimeoffset]::Parse($_.CreatedUtc, [System.Globalization.CultureInfo]::InvariantCulture)) -ge $nowUtc.AddDays(-7)
}).Count
$last30 = @($merged | Where-Object {
  if (-not $_.CreatedUtc) { return $false }
  ([datetimeoffset]::Parse($_.CreatedUtc, [System.Globalization.CultureInfo]::InvariantCulture)) -ge $nowUtc.AddDays(-30)
}).Count

$bySeller = @{}
foreach ($m in $merged) {
  if (-not $m.Seller) { continue }
  if (-not $bySeller.ContainsKey($m.Seller)) { $bySeller[$m.Seller] = 0 }
  $bySeller[$m.Seller] = $bySeller[$m.Seller] + 1
}
$byTag = @{}
foreach ($m in $merged) {
  if (-not $m.Follows) { continue }
  foreach ($t in ($m.Follows -split ';')) {
    $t = $t.Trim()
    if ($t -like 'tag:*') {
      $tag = $t.Substring(4).Trim()
      if (-not $tag) { continue }
      if (-not $byTag.ContainsKey($tag)) { $byTag[$tag] = 0 }
      $byTag[$tag] = $byTag[$tag] + 1
    }
  }
}

# ---------- 落盘 ----------
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}
$stamp = if ($SelfTest) { 'selftest-' + (Get-Date).ToString('HHmmss') } else { (Get-Date).ToString('yyyyMMdd-HHmm') }
$csvPath = Join-Path $OutDir "buyer-leads-$stamp.csv"
$sumPath = Join-Path $OutDir "buyer-leads-$stamp-summary.txt"

$sorted = $merged | Sort-Object -Property @{ Expression = { $_.CreatedUtc }; Descending = $true }

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('contact,contact_type,seller,source,lang,page,follows,created_at_sgt,created_at_utc,status,submissions,record_id')
foreach ($m in $sorted) {
  $line = @(
    (CsvField $m.Contact),
    (CsvField $m.Type),
    (CsvField $m.Seller),
    (CsvField $m.Source),
    (CsvField $m.Lang),
    (CsvField $m.Page),
    (CsvField $m.Follows),
    (CsvField (To-Sgt $m.CreatedUtc)),
    (CsvField $m.CreatedUtc),
    (CsvField $(if ($m.Status) { $m.Status } else { 'active' })),
    (CsvField $m.Count),
    (CsvField $m.RecId)
  ) -join ','
  [void]$sb.AppendLine($line)
}
$enc = New-Object System.Text.UTF8Encoding($true)   # 带 BOM，Excel/记事本都能正确识别中文
[System.IO.File]::WriteAllText($csvPath, $sb.ToString(), $enc)

if ($KeepRaw) {
  $rawPath = Join-Path $OutDir "buyer-leads-$stamp-raw.csv"
  $sb2 = New-Object System.Text.StringBuilder
  [void]$sb2.AppendLine('contact,contact_type,seller,source,lang,page,follows,created_at_utc,status,record_id')
  foreach ($m in ($raw | Sort-Object { $_.createdTime })) {
    $f = $m.fields
    $line = @(
      (CsvField $f.contact), (CsvField $f.contact_type), (CsvField $f.seller), (CsvField $f.source),
      (CsvField $f.lang), (CsvField $f.page), (CsvField $f.follows),
      (CsvField (To-UtcSortable ([string]$f.created_at))), (CsvField $f.status), (CsvField $m.id)
    ) -join ','
    [void]$sb2.AppendLine($line)
  }
  [System.IO.File]::WriteAllText($rawPath, $sb2.ToString(), $enc)
  Write-Host ("原始记录：$rawPath") -ForegroundColor DarkGray
}

# ---------- 摘要 ----------
$lines = @()
$lines += "Gudong 买家名单归档  " + (Get-Date).ToString('yyyy-MM-dd HH:mm') + " (Asia/Singapore)"
$lines += "base=$Base  table=$Table"
$lines += ""
$lines += "原始记录            : $totalRaw"
$lines += "去重后唯一联系人    : $totalUniq"
$lines += "被合并的重复提交    : $dupRows"
$lines += "空白占位记录（跳过）: $blank"
$lines += "  ├ WhatsApp        : $whatsapp"
$lines += "  └ 邮箱            : $email"
$lines += "未退订（active）    : $active"
$lines += "已退订（保留为压制名单，勿删）: $unsub"
$lines += "没勾品类/藏家       : $noFollow"
$lines += "近 7 天新增         : $last7"
$lines += "近 30 天新增        : $last30"
$lines += ""
$lines += "按藏家："
if ($bySeller.Count -eq 0) { $lines += "  （无）" }
foreach ($k in ($bySeller.Keys | Sort-Object)) { $lines += ("  " + $k + " : " + $bySeller[$k]) }
$lines += ""
$lines += "按品类："
if ($byTag.Count -eq 0) { $lines += "  （无）" }
foreach ($k in ($byTag.Keys | Sort-Object)) { $lines += ("  " + $k + " : " + $byTag[$k]) }

$lines += ""
if ($totalRaw -ge 960) {
  $lines += "!! 危险：原始记录 $totalRaw 条，已非常接近免费版单表上限（约 1000 条）。请尽快清理已归档的旧记录。"
} elseif ($totalRaw -ge 800) {
  $lines += "! 提醒：原始记录 $totalRaw 条，接近免费版上限，建议这周做一次归档 + 清理。"
} else {
  $lines += "额度健康：$totalRaw / ~1000（免费版单表上限，以 Airtable 当前条款为准）。"
}

[System.IO.File]::WriteAllText($sumPath, ($lines -join [Environment]::NewLine), $enc)

Write-Host ""
Write-Host ($lines -join [Environment]::NewLine)
Write-Host ""
Write-Host ("CSV      : $csvPath") -ForegroundColor Green
Write-Host ("摘要     : $sumPath") -ForegroundColor Green
Write-Host "提示：该目录含买家联系方式，已在 .gitignore 中排除，切勿提交仓库或公开分享。" -ForegroundColor Yellow
