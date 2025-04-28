@echo off
echo Building filesystem server without tests...
npx tsc -p tsconfig.build.json
if not "%OS%"=="Windows_NT" (
	  npx shx chmod +x dist/*.js
  )
  echo Build completed.
