@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22.13 ou superior: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm install
node --disable-warning=ExperimentalWarning src/server.js %*
pause
