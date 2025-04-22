/**
 * Скрипт для запуска минимального теста smartAppend без Jest
 */

// Компилируем TypeScript файл с помощью tsc
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Компиляция тестового файла для smartAppend...');

try {
  execSync('npx tsc test/minimal-smartappend.ts --outDir test/dist --module NodeNext --target ES2022', {
    stdio: 'inherit'
  });
  
  console.log('Компиляция успешно завершена!');
  console.log('Запуск теста smartAppend...');
  console.log('-------------------------------------------');
  
  execSync('node test/dist/minimal-smartappend.js', {
    stdio: 'inherit'
  });
  
  console.log('-------------------------------------------');
  console.log('Тест smartAppend успешно завершен!');
} catch (error) {
  console.error('Ошибка при выполнении теста smartAppend:', error.message);
  process.exit(1);
}
