@echo off
echo Running TypeScript compilation test for all fixed modules...

echo Checking basic-tests.test.ts...
npx tsc test/basic-tests.test.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] basic-tests.test.ts still has issues!
    exit /b 1
)

echo Checking overlap-algorithms.test.ts...
npx tsc test/overlap-algorithms.test.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] overlap-algorithms.test.ts still has issues!
    exit /b 1
)

echo Checking path-security.test.ts...
npx tsc test/path-security.test.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] path-security.test.ts still has issues!
    exit /b 1
)

echo Checking server-handlers.test.ts...
npx tsc test/server-handlers.test.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] server-handlers.test.ts still has issues!
    exit /b 1
)

echo Checking smart-append.test.ts...
npx tsc test/smart-append.test.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] smart-append.test.ts still has issues!
    exit /b 1
)

echo Checking typing-check.ts...
npx tsc test/typing-check.ts --noEmit
if %errorlevel% neq 0 (
    echo [ERROR] typing-check.ts still has issues!
    exit /b 1
)

echo All individual modules compile successfully!

echo Running full project build...
npm run build

if %errorlevel% equ 0 (
    echo [SUCCESS] All fixes are working! The project builds without TypeScript errors.
) else (
    echo [ERROR] There are still issues with the project build.
)
