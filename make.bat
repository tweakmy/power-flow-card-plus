@echo off

echo ==========================
echo Building Power Flow Card
echo ==========================

pnpm build

echo Copying file...
copy /Y dist\power-flow-card-plus.js .

echo Build complete: %DATE% %TIME%
pause