@echo off
echo Running TypeScript compilation test...
npx tsc -p test/tsconfig.test.json
if %errorlevel% equ 0 (
    echo TypeScript compilation successful! No type errors found.
) else (
    echo TypeScript compilation failed! Type errors detected.
)
exit /b %errorlevel%
