# Plays many seeded bot runs in headless Microsoft Edge and saves a balance report.
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1                  # 40 runs per strategy
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Runs 200 -Seed 7
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Strategies focus,mix
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Build thornstorm,fractured -Runs 60   # measure a combo
#   powershell -ExecutionPolicy Bypass -File tools\run-balance.ps1 -Autotune -Runs 30 -Rounds 3          # tune weapon damage
# Writes tools\balance-report.html (open it in a browser) and tools\balance-runs.json
# (every run: seed, strategy, floor reached, parts, sets, splices) for digging in further.
# -Autotune writes tools\autotune-report.html and tools\autotune.json instead (with a TUNE table to paste).
param(
  [int]$Runs = 40,
  [int]$Seed = 1,
  [string]$Strategies = 'random,focus,mix,splice',
  [string]$Build = '',   # e.g. 'thornstorm,fractured,chestburster': those parts from the start of every run
  [switch]$Autotune,
  [switch]$BossTtk,      # time-to-kill for each floor's boss, invulnerable bots
  [int]$Rounds = 3
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = Join-Path $here 'balance.html'

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Write-Error 'Microsoft Edge not found.'; exit 1 }

$query = "?runs=$Runs&seed=$Seed&strategies=$Strategies"
if ($Build) { $query += "&build=$Build" }
if ($Autotune) { $query += "&autotune=1&rounds=$Rounds" }
if ($BossTtk) { $query += '&bossttk=1' }
$url = 'file:///' + (($page -replace '\\', '/') -replace ' ', '%20') + $query
$tmp = Join-Path $env:TEMP ('specimen47-balance-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$dom = Join-Path $tmp 'dom.html'

if ($Autotune) { Write-Host "Auto-tuning weapons: $Rounds rounds of $Runs runs per weapon form (this takes a while)..." }
else { Write-Host "Simulating $($Runs * ($Strategies -split ',').Count) runs in headless Edge..." }
$args = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files',
          '--virtual-time-budget=1000000000', "--user-data-dir=$tmp\profile", '--dump-dom', $url)
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
$name = if ($Autotune) { 'autotune' } elseif ($BossTtk) { 'bossttk' } else { 'balance' }
$out = "<!doctype html><html><head><meta charset=`"utf-8`"><title>Balance Report</title><style>$style</style></head><body><div id=`"report`">$report</div></body></html>"
[System.IO.File]::WriteAllText((Join-Path $here "$name-report.html"), $out)
[System.IO.File]::WriteAllText((Join-Path $here $(if ($Autotune) { 'autotune.json' } elseif ($BossTtk) { 'bossttk.json' } else { 'balance-runs.json' })), $json)
Write-Host "Saved tools\$name-report.html"
if ($json -match '"errors":(\d+)' -and [int]$matches[1] -gt 0) { Write-Host "$($matches[1]) runs crashed: see the top of the report."; exit 1 }
exit 0
