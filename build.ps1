# Build: inline src/*.js and styles.css into a single HTML file.
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
# ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Read-Utf8([string]$path) {
  return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

$outName = (-join @([char]0x968F, [char]0x673A, [char]0x751F, [char]0x6210, [char]0x5668)) + '.html'

$template = Read-Utf8 (Join-Path $root 'index.template.html')
$css = Read-Utf8 (Join-Path $root 'src\styles.css')

$files = @(
  'src\00-rng.js',
  'src\01-model.js',
  'src\01a-content.js',
  'src\01b-content-lazydm.js',
  'src\02-engine.js',
  'src\03-storage.js',
  'src\04-store.js',
  'src\05-ui.js',
  'src\06-workspace.js',
  'src\07-md.js',
  'src\views\10-table.js',
  'src\views\11-combo.js',
  'src\views\12-library.js',
  'src\views\14-campaign.js',
  'src\views\15-notes.js',
  'src\views\18-sheet-templates.js',
  'src\views\19-sheet-builder.js',
  'src\views\16-sheets.js',
  'src\views\17-rules.js',
  'src\views\17a-rules-spec.js',
  'src\13-dialogs.js',
  'src\20-app.js'
)

$parts = New-Object System.Collections.Generic.List[string]
foreach ($f in $files) {
  $path = Join-Path $root $f
  if (-not (Test-Path $path)) { throw "missing source file: $f" }
  $parts.Add((Read-Utf8 $path))
}
$js = [string]::Join("`r`n", $parts)

$html = $template.Replace('/*{{CSS}}*/', $css).Replace('/*{{JS}}*/', $js)
$utf8 = New-Object System.Text.UTF8Encoding($false)

$sw = '<script>' + "`r`n" + "if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {" + "`r`n" + "  window.addEventListener('load', function () {" + "`r`n" + "    navigator.serviceWorker.register('sw.js').catch(function () {});" + "`r`n" + '  });' + "`r`n" + '}' + "`r`n" + '</script>'

$single = $html.Replace('<!--{{HEAD}}-->', '').Replace('<!--{{SW}}-->', '')
[System.IO.File]::WriteAllText((Join-Path $root $outName), $single, $utf8)

$pwaHtml = $html.Replace('<!--{{HEAD}}-->', '<link rel="manifest" href="manifest.webmanifest">').Replace('<!--{{SW}}-->', $sw)
[System.IO.File]::WriteAllText((Join-Path $root 'pwa\index.html'), $pwaHtml, $utf8)

$size = [Math]::Round((Get-Item (Join-Path $root $outName)).Length / 1KB, 1)
Write-Host "built $outName ($size KB) and pwa\index.html"
