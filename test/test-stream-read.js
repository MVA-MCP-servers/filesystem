#!/usr/bin/env node

/**
 * Тестовый скрипт для демонстрации работы потокового чтения файлов
 * Позволяет протестировать функцию stream_read_file в реальных условиях
 * 
 * Использование:
 *   node test-stream-read.js <путь_к_файлу> [смещение] [лимит]
 * 
 * Примеры:
 *   node test-stream-read.js C:\\Backups\\OD\\_NewStory\\NSP\\pg100.txt              // Чтение первого мегабайта файла
 *   node test-stream-read.js C:\\Backups\\OD\\_NewStory\\NSP\\pg100.txt 1048576      // Чтение второго мегабайта
 *   node test-stream-read.js C:\\Backups\\OD\\_NewStory\\NSP\\pg100.txt 0 512000     // Чтение первых 512 КБ
 */

// Имитация JSON-RPC запроса к инструменту stream_read_file
const toolCall = {
  jsonrpc: '2.0',
  id: '1',
  method: 'callTool',
  params: {
    name: 'stream_read_file',
    arguments: {
      path: process.argv[2] || 'test-file.txt',
      offset: process.argv[3] ? parseInt(process.argv[3]) : 0,
      limit: process.argv[4] ? parseInt(process.argv[4]) : undefined,
      encoding: 'utf8',
      chunkSize: 262144 // 256 КБ
    }
  }
};

// Обработчик для форматированного вывода результата
function formatResponse(response) {
  if (response.error) {
    console.error('Ошибка:');
    console.error(response.error.message);
    return;
  }

  const content = response.content[0].text;
  
  // Выводим информацию о размере и первые/последние строки
  const lineCount = content.split('\n').length;
  const charCount = content.length;
  
  console.log(`\n=== Результат потокового чтения ===`);
  console.log(`Прочитано символов: ${charCount}`);
  console.log(`Прочитано строк: ${lineCount}`);
  
  // Извлекаем и выводим информационное сообщение (текст после последнего символа "[")
  const infoMessageMatch = content.match(/\[.*\]$/s);
  if (infoMessageMatch) {
    const infoMessage = infoMessageMatch[0];
    console.log(`\n${infoMessage}`);
  }
  
  // Выводим первые и последние 5 строк контента
  const lines = content.split('\n');
  
  console.log('\n=== Первые 5 строк ===');
  lines.slice(0, 5).forEach((line, i) => {
    console.log(`${i + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
  });
  
  console.log('\n=== Последние 5 строк перед информационным сообщением ===');
  // Находим позицию информационного сообщения, чтобы исключить его из вывода
  const contentWithoutInfo = infoMessageMatch 
    ? content.substring(0, content.lastIndexOf(infoMessageMatch[0])) 
    : content;
  
  const contentLines = contentWithoutInfo.split('\n');
  contentLines.slice(-5).forEach((line, i) => {
    console.log(`${contentLines.length - 5 + i + 1}: ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
  });
}

// Функция для имитации вызова инструмента
async function simulateToolCall() {
  console.log('Вызов stream_read_file с параметрами:');
  console.log(JSON.stringify(toolCall.params.arguments, null, 2));
  
  try {
    // В реальной ситуации вызывался бы сервер
    console.log('\nДля реального тестирования запустите:');
    console.log('1. Сервер MCP filesystem: node dist/index.js <разрешенная_директория>');
    console.log('2. Клиентский код, использующий инструмент stream_read_file');
    
    console.log('\nПримечание: Этот скрипт только демонстрирует структуру запроса,');
    console.log('но не выполняет реальную работу без запущенного сервера.\n');
    
    // Пример финального результата с информацией о чтении
    const mockResponse = {
      content: [{ 
        type: "text", 
        text: "Начало контента файла...\n...\nКонец контента файла\n\n[ℹ️ Потоковое чтение: прочитано 1048576 байт из 5638516 байт файла, начиная с позиции 0]" 
      }]
    };
    
    formatResponse(mockResponse);
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
  }
}

// Запускаем имитацию инструмента
simulateToolCall();
      // Пример структуры ответа
      const exampleResponse = {
        content: [{ 
          type: "text", 
          text: "Содержимое первого мегабайта файла...\n\n[ℹ️ Потоковое чтение: прочитано 1048576 байт из 5638516 байт файла, начиная с позиции 0]" 
        }]
      };
      
      // Форматируем и выводим пример ответа
      formatResponse(exampleResponse);
    } else {
      console.log('\n⚠️ Не указан путь к файлу! Пример использования:');
      console.log('  node test-stream-read.js <путь_к_файлу> [смещение] [лимит]');
    }
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
  }
}

// Запускаем тест
runTestCall();

/**
 * Пример использования stream_read_file в реальном коде:
 * 
 * // 1. Подключение HTTP клиента
 * const axios = require('axios');
 * 
 * // 2. Пример вызова инструмента через JSON-RPC
 * async function callStreamReadFile(path, offset, limit) {
 *   try {
 *     const response = await axios.post('http://localhost:3000', {
 *       jsonrpc: '2.0',
 *       id: '1',
 *       method: 'callTool',
 *       params: {
 *         name: 'stream_read_file',
 *         arguments: {
 *           path,
 *           offset,
 *           limit,
 *           encoding: 'utf8',
 *           chunkSize: 262144 // 256 КБ
 *         }
 *       }
 *     });
 *     
 *     return response.data.result;
 *   } catch (error) {
 *     console.error('Ошибка при вызове stream_read_file:', error);
 *     throw error;
 *   }
 * }
 * 
 * // 3. Пример последовательного чтения большого файла
 * async function readLargeFileInChunks(filePath, chunkSize = 1024 * 1024) {
 *   // Получаем информацию о файле
 *   const fileInfo = await callTool('get_file_info', { path: filePath });
 *   const fileSize = fileInfo.size;
 *   
 *   // Вычисляем количество чанков
 *   const numChunks = Math.ceil(fileSize / chunkSize);
 *   
 *   // Читаем и обрабатываем файл по частям
 *   for (let i = 0; i < numChunks; i++) {
 *     console.log(`Чтение части ${i + 1}/${numChunks}...`);
 *     
 *     // Читаем чанк с помощью stream_read_file
 *     const content = await callStreamReadFile(
 *       filePath,
 *       i * chunkSize,
 *       chunkSize
 *     );
 *     
 *     // Обработка полученного контента...
 *     // processChunk(content);
 *   }
 *   
 *   console.log('Обработка файла завершена');
 * }
 */
