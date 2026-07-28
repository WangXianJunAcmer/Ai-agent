@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "if (Test-Path 'data\ai-agent.pid') {" ^
  "  $old = 0; [void][int]::TryParse((Get-Content 'data\ai-agent.pid' -Raw).Trim(), [ref]$old);" ^
  "  if ($old -gt 0) { Stop-Process -Id $old -Force; Write-Host ('Stopped PID ' + $old) }" ^
  "  Remove-Item 'data\ai-agent.pid' -Force" ^
  "}" ^
  "$conns = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue;" ^
  "foreach ($c in $conns) {" ^
  "  Stop-Process -Id $c.OwningProcess -Force;" ^
  "  Write-Host ('Freed port 8765, killed PID ' + $c.OwningProcess)" ^
  "}" ^
  "Write-Host 'Ai-agent stopped.'"

exit /b 0
