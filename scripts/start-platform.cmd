@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Single entrypoint for all operator BAT files.
rem Always run from the project root (parent of scripts\), never System32.
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.." || (
  echo.
  echo Cannot open project folder:
  echo %SCRIPT_DIR%..
  echo.
  pause
  exit /b 1
)
set "PROJECT_ROOT=%CD%"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=start"

if /I "%ACTION%"=="setup" goto SETUP
if /I "%ACTION%"=="start" goto START
if /I "%ACTION%"=="stop" goto STOP
if /I "%ACTION%"=="open" goto OPEN
if /I "%ACTION%"=="status" goto STATUS
if /I "%ACTION%"=="passwords" goto PASSWORDS
if /I "%ACTION%"=="clear-applicants" goto CLEAR_APPLICANTS
if /I "%ACTION%"=="clear-all" goto CLEAR_ALL

echo Unknown command: %ACTION%
echo Use: setup ^| start ^| stop ^| open ^| status ^| passwords ^| clear-applicants ^| clear-all
pause
popd
exit /b 1

:RESOLVE_NODE
set "NODE_EXE="
set "NPM_CMD="
set "NODE_DIR="

rem Order: project tools\node, PATH (if 22+), Program Files, then portable LocalAppData.
if exist "%PROJECT_ROOT%\tools\node\node.exe" (
  call :NODE_MAJOR_OK "%PROJECT_ROOT%\tools\node\node.exe"
  if not errorlevel 1 (
    set "NODE_EXE=%PROJECT_ROOT%\tools\node\node.exe"
    set "NODE_DIR=%PROJECT_ROOT%\tools\node"
    goto :NODE_FOUND
  )
)

where node >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%P in ('where node') do (
    set "NODE_EXE=%%P"
    goto :CHECK_PATH_NODE
  )
)
:CHECK_PATH_NODE
if defined NODE_EXE (
  for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
  set "NODE_DIR=!NODE_DIR:~0,-1!"
  call :NODE_MAJOR_OK "!NODE_EXE!"
  if not errorlevel 1 goto :NODE_FOUND
  set "NODE_EXE="
  set "NODE_DIR="
)

if exist "%ProgramFiles%\nodejs\node.exe" (
  call :NODE_MAJOR_OK "%ProgramFiles%\nodejs\node.exe"
  if not errorlevel 1 (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    set "NODE_DIR=%ProgramFiles%\nodejs"
    goto :NODE_FOUND
  )
)

for /f "delims=" %%D in ('dir /b /ad /o-n "%LOCALAPPDATA%\nodejs-portable\node-v*" 2^>nul') do (
  if exist "%LOCALAPPDATA%\nodejs-portable\%%D\node.exe" (
    call :NODE_MAJOR_OK "%LOCALAPPDATA%\nodejs-portable\%%D\node.exe"
    if not errorlevel 1 (
      set "NODE_EXE=%LOCALAPPDATA%\nodejs-portable\%%D\node.exe"
      set "NODE_DIR=%LOCALAPPDATA%\nodejs-portable\%%D"
      goto :NODE_FOUND
    )
  )
)

echo Node.js 22+ was not found.
echo Install Node.js LTS from https://nodejs.org/ then try again.
echo Or place a portable Node folder at:
echo   %PROJECT_ROOT%\tools\node\
exit /b 1

:NODE_FOUND
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"
if exist "%NODE_DIR%\npm.cmd" (
  set "NPM_CMD=%NODE_DIR%\npm.cmd"
) else (
  set "NPM_CMD=npm.cmd"
)
for /f "tokens=1 delims= " %%V in ('"%NODE_EXE%" -v 2^>nul') do set "NODE_VERSION=%%V"
echo Using Node.js %NODE_VERSION%
echo   %NODE_EXE%
exit /b 0

:NODE_MAJOR_OK
set "CHECK_NODE=%~1"
for /f "tokens=1 delims=." %%M in ('"%CHECK_NODE%" -v 2^>nul') do set "MAJOR=%%M"
set "MAJOR=%MAJOR:v=%"
if not defined MAJOR exit /b 1
if %MAJOR% LSS 22 exit /b 1
exit /b 0

:REQUIRE_PACKAGE
if exist "%PROJECT_ROOT%\package.json" exit /b 0
echo package.json was not found in the project folder.
echo Copy the full project folder, then run this file from inside it.
exit /b 1

:ENSURE_DEPS
if exist "%PROJECT_ROOT%\node_modules\express\package.json" if exist "%PROJECT_ROOT%\node_modules\better-sqlite3\package.json" exit /b 0
echo Installing dependencies...
call "%NPM_CMD%" install --ignore-scripts
exit /b %ERRORLEVEL%

:ENSURE_ENV
echo Preparing LAN environment (listen on network)...
"%NODE_EXE%" scripts\ensure-local-env.mjs
if errorlevel 1 exit /b %ERRORLEVEL%
rem Best-effort firewall rule so phones/PCs on the router can reach port 3001.
netsh advfirewall firewall show rule name="Exam Platform LAN 3001" >nul 2>&1
if errorlevel 1 (
  netsh advfirewall firewall add rule name="Exam Platform LAN 3001" dir=in action=allow protocol=TCP localport=3001 profile=private >nul 2>&1
)
exit /b 0

:ENSURE_BUILD
if /I "%~1"=="force" goto DO_BUILD
if not exist "%PROJECT_ROOT%\dist\index.html" goto DO_BUILD
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$root='%PROJECT_ROOT%'; $dist=Get-Item (Join-Path $root 'dist\index.html'); $newest=$null; foreach ($folder in @('src','shared')) { $p=Join-Path $root $folder; if (Test-Path $p) { Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { if (-not $newest -or $_.LastWriteTimeUtc -gt $newest) { $newest=$_.LastWriteTimeUtc } } } }; foreach ($file in @('index.html','package.json')) { $p=Join-Path $root $file; if (Test-Path $p) { $t=(Get-Item $p).LastWriteTimeUtc; if (-not $newest -or $t -gt $newest) { $newest=$t } } }; if ($newest -and $newest -gt $dist.LastWriteTimeUtc) { exit 2 }; exit 0"
if errorlevel 1 goto DO_BUILD
exit /b 0
:DO_BUILD
echo Building the platform...
call "%NPM_CMD%" run build
exit /b %ERRORLEVEL%

:SETUP
title Exam Platform Setup
echo.
echo Project folder:
echo %PROJECT_ROOT%
echo.
call :REQUIRE_PACKAGE
if errorlevel 1 goto FAIL
call :RESOLVE_NODE
if errorlevel 1 goto FAIL
echo.
echo [1/3] Installing dependencies...
call "%NPM_CMD%" install --ignore-scripts
if errorlevel 1 goto FAIL
echo.
echo [2/3] Preparing LAN environment...
call :ENSURE_ENV
if errorlevel 1 goto FAIL
echo.
echo [3/3] Building the platform...
call :ENSURE_BUILD force
if errorlevel 1 goto FAIL
echo.
echo Setup finished. Run: تشغيل المنصة.bat
echo Devices on the same Wi-Fi/router can open the network URL shown at start.
echo.
pause
popd
exit /b 0

:START
title Exam Platform
echo.
echo Project folder:
echo %PROJECT_ROOT%
echo.
call :REQUIRE_PACKAGE
if errorlevel 1 goto FAIL
call :RESOLVE_NODE
if errorlevel 1 goto FAIL
call :ENSURE_DEPS
if errorlevel 1 goto FAIL
call :ENSURE_ENV
if errorlevel 1 goto FAIL
call :ENSURE_BUILD
if errorlevel 1 goto FAIL
echo.
echo Opening browser on this PC...
start "" "http://127.0.0.1:3001/"
echo.
echo Platform is starting. Keep this window open.
echo This PC:     http://127.0.0.1:3001/
echo Other devices on the same Wi-Fi/router: use the network URL printed below.
echo.
call "%NPM_CMD%" start
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo Platform stopped with an error. Code: %EXIT_CODE%
) else (
  echo Platform stopped.
)
echo.
pause
popd
exit /b %EXIT_CODE%

:STOP
title Stop Exam Platform
echo This will stop Node.js processes launched from this platform folder only.
echo.
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$root='%PROJECT_ROOT%'; $procs=Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -like ('*' + $root.Replace('\','\\') + '*') -or $_.CommandLine -like ('*' + $root + '*') }; if (-not $procs) { Write-Host 'No platform process was found.'; exit 0 }; $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped process: ' + $_.ProcessId) }"
echo.
pause
popd
exit /b 0

:OPEN
start "" "http://127.0.0.1:3001/"
popd
exit /b 0

:STATUS
title Exam Platform Status
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3001/api/health/ready' -TimeoutSec 5; Write-Host 'Exam Platform is running.'; Write-Host $r.Content } catch { Write-Host 'Exam Platform is not running yet.'; Write-Host $_.Exception.Message }"
echo.
pause
popd
exit /b 0

:PASSWORDS
title Reset Exam Platform Passwords
call :REQUIRE_PACKAGE
if errorlevel 1 goto FAIL
call :RESOLVE_NODE
if errorlevel 1 goto FAIL
echo.
"%NODE_EXE%" scripts\reset-default-passwords.mjs
set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
popd
exit /b %EXIT_CODE%

:CLEAR_APPLICANTS
title Clear Applicants Data
call :REQUIRE_PACKAGE
if errorlevel 1 goto FAIL
call :RESOLVE_NODE
if errorlevel 1 goto FAIL
echo.
echo This will DELETE exams, applicants, archives, evaluation sessions, and committee links.
echo Access accounts, the question bank, and committee structure are kept.
echo.
set /p "CONFIRM=Type YES to confirm: "
if /I not "%CONFIRM%"=="YES" if /I not "%CONFIRM%"=="نعم" (
  echo Cancelled.
  echo.
  pause
  popd
  exit /b 1
)
echo.
"%NODE_EXE%" scripts\clear-all.mjs --yes
set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
popd
exit /b %EXIT_CODE%

:CLEAR_ALL
title Clear All Operational Data
call :REQUIRE_PACKAGE
if errorlevel 1 goto FAIL
call :RESOLVE_NODE
if errorlevel 1 goto FAIL
echo.
echo This will DELETE exams, applicants, archives, evaluation sessions, and committee links.
echo Access accounts, the question bank, and committee structure are kept.
echo.
set /p "CONFIRM=Type YES to confirm: "
if /I not "%CONFIRM%"=="YES" if /I not "%CONFIRM%"=="نعم" (
  echo Cancelled.
  echo.
  pause
  popd
  exit /b 1
)
echo.
"%NODE_EXE%" scripts\clear-all.mjs --yes
set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
popd
exit /b %EXIT_CODE%

:FAIL
echo.
echo Operation failed. See the messages above.
echo.
pause
popd
exit /b 1
