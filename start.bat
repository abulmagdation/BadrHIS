@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Please run npm install first.
  pause
  exit /b 1
)
if not exist dist\index.html (
  call npm.cmd run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:3000 in your browser.
call npm.cmd start
pause
