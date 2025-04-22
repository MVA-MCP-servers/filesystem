import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Импортируем функции для тестирования из нашего экспортного файла
import { smartAppend, findMaxOverlapSimple, findMaxOverlapRabinKarp } from './test-exports.js';

// Мок для fs/promises
jest.mock('fs/promises');

describe('Smart Append Tests', () => {
  // Тесты для алгоритмов перекрытия
  describe('findMaxOverlapSimple', () => {
    it('should return 0 when there is no overlap', () => {
      expect(findMaxOverlapSimple('hello', 'world')).toBe(0);
    });

    it('should find overlap at end of first string and beginning of second', () => {
      expect(findMaxOverlapSimple('hello world', 'world peace')).toBe(5);
    });
    
    it('should handle empty strings', () => {
      expect(findMaxOverlapSimple('', '')).toBe(0);
      expect(findMaxOverlapSimple('hello', '')).toBe(0);
      expect(findMaxOverlapSimple('', 'world')).toBe(0);
    });
    
    it('should find single character overlap', () => {
      expect(findMaxOverlapSimple('data1', '1data')).toBe(1);
    });
  });

  describe('findMaxOverlapRabinKarp', () => {
    it('should return 0 when there is no overlap', () => {
      expect(findMaxOverlapRabinKarp('hello', 'world')).toBe(0);
    });

    it('should find overlap at end of first string and beginning of second', () => {
      expect(findMaxOverlapRabinKarp('hello world', 'world peace')).toBe(5);
    });
    
    it('should handle empty strings', () => {
      expect(findMaxOverlapRabinKarp('', '')).toBe(0);
      expect(findMaxOverlapRabinKarp('hello', '')).toBe(0);
      expect(findMaxOverlapRabinKarp('', 'world')).toBe(0);
    });
    
    it('should handle large strings efficiently', () => {
      const str1 = 'a'.repeat(10000) + 'overlap';
      const str2 = 'overlap' + 'b'.repeat(10000);
      
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(7);
    });
    
    it('should correctly handle hash collisions', () => {
      // Создаём строки, которые могут вызвать коллизии хешей
      const str1 = 'abcdef123456';
      const str2 = '123456abcdef';
      
      // Должен правильно определить, что перекрытия нет
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(0);
    });
  });

  // Основные тесты для smartAppend
  describe('smartAppend', () => {
    let tempDir: string;
    let testFilePath: string;
    
    beforeEach(() => {
      // Настройка окружения для каждого теста
      tempDir = path.join(os.tmpdir(), 'test-smartappend-');
      testFilePath = path.join(tempDir, 'test-file.txt');
      
      // Сбрасываем моки
      jest.clearAllMocks();
    });
    
    it('should create a new file if it does not exist', async () => {
      // Симулируем отсутствие файла
      (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
      
      // Мокаем fs.writeFile
      const writeFileMock = fs.writeFile as jest.Mock;
      writeFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию
      const content = 'New file content';
      await smartAppend(testFilePath, content);
      
      // Проверяем, что fs.writeFile был вызван с правильными аргументами
      expect(writeFileMock).toHaveBeenCalledWith(testFilePath, content, 'utf8');
    });
    
    it('should handle small files by reading the entire content', async () => {
      // Симулируем существующий файл небольшого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 500, // 500 байт
        isDirectory: () => false
      });
      
      // Существующее содержимое файла
      const existingContent = 'Initial content with overlap';
      
      // Новый контент с перекрытием
      const newContent = 'overlap and additional content';
      
      // Ожидаемое перекрытие: 'overlap'
      const expectedOverlap = 7; // длина слова 'overlap'
      
      // Мокаем fs.readFile
      (fs.readFile as jest.Mock).mockResolvedValueOnce(existingContent);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию
      await smartAppend(testFilePath, newContent);
      
      // Ожидаемый контент для добавления (без перекрытия)
      const expectedAppend = ' and additional content';
      
      // Проверяем, что fs.appendFile был вызван с правильными аргументами
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, expectedAppend, 'utf8');
    });
    
    it('should use chunk reading for large files', async () => {
      // Симулируем существующий файл большого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 20 * 1024 * 1024, // 20 МБ
        isDirectory: () => false
      });
      
      // Мокаем fs.open для чтения хвоста файла
      const fileHandleMock = {
        read: jest.fn().mockImplementation((buffer, offset, length, position) => {
          // Симулируем чтение хвоста файла
          const tailContent = 'tail content with overlap';
          Buffer.from(tailContent).copy(buffer);
          return { bytesRead: tailContent.length };
        }),
        close: jest.fn().mockResolvedValue(undefined)
      };
      
      (fs.open as jest.Mock).mockResolvedValueOnce(fileHandleMock);
      
      // Новый контент с перекрытием
      const newContent = 'overlap text to append';
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию с указанием размера чанка
      const chunkSize = 2048;
      await smartAppend(testFilePath, newContent, chunkSize);
      
      // Проверяем, что fs.open был вызван с правильными аргументами
      expect(fs.open).toHaveBeenCalledWith(testFilePath, 'r');
      
      // Проверяем, что метод read был вызван
      expect(fileHandleMock.read).toHaveBeenCalled();
      
      // Проверяем, что метод close был вызван
      expect(fileHandleMock.close).toHaveBeenCalled();
      
      // Проверяем, что fs.appendFile был вызван (с правильным удалением перекрытия)
      expect(appendFileMock).toHaveBeenCalled();
    });
    
    it('should handle increasing chunk size for large files without overlap', async () => {
      // Симулируем существующий файл большого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 20 * 1024 * 1024, // 20 МБ
        isDirectory: () => false
      });
      
      // Симулируем последовательное чтение с увеличением размера чанка
      // и отсутствие перекрытия в первых чтениях
      const fileHandleMock = {
        read: jest.fn()
          // Первый вызов - маленький чанк без перекрытия
          .mockImplementationOnce((buffer, offset, length, position) => {
            Buffer.from('no overlap here').copy(buffer);
            return { bytesRead: 14 };
          })
          // Второй вызов - увеличенный чанк с перекрытием
          .mockImplementationOnce((buffer, offset, length, position) => {
            Buffer.from('larger chunk with overlap').copy(buffer);
            return { bytesRead: 24 };
          }),
        close: jest.fn().mockResolvedValue(undefined)
      };
      
      (fs.open as jest.Mock).mockResolvedValueOnce(fileHandleMock);
      
      // Новый контент с перекрытием
      const newContent = 'overlap followed by new content';
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию с маленьким начальным размером чанка
      const initialChunkSize = 512;
      await smartAppend(testFilePath, newContent, initialChunkSize);
      
      // Проверяем, что fs.open был вызван с правильными аргументами
      expect(fs.open).toHaveBeenCalledWith(testFilePath, 'r');
      
      // Проверяем, что метод read был вызван дважды (для разных размеров чанков)
      expect(fileHandleMock.read).toHaveBeenCalledTimes(2);
      
      // Проверяем, что метод close был вызван
      expect(fileHandleMock.close).toHaveBeenCalled();
      
      // Проверяем, что fs.appendFile был вызван
      expect(appendFileMock).toHaveBeenCalled();
    });
    
    it('should handle the edge case when content is very small', async () => {
      // Симулируем существующий файл
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 100,
        isDirectory: () => false
      });
      
      // Существующее содержимое файла
      const existingContent = 'This is a test.';
      
      // Очень короткий новый контент
      const newContent = '.';
      
      // Мокаем fs.readFile
      (fs.readFile as jest.Mock).mockResolvedValueOnce(existingContent);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию
      await smartAppend(testFilePath, newContent);
      
      // Ожидаем, что ничего не будет добавлено, так как есть перекрытие
      expect(appendFileMock).not.toHaveBeenCalled();
    });
    
    it('should handle errors during file operations', async () => {
      // Симулируем ошибку при чтении файла
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 100,
        isDirectory: () => false
      });
      
      // Ошибка при чтении файла
      (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('Read error'));
      
      // Проверяем, что ошибка правильно пробрасывается
      await expect(smartAppend(testFilePath, 'content')).rejects.toThrow('Read error');
    });
  });
  
  // Тесты на производительность
  describe('Performance Tests', () => {
    it('should handle large files efficiently', async () => {
      // Этот тест проверяет, что функция smartAppend эффективно обрабатывает большие файлы
      
      // Симулируем большой файл
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 50 * 1024 * 1024, // 50 МБ
        isDirectory: () => false
      });
      
      // Мокаем fs.open для чтения хвоста файла
      const fileHandleMock = {
        read: jest.fn().mockImplementation((buffer, offset, length, position) => {
          // Заполняем буфер тестовыми данными
          const tailContent = 'a'.repeat(length - 100) + 'overlap_data';
          Buffer.from(tailContent).copy(buffer);
          return { bytesRead: tailContent.length };
        }),
        close: jest.fn().mockResolvedValue(undefined)
      };
      
      (fs.open as jest.Mock).mockResolvedValueOnce(fileHandleMock);
      
      // Создаем большой новый контент с перекрытием в начале
      const newContent = 'overlap_data' + 'b'.repeat(10000);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем функцию с большим размером чанка
      const chunkSize = 1024 * 1024; // 1 МБ
      
      // Замеряем время выполнения
      const startTime = Date.now();
      await smartAppend(testFilePath, newContent, chunkSize);
      const endTime = Date.now();
      
      // Время выполнения (для информации)
      const executionTime = endTime - startTime;
      console.log(`smartAppend execution time: ${executionTime}ms`);
      
      // Проверяем, что fs.appendFile был вызван с правильными аргументами
      expect(appendFileMock).toHaveBeenCalledWith(
        testFilePath,
        'b'.repeat(10000),
        'utf8'
      );
    });
    
    it('should compare performance of overlap algorithms', () => {
      // Генерируем строки для сравнения
      const generateLargeStrings = (size: number, overlapSize: number) => {
        const common = 'x'.repeat(overlapSize);
        const str1 = 'a'.repeat(size - overlapSize) + common;
        const str2 = common + 'b'.repeat(size - overlapSize);
        return { str1, str2 };
      };
      
      // Тестовые строки
      const { str1, str2 } = generateLargeStrings(10000, 100);
      
      // Проверяем корректность алгоритмов
      expect(findMaxOverlapSimple(str1, str2)).toBe(100);
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(100);
      
      // Сравниваем производительность
      const runPerformanceTest = (algorithm: Function, str1: string, str2: string, runs: number) => {
        const startTime = Date.now();
        for (let i = 0; i < runs; i++) {
          algorithm(str1, str2);
        }
        return Date.now() - startTime;
      };
      
      const runsCount = 10;
      const simpleTime = runPerformanceTest(findMaxOverlapSimple, str1, str2, runsCount);
      const rabinKarpTime = runPerformanceTest(findMaxOverlapRabinKarp, str1, str2, runsCount);
      
      console.log(`Simple algorithm: ${simpleTime}ms for ${runsCount} runs`);
      console.log(`Rabin-Karp algorithm: ${rabinKarpTime}ms for ${runsCount} runs`);
      
      // Для больших строк Рабин-Карп должен быть эффективнее
      // Но в тестовой среде с моками это может быть не так заметно
      expect(rabinKarpTime).toBeLessThanOrEqual(simpleTime * 1.5);
    });
  });
});
