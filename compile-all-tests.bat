@echo off
echo Running TypeScript compilation test for all test files...

REM Компилируем все тестовые файлы для проверки типов
npx tsc test/basic-tests.test.ts test/overlap-algorithms.test.ts test/path-security.test.ts test/server-handlers.test.ts test/smart-append.test.ts --noEmit

if %errorlevel% equ 0 (
    echo TypeScript compilation for all tests successful! No type errors found.
) else (
    echo TypeScript compilation for tests failed! Type errors detected.
)
exit /b %errorlevel%
