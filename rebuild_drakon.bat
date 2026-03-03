@echo off
echo ===========================================
echo       rebuilding Drakon AI Desktop App
echo ===========================================
echo.
echo 1. Closing running instances...
taskkill /F /IM Drakon.exe 2>nul
taskkill /F /IM python.exe 2>nul

echo.
echo 2. Cleaning previous builds...
rmdir /S /Q build 2>nul
rmdir /S /Q dist 2>nul

echo.
echo 3. Building new Executable...
echo This may take a minute. Please wait...
pyinstaller --clean --noconfirm Drakon.spec

echo.
echo ===========================================
echo       BUILD COMPLETE! 🚀
echo ===========================================
echo.
echo You can run the new app from: dist\Drakon\Drakon.exe
echo.

