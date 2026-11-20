# Plays many seeded bot runs in headless Microsoft Edge and saves a balance report.
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1                  # 40 runs per strategy
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Runs 200 -Seed 7
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Strategies focus,mix
# Writes tools\balance-report.html (open it in a browser) and tools\balance-runs.json
# (every run: seed, strategy, floor reached, parts, sets, splices) for digging in further.
param(
  [int]$Runs = 40,
  [int]$Seed = 1,
  [string]$Strategies = 'random,focus,mix,splice'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = Join-Path $here 'balance.html'

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Microsoft Edge not found.'; exit 1 }

$url = 'file:///' + (($page -replace '\\', '/') -replace ' ', '%20') + "?runs=$Runs&seed=$Seed&strategies=$Strategies"
$tmp = Join-Path $env:TEMP ('specimen47-balance-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$dom = Join-Path $tmp 'dom.html'

$total = $Runs * ($Strategies -split ',').Count
Write-Host "Simulating $total runs in headless Edge (roughly a few seconds per run)..."
$args = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files',
          '--virtual-time-budget=100000000', "--user-data-dir=$tmp\profile", '--dump-dom', $url)
Start-Process -FilePath $edge -ArgumentList $args -RedirectStandardOutput $dom `
  -RedirectStandardError (Join-Path $tmp 'err.txt') -Wait -WindowStyle Hidden

$html = [System.IO.File]::ReadAllText($dom)
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

if ($html -notmatch '(?s)<div id="report">(.*?)</div>\s*<pre id="out">(.*?)</pre>') {
  Write-Host 'No report came back (did the page crash or time out?).'
  exit 1
}
$report = $matches[1]; $json = [System.Net.WebUtility]::HtmlDecode($matches[2])
$style = if ($html -match '(?s)<style>(.*?)</style>') { $matches[1] } else { '' }
$out = "<!doctype html><html><head><meta charset=`"utf-8`"><title>Balance Report</title><style>$style</style></head><body><div id=`"report`">$report</div></body></html>"
[System.IO.File]::WriteAllText((Join-Path $here 'balance-report.html'), $out)
[System.IO.File]::WriteAllText((Join-Path $here 'balance-runs.json'), $json)
Write-Host "Saved tools\balance-report.html and tools\balance-runs.json"
if ($json -match '"errors":(\d+)' -and [int]$matches[1] -gt 0) { Write-Host "$($matches[1]) runs crashed: see the top of the report."; exit 1 }
exit 0
