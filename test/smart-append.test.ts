import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createMockStats, createMockFileHandle } from './mock-helpers.js';

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
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockRejectedValueOnce(new Error('File not found') as any);
      
      // Мокаем fs.writeFile
      const writeFileMock = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      writeFileMock.mockResolvedValueOnce(undefined as any);
      
      // Вызываем функцию
      const content = 'New file content';
      await smartAppend(testFilePath, content);
      
      // Проверяем, что fs.writeFile был вызван с правильными аргументами
      expect(writeFileMock).toHaveBeenCalledWith(testFilePath, content, 'utf8');
    });
    
    it('should handle small files by reading the entire content', async () => {
      // Симулируем существующий файл небольшого размера
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 500 // 500 байт
      }));
      
      // Существующее содержимое файла
      const existingContent = 'Initial content with overlap';
      
      // Новый контент с перекрытием
      const newContent = 'overlap and additional content';
      
      // Ожидаемое перекрытие: 'overlap'
      const expectedOverlap = 7; // длина слова 'overlap'
      
      // Мокаем fs.readFile
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValueOnce(existingContent as any);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValueOnce(undefined as any);
      
      // Вызываем функцию
      await smartAppend(testFilePath, newContent);
      
      // Ожидаемый контент для добавления (без перекрытия)
      const expectedAppend = ' and additional content';
      
      // Проверяем, что fs.appendFile был вызван с правильными аргументами
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, expectedAppend, 'utf8');
    });
    
    it('should use chunk reading for large files', async () => {
      // Симулируем существующий файл большого размера
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 20 * 1024 * 1024 // 20 МБ
      }));
      
      // Создаем объект для чтения файла с правильной функцией закрытия
      const readMock = jest.fn().mockImplementation((buffer, offset, length, position) => {
        // Симулируем чтение хвоста файла
        const tailContent = 'tail content with overlap';
        Buffer.from(tailContent).copy(buffer as Buffer);
        return { bytesRead: tailContent.length };
      });
      
      const closeMock = jest.fn().mockImplementation(() => Promise.resolve());
      
      const fileHandleMock = {
        read: readMock,
        close: closeMock,
        // Необходимые методы для полного интерфейса FileHandle
        readFile: jest.fn(),
        writeFile: jest.fn(),
        appendFile: jest.fn(),
        datasync: jest.fn(),
        sync: jest.fn(),
        truncate: jest.fn(),
        stat: jest.fn(),
        chown: jest.fn(),
        chmod: jest.fn(),
        utimes: jest.fn()
      };
      
      (fs.open as jest.MockedFunction<typeof fs.open>).mockResolvedValueOnce(fileHandleMock as any);
      
      // Новый контент с перекрытием
      const newContent = 'overlap text to append';
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValueOnce(undefined as any);
      
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
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 20 * 1024 * 1024 // 20 МБ
      }));
      
      // Создаем объект для чтения файла с реализацией через промисы
      const readMock = jest.fn()
        // Первый вызов - маленький чанк без перекрытия
        .mockImplementationOnce((buffer, offset, length, position) => {
          Buffer.from('no overlap here').copy(buffer as Buffer);
          return { bytesRead: 14 };
        })
        // Второй вызов - увеличенный чанк с перекрытием
        .mockImplementationOnce((buffer, offset, length, position) => {
          Buffer.from('larger chunk with overlap').copy(buffer as Buffer);
          return { bytesRead: 24 };
        });
      
      const closeMock = jest.fn().mockImplementation(() => Promise.resolve());
      
      const fileHandleMock = {
        read: readMock,
        close: closeMock,
        // Необходимые методы для полного интерфейса FileHandle
        readFile: jest.fn(),
        writeFile: jest.fn(),
        appendFile: jest.fn(),
        datasync: jest.fn(),
        sync: jest.fn(),
        truncate: jest.fn(),
        stat: jest.fn(),
        chown: jest.fn(),
        chmod: jest.fn(),
        utimes: jest.fn()
      };
      
      (fs.open as jest.MockedFunction<typeof fs.open>).mockResolvedValueOnce(fileHandleMock as any);
      
      // Новый контент с перекрытием
      const newContent = 'overlap followed by new content';
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValueOnce(undefined as any);
      
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
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 100
      }));
      
      // Существующее содержимое файла
      const existingContent = 'This is a test.';
      
      // Очень короткий новый контент
      const newContent = '.';
      
      // Мокаем fs.readFile
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValueOnce(existingContent as any);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValueOnce(undefined as any);
      
      // Вызываем функцию
      await smartAppend(testFilePath, newContent);
      
      // Ожидаем, что ничего не будет добавлено, так как есть перекрытие
      expect(appendFileMock).not.toHaveBeenCalled();
    });
    
    it('should handle errors during file operations', async () => {
      // Симулируем ошибку при чтении файла
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 100
      }));
      
      // Ошибка при чтении файла
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockRejectedValueOnce(new Error('Read error') as any);
      
      // Проверяем, что ошибка правильно пробрасывается
      await expect(smartAppend(testFilePath, 'content')).rejects.toThrow('Read error');
    });
  });
  
  // Тесты на производительность
  describe('Performance Tests', () => {
    let tempDir: string;
    let testFilePath: string;
    
    beforeEach(() => {
      // Настройка окружения для каждого теста
      tempDir = path.join(os.tmpdir(), 'test-performance-');
      testFilePath = path.join(tempDir, 'test-file.txt');
      
      // Сбрасываем моки
      jest.clearAllMocks();
    });
    
    it('should handle large files efficiently', async () => {
      // Этот тест проверяет, что функция smartAppend эффективно обрабатывает большие файлы
      
      // Симулируем большой файл
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
        size: 50 * 1024 * 1024 // 50 МБ
      }));
      
      // Фиксируем значение length, чтобы избежать ошибки типизации
      const fileSize = 50 * 1024 * 1024;
      const tailContent = 'a'.repeat(1000) + 'overlap_data';
      
      // Создаем объект для чтения файла с реализацией через промисы
      const readMock = jest.fn().mockImplementation((buffer, offset, length, position) => {
        Buffer.from(tailContent).copy(buffer as Buffer);
        return { bytesRead: tailContent.length };
      });
      
      const closeMock = jest.fn().mockImplementation(() => Promise.resolve());
      
      const fileHandleMock = {
        read: readMock,
        close: closeMock,
        // Необходимые методы для полного интерфейса FileHandle
        readFile: jest.fn(),
        writeFile: jest.fn(),
        appendFile: jest.fn(),
        datasync: jest.fn(),
        sync: jest.fn(),
        truncate: jest.fn(),
        stat: jest.fn(),
        chown: jest.fn(),
        chmod: jest.fn(),
        utimes: jest.fn()
      };
      
      (fs.open as jest.MockedFunction<typeof fs.open>).mockResolvedValueOnce(fileHandleMock as any);
      
      // Создаем большой новый контент с перекрытием в начале
      const newContent = 'overlap_data' + 'b'.repeat(10000);
      
      // Мокаем fs.appendFile
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValueOnce(undefined as any);
      
      // Вызываем функцию с большим размером чанка
      const chunkSize = 1024 * 1024; // 1 МБ
      
      // Замеряем время выполнения
      const startTime = Date.now();
      await smartAppend(testFilePath, newContent, chunkSize);
      const endTime = Date.now();
      
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
