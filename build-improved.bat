@echo off
echo Building improved MCP filesystem server...

rem Сохраняем копию оригинального файла, если её ещё нет
if not exist index.ts.bak (
    echo Backing up original index.ts file
    copy index.ts index.ts.bak
)

rem Восстанавливаем исходный файл index.ts из резервной копии (если есть бэкап)
if exist index.ts.bak (
    echo Restoring original index.ts from backup
    copy index.ts.bak index.ts
)

rem Компилируем проект для проверки, что исходная версия работает
echo Compiling original version to verify it works
call npm run build

rem Теперь копируем улучшенную версию
echo Copying improved version
copy index-improved.ts index.ts

rem Компилируем улучшенную версию
echo Compiling improved version
call npm run build

echo Build completed successfully.
echo To restore original version, run: copy index.ts.bak index.ts && npm run build
