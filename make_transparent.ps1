Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\Eastw Engineering\Documents\Gudong\badge_raw.png'
$outPath = 'C:\Users\Eastw Engineering\Documents\Gudong\创始藏家徽章_透明底.png'

$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$w = $bmp.Width; $h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$argb = $bmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bmp.Dispose()

$data = $argb.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$len = $stride * $h
$bytes = New-Object byte[] $len
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $len)

$thresh = 235
$q = New-Object System.Collections.Generic.Queue[int]

# helper to check & push a pixel if it is near-white background
function Test-Clear {
  param([int]$x, [int]$y)
  if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
  $i = $y * $stride + $x * 4
  if ($bytes[$i+3] -gt 0 -and $bytes[$i] -gt $thresh -and $bytes[$i+1] -gt $thresh -and $bytes[$i+2] -gt $thresh) {
    $bytes[$i+3] = 0
    $script:q.Enqueue([int]$i)
  }
}

# seed from all four borders
for ($x = 0; $x -lt $w; $x++) { Test-Clear $x 0; Test-Clear $x ($h-1) }
for ($y = 0; $y -lt $h; $y++) { Test-Clear 0 $y; Test-Clear ($w-1) $y }

# BFS flood fill
while ($q.Count -gt 0) {
  $i = $q.Dequeue()
  $x = [int]((($i % $stride)) / 4)
  $y = [int]($i / $stride)
  Test-Clear ($x-1) $y
  Test-Clear ($x+1) $y
  Test-Clear $x ($y-1)
  Test-Clear $x ($y+1)
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $len)
$argb.UnlockBits($data)

# crop to content bounding box of non-transparent pixels for a tighter asset
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $rowBase = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $rowBase + $x * 4
    if ($bytes[$i+3] -gt 10) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output ("content bbox: x="+$minX+".."+$maxX+" y="+$minY+".."+$maxY)
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$cropRect = New-Object System.Drawing.Rectangle($minX, $minY, $cw, $ch)
$cropped = $argb.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cropped.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose(); $argb.Dispose()
Write-Output ("saved: "+$outPath+" ("+$cw+"x"+$ch+")")
