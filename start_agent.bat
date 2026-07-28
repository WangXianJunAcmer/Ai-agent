@echo off
setlocal
cd /d "%~dp0"

set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo [ERR] Missing .venv\Scripts\python.exe
  echo Create it first: python -m venv .venv ^&^& .venv\Scripts\pip install -r requirements.txt
  exit /b 1
)

if not exist "data\" mkdir data
if not exist "logs\" mkdir logs

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "if (Test-Path 'data\ai-agent.pid') {" ^
  "  $old = 0; [void][int]::TryParse((Get-Content 'data\ai-agent.pid' -Raw).Trim(), [ref]$old);" ^
  "  if ($old -gt 0 -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {" ^
  "    Write-Host ('Ai-agent already running, PID ' + $old); exit 0" ^
  "  }" ^
  "}" ^
  "$p = Start-Process -FilePath '%PY%' -ArgumentList 'start.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%CD%\logs\ai-agent.out.log' -RedirectStandardError '%CD%\logs\ai-agent.err.log' -PassThru;" ^
  "Set-Content -Path 'data\ai-agent.pid' -Value $p.Id -Encoding ascii;" ^
  "Write-Host ('Started Ai-agent in background, PID ' + $p.Id);" ^
  "Write-Host 'http://127.0.0.1:8765/'"

exit /b %ERRORLEVEL%
