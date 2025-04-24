@echo off
echo Running TypeScript compilation test for fixed files...

REM Компилируем тестовые файлы для проверки типов
call npx tsc test/basic-tests.test.ts test/overlap-algorithms.test.ts test/path-security.test.ts test/server-handlers.test.ts test/smart-append.test.ts test/typing-check.ts --noEmit

if %errorlevel% equ 0 (
    echo [SUCCESS] TypeScript compilation for tests passed! No type errors found.
) else (
    echo [ERROR] TypeScript compilation for tests failed! Type errors detected.
)

REM Попробуем полную сборку проекта
echo.
echo Running full project build...
call npm run build

if %errorlevel% equ 0 (
    echo [SUCCESS] Full project build passed!
) else (
    echo [ERROR] Full project build failed!
)
