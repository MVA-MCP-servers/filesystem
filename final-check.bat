@echo off
echo Running final TypeScript compilation check...

echo Building entire project...
npx tsc --noEmit

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] All TypeScript errors have been fixed successfully!
    echo The project is now ready for the build process.
    echo.
    echo You can run 'npm run build' to create the final production files.
) else (
    echo.
    echo [ERROR] There are still some TypeScript errors to fix.
    echo Please check the above messages and fix remaining issues.
)
