# Runs tests/test.html in headless Microsoft Edge and prints the results.
# Usage (from anywhere):   powershell -ExecutionPolicy Bypass -File tests\run-tests.ps1
# Exit code is 0 if everything passed, 1 if any test failed or errored.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = Join-Path $here 'test.html'

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Microsoft Edge not found.'; exit 1 }

# file:// URL with spaces escaped
$url = 'file:///' + (($page -replace '\\', '/') -replace ' ', '%20')
$tmp = Join-Path $env:TEMP ('specimen47-tests-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$dom = Join-Path $tmp 'dom.html'

Write-Host 'Running tests in headless Edge (takes a minute or two)...'
$args = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files',
          '--virtual-time-budget=500000', "--user-data-dir=$tmp\profile", '--dump-dom', $url)
Start-Process -FilePath $edge -ArgumentList $args -RedirectStandardOutput $dom `
  -RedirectStandardError (Join-Path $tmp 'err.txt') -Wait -WindowStyle Hidden

$html = [System.IO.File]::ReadAllText($dom)
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

if ($html -notmatch '(?s)<pre id="out">(.*?)</pre>' -or -not $matches[1].Trim()) {
  Write-Host 'No test output: the page probably failed to load (syntax error?). Open tests/test.html in a browser and check the console.' -ForegroundColor Red
  exit 1
}
$out = [System.Net.WebUtility]::HtmlDecode($matches[1])
$failed = $false
foreach ($line in $out -split "`n") {
  if ($line -match '^(FAIL|EXCEPTION|ERR)') { Write-Host $line -ForegroundColor Red; $failed = $true }
  elseif ($line -match '^OK') { Write-Host $line -ForegroundColor Green }
  else { Write-Host $line }
}
if ($failed) { Write-Host "`nSome tests FAILED." -ForegroundColor Red; exit 1 }
Write-Host "`nAll tests passed." -ForegroundColor Green
exit 0
