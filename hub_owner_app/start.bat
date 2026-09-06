@echo off
echo ========================================
echo  Flutter Setup - Hub Owner App
echo ========================================
echo.

REM بررسی وجود فلاتر
if not exist "D:\PuDo\Qwen\N-PuDo-N\flutter\bin\flutter.bat" (
    echo [ERROR] Flutter not found at: D:\PuDo\Qwen\N-PuDo-N\flutter\bin
    echo.
    echo Please download Flutter from: https://docs.flutter.dev/get-started/install/windows
    echo And extract it to: D:\PuDo\Qwen\N-PuDo-N\flutter
    echo.
    pause
    exit /b 1
)

echo [OK] Flutter found!
echo.

REM تنظیم PATH موقت
set PATH=D:\PuDo\Qwen\N-PuDo-N\flutter\bin;%PATH%

echo Running: flutter pub get
echo.
call flutter pub get

echo.
echo ========================================
echo  Done! Press any key to close...
echo ========================================
pause >nul