@echo off
title Vivid Deck Planner
setlocal EnableExtensions
set "NODE_DIR=C:\Users\julme\.nvm\versions\node\v24.16.0\bin"
set "PATH=%NODE_DIR%;%PATH%"
set "PORT=5174"
cd /d "%~dp0"

if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Node.js was not found at:
    echo   %NODE_DIR%
    echo Install Node.js or update NODE_DIR at the top of this file.
    echo.
    pause
    exit /b 1
)

rem ---- If the planner is already running, just open it ----
netstat -ano | findstr /c:":%PORT% " | findstr /c:"LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo Vivid Deck Planner is already running.
    echo Opening http://localhost:%PORT% ...
    start http://localhost:%PORT%
    ping -n 3 localhost >nul
    exit /b 0
)

rem ---- First run: install dependencies ----
if not exist "node_modules\vite" (
    echo First run: installing dependencies, this takes a minute or two...
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed - see the messages above.
        pause
        exit /b 1
    )
)

echo ============================================================
echo  Vivid Deck Planner  -  http://localhost:%PORT%
echo  A browser tab will open in a few seconds.
echo  KEEP THIS WINDOW OPEN while you work.
echo  Close it (or press Ctrl+C) to stop the server.
echo ============================================================
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:%PORT%"
call npm run dev

echo.
echo Server stopped. If it stopped immediately, read the error above.
pause
