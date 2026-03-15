@echo off

echo ==========================
echo Building Power Flow Card
echo ==========================

pnpm build

echo Copying file...
copy /Y "%~dp0\dist\power-flow-card-plus.js" "%~dp0"

echo Build complete: %DATE% %TIME%
pause