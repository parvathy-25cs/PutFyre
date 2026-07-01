@echo off
title HRM Portal - Starting...
cd /d "%~dp0"

REM ──────────────────────────────────────────────────────────────
REM  HRM Portal Launcher
REM  Starts the Node.js backend server and opens the login page.
REM ──────────────────────────────────────────────────────────────

REM Check if Node.js is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists; install if not
if not exist "%~dp0node_modules\" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Check if server is already running on port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo Server is already running on port 3000.
    echo Opening HRM Portal in your browser...
    start "" "http://localhost:3000"
    exit /b 0
)

REM Start the Node.js server silently in the background
echo Starting HRM Portal backend server...
start /b "" node "%~dp0server.js" > "%~dp0server-runtime.log" 2>&1

REM Wait a moment for the server to start
echo Waiting for server to initialize...
timeout /t 2 /nobreak >nul

REM Open the login page in the default browser
echo Opening HRM Portal login page...
start "" "http://localhost:3000"

echo.
echo HRM Portal server is running in the background.
echo Access the portal at: http://localhost:3000
echo To stop the server, close this window or end the node.exe process.
echo.
