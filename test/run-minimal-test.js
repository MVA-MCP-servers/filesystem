/**
 * Скрипт для запуска минимального теста без Jest
 */

// Компилируем TypeScript файл с помощью tsc
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Компиляция тестового файла...');

try {
  execSync('npx tsc test/minimal-test.ts --outDir test/dist --module NodeNext --target ES2022', {
    stdio: 'inherit'
  });
  
  console.log('Компиляция успешно завершена!');
  console.log('Запуск теста...');
  console.log('-------------------------------------------');
  
  execSync('node test/dist/minimal-test.js', {
    stdio: 'inherit'
  });
  
  console.log('-------------------------------------------');
  console.log('Тест успешно завершен!');
} catch (error) {
  console.error('Ошибка при выполнении теста:', error.message);
  process.exit(1);
}
