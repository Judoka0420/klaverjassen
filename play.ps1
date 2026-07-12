# Klaverjassen Online — one-click launcher.
# Starts the game server + a public Cloudflare tunnel, copies the share link to
# your clipboard, opens the game in your browser, and cleanly stops everything
# when you close this window (or press Q).
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
$port = 8787
$env:PORT = "$port"

$Host.UI.RawUI.WindowTitle = 'Klaverjassen Online'

function Write-Line($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

Write-Line ""
Write-Line "  Klaverjassen Online" 'Cyan'
Write-Line "  --------------------------------------------------------" 'DarkGray'
Write-Line "  Opening a public link (Cloudflare tunnel) ..." 'Gray'

# Start the tunnel FIRST so we know the public URL before launching the server.
# The server bakes this URL into invite links so friends on other networks can join.
$log = Join-Path $env:TEMP 'kj-tunnel.log'
if (Test-Path $log) { Remove-Item $log -Force }

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

Write-Line "  Starting the game server ..." 'Gray'
if ($url) { $env:KJ_PUBLIC_URL = $url }
$server = Start-Process node -ArgumentList 'server.js' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

"$($server.Id) $($tunnel.Id)" | Out-File (Join-Path $dir '.kj-pids.txt') -Encoding ascii

Write-Line ""
if ($url) {
  try { Set-Clipboard -Value $url; $copied = ' (copied to clipboard!)' } catch { $copied = '' }
  Write-Line "  ===================================================================" 'Green'
  Write-Line "   Klaverjassen is LIVE. Share this link with friends:" 'Green'
  Write-Line ""
  Write-Line "     $url" 'White'
  Write-Line ""
  Write-Line "   $($copied.Trim())" 'DarkGreen'
  Write-Line "  ===================================================================" 'Green'
  # Open the game locally for the host (instant, no tunnel round-trip).
  Start-Process "http://localhost:$port"
} else {
  Write-Line "  Server started, but the public link wasn't detected." 'Yellow'
  Write-Line "  You can still play locally: http://localhost:$port" 'Yellow'
  Write-Line "  (Tunnel log: $log)" 'DarkGray'
  Start-Process "http://localhost:$port"
}

Write-Line ""
Write-Line "  Leave this window open while you play." 'Gray'
Write-Line "  Press  Q  (or just close this window) to stop the game." 'Gray'
Write-Line ""

# Wait for Q, then clean up. Closing the window also kills children via the finally block.
try {
  while ($true) {
    if ([Console]::KeyAvailable) {
      $key = [Console]::ReadKey($true)
      if ($key.Key -eq 'Q') { break }
    }
    Start-Sleep -Milliseconds 200
  }
} finally {
  Write-Line ""
  Write-Line "  Stopping Klaverjassen ..." 'Gray'
  foreach ($p in @($server, $tunnel)) {
    if ($p) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
  }
  Remove-Item (Join-Path $dir '.kj-pids.txt') -Force -ErrorAction SilentlyContinue
  Write-Line "  Done. You can close this window." 'Gray'
  Start-Sleep -Seconds 1
}
