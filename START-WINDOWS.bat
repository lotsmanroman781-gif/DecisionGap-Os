@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required. Visit https://nodejs.org/
  pause
  exit /b 1
)
echo Starting DecisionGap OS...
echo Open http://127.0.0.1:3000 in your browser.
node server/index.js
pause
