Add-Type -AssemblyName System.Drawing

$size = 256
$out = Join-Path $PSScriptRoot '..\build\icon.png'

$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# rounded-square background with blue-violet gradient
$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 127, 155, 255),
  [System.Drawing.Color]::FromArgb(255, 58, 76, 190),
  45.0
)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 58
$d = $r * 2
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

# white download arrow: stem + head + base bar
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillRectangle($white, 113, 46, 30, 94)

$triangle = @(
  (New-Object System.Drawing.Point(82, 128)),
  (New-Object System.Drawing.Point(174, 128)),
  (New-Object System.Drawing.Point(128, 194))
)
$g.FillPolygon($white, $triangle)

$basePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bx = 76
$by = 204
$bw = 104
$bh = 16
$bd = 12
$basePath.AddArc($bx, $by, $bd, $bd, 180, 90)
$basePath.AddArc($bx + $bw - $bd, $by, $bd, $bd, 270, 90)
$basePath.AddArc($bx + $bw - $bd, $by + $bh - $bd, $bd, $bd, 0, 90)
$basePath.AddArc($bx, $by + $bh - $bd, $bd, $bd, 90, 90)
$basePath.CloseFigure()
$g.FillPath($white, $basePath)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Output "icon.png written: $out"
