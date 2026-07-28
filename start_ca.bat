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
  "foreach ($pidFile in @('data\coding-agent.pid','data\ai-agent.pid')) {" ^
  "  if (Test-Path $pidFile) {" ^
  "    $old = 0; [void][int]::TryParse((Get-Content $pidFile -Raw).Trim(), [ref]$old);" ^
  "    if ($old -gt 0 -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {" ^
  "      Write-Host ('CA already running, PID ' + $old); exit 0" ^
  "    }" ^
  "    if ($pidFile -eq 'data\ai-agent.pid') { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }" ^
  "  }" ^
  "}" ^
  "$p = Start-Process -FilePath '%PY%' -ArgumentList 'start.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -RedirectStandardOutput '%CD%\logs\coding-agent.out.log' -RedirectStandardError '%CD%\logs\coding-agent.err.log' -PassThru;" ^
  "Set-Content -Path 'data\coding-agent.pid' -Value $p.Id -Encoding ascii;" ^
  "Write-Host ('Started Coding Agent (CA) in background, PID ' + $p.Id);" ^
  "Write-Host 'http://127.0.0.1:8765/'"

exit /b %ERRORLEVEL%
