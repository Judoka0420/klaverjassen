# Klaverjassen Online launcher — starts the game server + a public Cloudflare tunnel.
# Run:  powershell -ExecutionPolicy Bypass -File start.ps1
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
$port = 8787
$env:PORT = "$port"

Write-Host "Starting Klaverjassen server on port $port ..."
$server = Start-Process node -ArgumentList 'server.js' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

$log = Join-Path $env:TEMP 'kj-tunnel.log'
if (Test-Path $log) { Remove-Item $log -Force }
Write-Host "Opening public Cloudflare tunnel ..."
$tunnel = Start-Process -FilePath (Join-Path $dir 'cloudflared.exe') `
  -ArgumentList 'tunnel','--url',"http://localhost:$port",'--no-autoupdate' `
  -PassThru -WindowStyle Hidden -RedirectStandardError $log

$url = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
  }
}

"$($server.Id) $($tunnel.Id)" | Out-File (Join-Path $dir '.kj-pids.txt') -Encoding ascii

if ($url) {
  Write-Host ""
  Write-Host "==================================================================="
  Write-Host "  Klaverjassen is LIVE. Share this link with friends:"
  Write-Host "     $url"
  Write-Host "==================================================================="
  Write-Host "  Server PID $($server.Id) | Tunnel PID $($tunnel.Id)"
  Write-Host "  Run  stop.ps1  to shut it down. (The link changes each restart.)"
} else {
  Write-Host "Server started, but could not detect the tunnel URL. Check $log"
}
