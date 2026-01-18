@echo off
REM IMOGI POS Print Bridge - Windows Installation Script
REM Run as Administrator

setlocal enabledelayedexpansion

echo ============================================
echo IMOGI POS Print Bridge Installer (Windows)
echo ============================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Please run this script as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Configuration
set INSTALL_DIR=C:\IMOGI-POS\print-bridge
set PYTHON_URL=https://www.python.org/ftp/python/3.11.7/python-3.11.7-amd64.exe
set PYTHON_INSTALLER=%TEMP%\python-installer.exe

echo [1/6] Checking Python installation...
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo Python not found. Installing Python 3.11...
    
    REM Download Python installer
    echo Downloading Python...
    powershell -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'"
    
    REM Install Python
    echo Installing Python (this may take a few minutes)...
    start /wait %PYTHON_INSTALLER% /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    
    REM Refresh environment variables
    call refreshenv
    
    echo Python installed successfully
) else (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
    echo Python found: !PYTHON_VERSION!
)

echo.
echo [2/6] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo Directory created: %INSTALL_DIR%

echo.
echo [3/6] Copying files...
if exist "print_bridge.py" (
    copy /Y "print_bridge.py" "%INSTALL_DIR%\"
    echo print_bridge.py copied
) else (
    echo ERROR: print_bridge.py not found in current directory
    echo Please copy print_bridge.py to: %CD%
    pause
    exit /b 1
)

echo.
echo [4/6] Creating requirements.txt...
(
echo flask^>=2.3.0
echo flask-cors^>=4.0.0
echo pyserial^>=3.5
echo pywin32^>=305
) > "%INSTALL_DIR%\requirements.txt"
echo requirements.txt created

echo.
echo [5/6] Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r "%INSTALL_DIR%\requirements.txt"
if %errorLevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
echo Python dependencies installed

echo.
echo [6/6] Creating Windows Service...

REM Create service wrapper script
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo python print_bridge.py
) > "%INSTALL_DIR%\start_bridge.bat"

REM Create Task Scheduler task
schtasks /query /TN "IMOGI Print Bridge" >nul 2>&1
if %errorLevel% equ 0 (
    echo Task already exists. Deleting old task...
    schtasks /delete /TN "IMOGI Print Bridge" /F
)

echo Creating scheduled task...
schtasks /create ^
    /TN "IMOGI Print Bridge" ^
    /TR "\"%INSTALL_DIR%\start_bridge.bat\"" ^
    /SC ONSTART ^
    /RU SYSTEM ^
    /RL HIGHEST ^
    /F

if %errorLevel% equ 0 (
    echo Scheduled task created successfully
) else (
    echo WARNING: Failed to create scheduled task
    echo You can manually create it in Task Scheduler
)

echo.
echo [Testing] Starting Print Bridge...
start "IMOGI Print Bridge" /MIN cmd /c "%INSTALL_DIR%\start_bridge.bat"
echo Waiting for service to start...
timeout /t 5 /nobreak >nul

echo.
echo Testing health endpoint...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5555/health' -UseBasicParsing; if ($response.StatusCode -eq 200) { Write-Host 'SUCCESS: Print Bridge is running!' -ForegroundColor Green; $response.Content } else { Write-Host 'ERROR: Print Bridge is not responding' -ForegroundColor Red } } catch { Write-Host 'ERROR: Cannot connect to Print Bridge' -ForegroundColor Red }"

echo.
echo ============================================
echo Installation Complete!
echo ============================================
echo.
echo Installation Details:
echo   Installation Directory: %INSTALL_DIR%
echo   Service: IMOGI Print Bridge (Task Scheduler)
echo   Endpoint: http://localhost:5555
echo.
echo Service Management:
echo   Start:  schtasks /run /TN "IMOGI Print Bridge"
echo   Stop:   taskkill /F /FI "WINDOWTITLE eq IMOGI Print Bridge*"
echo   Manual: %INSTALL_DIR%\start_bridge.bat
echo.
echo Firewall Configuration:
echo   If needed, allow Python through Windows Firewall:
echo   Control Panel ^> Windows Defender Firewall ^> Allow an app
echo.
echo Next Steps:
echo   1. Configure printer in POS browser:
echo      Tools -^> Printer Settings
echo   2. Test print to verify setup
echo.
echo Press any key to open installation directory...
pause >nul
explorer "%INSTALL_DIR%"

endlocal
