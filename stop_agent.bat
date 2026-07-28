@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "if (Test-Path 'data\ai-agent.pid') {" ^
  "  $old = 0; [void][int]::TryParse((Get-Content 'data\ai-agent.pid' -Raw).Trim(), [ref]$old);" ^
  "  if ($old -gt 0) {" ^
  "    Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $old) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force };" ^
  "    Stop-Process -Id $old -Force; Write-Host ('Stopped PID ' + $old)" ^
  "  }" ^
  "  Remove-Item 'data\ai-agent.pid' -Force" ^
  "}" ^
  "$conns = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue;" ^
  "foreach ($c in $conns) {" ^
  "  Stop-Process -Id $c.OwningProcess -Force;" ^
  "  Write-Host ('Freed port 8765, killed PID ' + $c.OwningProcess)" ^
  "}" ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*cursor-sdk-bridge*' } | ForEach-Object {" ^
  "  Stop-Process -Id $_.ProcessId -Force;" ^
  "  Write-Host ('Killed orphan bridge PID ' + $_.ProcessId)" ^
  "};" ^
  "Write-Host 'Ai-agent stopped.'"

exit /b 0
