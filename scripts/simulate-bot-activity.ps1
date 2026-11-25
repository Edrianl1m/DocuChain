# Demo helper: opens every public resolution rapidly, like a scraper bot would,
# so the "Possible automated (non-human) activity" panel on Analytics has
# something to show. Read-only: it only views files the public page already serves.
#
# Usage (PowerShell):
#   .\scripts\simulate-bot-activity.ps1                       # local backend
#   .\scripts\simulate-bot-activity.ps1 -BaseUrl https://docuchain-dnsc.japaneast.cloudapp.azure.com
param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$Rounds = 2,
  [int]$DelayMs = 300
)
$list = Invoke-RestMethod "$BaseUrl/api/public/resolutions?limit=50"
$ids = $list.resolutions | ForEach-Object { $_.docId }
if (-not $ids) { Write-Host "No public resolutions found."; exit 1 }
$n = 0
for ($r = 1; $r -le $Rounds; $r++) {
  foreach ($id in $ids) {
    try { Invoke-WebRequest "$BaseUrl/api/public/resolutions/$id/file?mode=view" -UseBasicParsing | Out-Null; $n++ }
    catch { Write-Host "  $id -> $($_.Exception.Message)" }
    Start-Sleep -Milliseconds $DelayMs
  }
}
Write-Host "Opened $n documents about every $DelayMs ms. Refresh Analytics to see the flag."
