@echo off
echo ========================================
echo  N-PuDo-N Auto Test
echo ========================================
cd /d "D:\PuDo\Qwen\N-PuDo-N\backend"
powershell.exe -ExecutionPolicy Bypass -File "test-flow.ps1"
echo.
echo ========================================
echo  Done! Press any key to exit...
echo ========================================
pause >nul