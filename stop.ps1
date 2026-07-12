# Stops the Klaverjassen server + tunnel started by start.ps1 (uses saved PIDs).
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidfile = Join-Path $dir '.kj-pids.txt'
if (Test-Path $pidfile) {
  $ids = (Get-Content $pidfile) -split '\s+' | Where-Object { $_ }
  foreach ($id in $ids) {
    try { Stop-Process -Id ([int]$id) -Force -ErrorAction Stop; Write-Host "Stopped PID $id" }
    catch { Write-Host "PID $id already gone" }
  }
  Remove-Item $pidfile -Force
  Write-Host "Klaverjassen stopped."
} else {
  Write-Host "No .kj-pids.txt found. If needed, stop the 'node server.js' and 'cloudflared' processes manually."
}
