/**
 * Минимальный тестовый файл для проверки функции smartAppend
 * Этот файл не использует Jest, а просто демонстрирует логику алгоритма
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Функция для поиска максимального перекрытия
function findMaxOverlap(str1: string, str2: string): number {
  const maxPossibleOverlap = Math.min(str1.length, str2.length);
  for (let len = maxPossibleOverlap; len > 0; len--) {
    if (str1.slice(-len) === str2.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

// Функция для умного добавления в файл
async function smartAppend(filePath: string, content: string): Promise<void> {
  try {
    // Проверяем, существует ли файл
    let fileExists = false;
    try {
      await fs.stat(filePath);
      fileExists = true;
    } catch {
      // Файл не существует - это нормально
    }

    if (!fileExists) {
      // Файл не существует - создаем его
      console.log(`Файл ${filePath} не существует. Создаем новый файл...`);
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`Файл создан успешно с полным содержимым.`);
      return;
    }

    // Чтение существующего содержимого
    console.log(`Файл ${filePath} существует. Читаем содержимое...`);
    const existing = await fs.readFile(filePath, 'utf8');
    console.log(`Текущее содержимое (${existing.length} символов): "${existing.substring(0, 50)}${existing.length > 50 ? '...' : ''}"`);
    
    // Находим перекрытие
    const overlap = findMaxOverlap(existing, content);
    console.log(`Найдено перекрытие: ${overlap} символов`);

    // Дописываем только то, чего еще нет
    if (overlap < content.length) {
      const toAppend = content.slice(overlap);
      console.log(`Добавляем неперекрывающуюся часть (${toAppend.length} символов): "${toAppend.substring(0, 50)}${toAppend.length > 50 ? '...' : ''}"`);
      await fs.appendFile(filePath, toAppend, 'utf8');
      console.log(`Данные успешно добавлены в файл.`);
    } else {
      console.log(`Добавлять нечего - весь новый контент уже содержится в файле.`);
    }
  } catch (error) {
    console.error(`Ошибка при выполнении smartAppend: ${error}`);
    throw error;
  }
}

// Основная функция для демонстрации работы smartAppend
async function runTests() {
  console.log('Тестирование функции smartAppend:');
  console.log('------------------------------------');

  // Создаем временную директорию для тестов
  const tempDir = path.join(os.tmpdir(), 'smartappend-test-' + Date.now());
  const testFilePath = path.join(tempDir, 'test-file.txt');

  try {
    // Создаем временную директорию
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`Создана временная директория: ${tempDir}`);

    // Тест 1: Создание нового файла
    console.log('\nТест 1: Создание нового файла');
    console.log('----------------------------');
    const content1 = 'Это начальное содержимое файла.';
    await smartAppend(testFilePath, content1);

    // Тест 2: Добавление без перекрытия
    console.log('\nТест 2: Добавление без перекрытия');
    console.log('------------------------------');
    const content2 = 'Это новое содержимое без перекрытия.';
    await smartAppend(testFilePath, content2);

    // Тест 3: Добавление с перекрытием
    console.log('\nТест 3: Добавление с перекрытием');
    console.log('-----------------------------');
    const content3 = 'без перекрытия. Это продолжение с перекрытием.';
    await smartAppend(testFilePath, content3);

    // Тест 4: Полное перекрытие (не нужно ничего добавлять)
    console.log('\nТест 4: Полное перекрытие (не нужно ничего добавлять)');
    console.log('--------------------------------------------------');
    const content4 = 'Это продолжение с перекрытием.';
    await smartAppend(testFilePath, content4);

    // Проверяем итоговое содержимое файла
    const finalContent = await fs.readFile(testFilePath, 'utf8');
    console.log('\nИтоговое содержимое файла:');
    console.log('------------------------');
    console.log(finalContent);

    // Проверяем, соответствует ли итоговое содержимое ожидаемому
    const expectedContent = 'Это начальное содержимое файла.Это новое содержимое без перекрытия. Это продолжение с перекрытием.';
    console.log('\nПроверка результата:');
    console.log('------------------');
    if (finalContent === expectedContent) {
      console.log('ТЕСТ ПРОЙДЕН! Итоговое содержимое соответствует ожидаемому.');
    } else {
      console.log('ТЕСТ НЕ ПРОЙДЕН! Итоговое содержимое не соответствует ожидаемому.');
      console.log('Ожидаемое содержимое:', expectedContent);
    }
  } catch (error) {
    console.error('Ошибка при выполнении тестов:', error);
  } finally {
    // Очистка - удаляем временную директорию
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log(`\nВременная директория ${tempDir} удалена.`);
    } catch (cleanupError) {
      console.error('Ошибка при удалении временной директории:', cleanupError);
    }
  }
}

// Запускаем тесты
runTests().catch(console.error);
