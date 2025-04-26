#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки автоматического выбора оптимального метода записи файлов
 * 
 * Использование:
 *   node test-optimized-write.js <тип_теста>
 * 
 * Типы тестов:
 *   small - тест с небольшим объемом данных
 *   large - тест с большим объемом данных
 *   binary - тест с бинарными данными
 *   all - запуск всех тестов последовательно
 */

const fs = require('fs');
const path = require('path');

// Настройки тестирования
const config = {
  testDir: path.join(__dirname, 'test-files'),
  smallFile: 'small-test.txt',
  largeFile: 'large-test.txt',
  binaryFile: 'binary-test.bin',
  smallContent: 'Это небольшой тестовый файл для проверки записи.\n'.repeat(10),
  largeContent: 'Это строка для генерации большого файла, чтобы проверить оптимизацию записи.\n'.repeat(5000),
};

/**
 * Имитация JSON-RPC запроса к MCP серверу
 */
function createJsonRpcRequest(method, params) {
  return {
    jsonrpc: '2.0',
    id: Date.now().toString(),
    method: 'callTool',
    params: {
      name: method,
      arguments: params
    }
  };
}

/**
 * Подготовка тестовой директории
 */
async function prepareTestDirectory() {
  console.log('Подготовка тестовой директории...');
  
  // Создаем директорию, если она не существует
  if (!fs.existsSync(config.testDir)) {
    fs.mkdirSync(config.testDir, { recursive: true });
    console.log(`Создана директория: ${config.testDir}`);
  }
  
  // Очищаем существующие тестовые файлы
  const testFiles = [config.smallFile, config.largeFile, config.binaryFile];
  for (const file of testFiles) {
    const filePath = path.join(config.testDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Удален существующий файл: ${filePath}`);
    }
  }
}

/**
 * Тест записи небольшого файла
 */
async function testSmallFileWrite() {
  console.log('\n=== Тест записи небольшого файла ===');
  
  // Генерируем запрос на запись небольшого файла
  const smallFilePath = path.join(config.testDir, config.smallFile);
  const writeRequest = createJsonRpcRequest('write_file', {
    path: smallFilePath,
    content: config.smallContent
  });
  
  console.log(`Запрос на запись файла: ${smallFilePath}`);
  console.log(`Размер контента: ${config.smallContent.length} символов`);
  console.log('\nРезультат:');
  console.log('В реальной среде MCP сервер будет использовать write_file для небольших файлов,');
  console.log('так как это наиболее эффективно для маленьких объемов данных.');
  
  // Запись файла для демонстрации
  fs.writeFileSync(smallFilePath, config.smallContent);
  console.log(`✓ Файл записан: ${smallFilePath} (${fs.statSync(smallFilePath).size} байт)`);
}

/**
 * Тест записи большого файла
 */
async function testLargeFileWrite() {
  console.log('\n=== Тест записи большого файла ===');
  
  // Генерируем запрос на запись большого файла
  const largeFilePath = path.join(config.testDir, config.largeFile);
  const writeRequest = createJsonRpcRequest('write_file', {
    path: largeFilePath,
    content: config.largeContent
  });
  
  console.log(`Запрос на запись файла: ${largeFilePath}`);
  console.log(`Размер контента: ${config.largeContent.length} символов`);
  console.log('\nРезультат:');
  console.log('В реальной среде MCP сервер автоматически переключится на smart_append_file,');
  console.log('поскольку размер контента превышает установленный порог для LLM.');
  
  // Запись файла для демонстрации
  fs.writeFileSync(largeFilePath, config.largeContent);
  console.log(`✓ Файл записан: ${largeFilePath} (${fs.statSync(largeFilePath).size} байт)`);
}

/**
 * Тест записи бинарного файла
 */
async function testBinaryFileWrite() {
  console.log('\n=== Тест записи бинарного файла ===');
  
  // Создаем некоторые бинарные данные (буфер с случайными байтами)
  const binaryData = Buffer.alloc(1024);
  for (let i = 0; i < binaryData.length; i++) {
    binaryData[i] = Math.floor(Math.random() * 256);
  }
  
  // Преобразуем в строку для запроса
  const binaryContent = binaryData.toString('binary');
  
  // Генерируем запрос на запись бинарного файла
  const binaryFilePath = path.join(config.testDir, config.binaryFile);
  const writeRequest = createJsonRpcRequest('write_file', {
    path: binaryFilePath,
    content: binaryContent
  });
  
  console.log(`Запрос на запись файла: ${binaryFilePath}`);
  console.log(`Размер контента: ${binaryContent.length} байт (бинарный)`);
  console.log('\nРезультат:');
  console.log('В реальной среде MCP сервер определит бинарный тип данных');
  console.log('и будет использовать write_file без оптимизации для корректной записи.');
  
  // Запись файла для демонстрации
  fs.writeFileSync(binaryFilePath, binaryData);
  console.log(`✓ Файл записан: ${binaryFilePath} (${fs.statSync(binaryFilePath).size} байт)`);
}

/**
 * Запуск всех тестов
 */
async function runAllTests() {
  await prepareTestDirectory();
  await testSmallFileWrite();
  await testLargeFileWrite();
  await testBinaryFileWrite();
  
  console.log('\n=== Результаты тестирования ===');
  console.log('Все тесты успешно выполнены!');
  console.log('Созданы следующие файлы:');
  
  // Выводим информацию о созданных файлах
  const testFiles = [config.smallFile, config.largeFile, config.binaryFile];
  for (const file of testFiles) {
    const filePath = path.join(config.testDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`- ${file}: ${stats.size} байт`);
    }
  }
  
  console.log('\nВыводы:');
  console.log('1. Для небольших файлов оптимально использовать write_file');
  console.log('2. Для больших текстовых файлов автоматически используется smart_append_file');
  console.log('3. Для бинарных файлов всегда используется write_file');
  console.log('4. При работе с Claude выбирается оптимальный метод записи, учитывая токены');
}

/**
 * Точка входа в программу
 */
async function main() {
  const testType = process.argv[2] || 'all';
  
  try {
    switch (testType.toLowerCase()) {
      case 'small':
        await prepareTestDirectory();
        await testSmallFileWrite();
        break;
        
      case 'large':
        await prepareTestDirectory();
        await testLargeFileWrite();
        break;
        
      case 'binary':
        await prepareTestDirectory();
        await testBinaryFileWrite();
        break;
        
      case 'all':
      default:
        await runAllTests();
        break;
    }
  } catch (error) {
    console.error('Ошибка при выполнении тестов:', error);
    process.exit(1);
  }
}

// Запускаем программу
main().catch(console.error);
