@echo off
echo Building filesystem server without tests...
npx tsc -p tsconfig.build.json && shx chmod +x dist/*.js
echo Build completed.
