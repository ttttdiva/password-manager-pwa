@echo off
chcp 65001 >nul
echo ========================================
echo   Password Manager PWA Server
echo ========================================
echo.
echo Starting server...
echo.
echo Local:  http://127.0.0.1:8080
echo.

:: Get local IP (prioritize 192.168.x.x)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"192.168"') do (
    set IP=%%a
    goto :showip
)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :showip
)
:showip
set IP=%IP: =%
echo Mobile: http://%IP%:8080
echo.
echo ----------------------------------------
echo  Press Ctrl+C to stop
echo ----------------------------------------
echo.

cd /d "%~dp0"
python -m http.server 8080 --bind 0.0.0.0

pause
