import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createMockStats } from './mock-helpers.js';

// Определим типы и функции для тестирования
type BufferEncoding = 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'latin1' | 'binary' | 'hex';

// Простая функция для поиска перекрытия
function findMaxOverlapSimple(str1: string, str2: string): number {
  const maxPossibleOverlap = Math.min(str1.length, str2.length);
  // Ищем с самого большого перекрытия
  for (let len = maxPossibleOverlap; len > 0; len--) {
    if (str1.slice(-len) === str2.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

// Функция для умного добавления в файл
async function smartAppend(filePath: string, content: string, chunkSize = 1024): Promise<void> {
  try {
    // Проверяем, существует ли файл
    try {
      await fs.stat(filePath);
    } catch {
      // Файл не существует - создаем его
      await fs.writeFile(filePath, content, "utf8");
      return;
    }

    // Чтение существующего содержимого
    const existing = await fs.readFile(filePath, "utf8");
    const overlap = findMaxOverlapSimple(existing, content);

    // Дописываем только то, чего еще нет
    if (overlap < content.length) {
      await fs.appendFile(filePath, content.slice(overlap), "utf8");
    }
  } catch (error) {
    console.error(`Ошибка при выполнении smartAppend: ${error}`);
    throw error;
  }
}

// Мокаем fs/promises
jest.mock('fs/promises');

describe('Basic File Operations', () => {
  // Тесты для findMaxOverlapSimple
  describe('findMaxOverlapSimple', () => {
    it('should return 0 when there is no overlap', () => {
      expect(findMaxOverlapSimple('hello', 'world')).toBe(0);
    });

    it('should find correct overlap', () => {
      expect(findMaxOverlapSimple('hello world', 'world peace')).toBe(5);
    });

    it('should handle empty strings', () => {
      expect(findMaxOverlapSimple('', '')).toBe(0);
      expect(findMaxOverlapSimple('hello', '')).toBe(0);
      expect(findMaxOverlapSimple('', 'world')).toBe(0);
    });
  });

  // Тесты для smartAppend
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
    
    it('should write entire content to a new file', async () => {
      // Настройка моков
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockImplementation(() => {
        throw new Error('File not found');
      });
      
      const writeFileMock = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
      writeFileMock.mockResolvedValue(undefined as any);
      
      // Вызов функции
      const content = 'New file content';
      await smartAppend(testFilePath, content);
      
      // Проверки
      expect(writeFileMock).toHaveBeenCalledWith(testFilePath, content, "utf8");
    });
    
    it('should append only non-overlapping content', async () => {
      // Настройка моков
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValue(createMockStats({
        size: 50
      }));
      
      const existingContent = 'This is the first part of the text.';
      const newContent = 'part of the text. This is the second part.';
      const expectedAppend = ' This is the second part.';
      
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(existingContent as any);
      
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValue(undefined as any);
      
      // Вызов функции
      await smartAppend(testFilePath, newContent);
      
      // Проверки
      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, "utf8");
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, expectedAppend, "utf8");
    });
    
    it('should not append when content is already in file', async () => {
      // Настройка моков
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValue(createMockStats({
        size: 50
      }));
      
      const content = 'This is the content';
      
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(content as any);
      
      const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
      appendFileMock.mockResolvedValue(undefined as any);
      
      // Вызов функции
      await smartAppend(testFilePath, content);
      
      // Проверки - appendFile не должен вызываться
      expect(appendFileMock).not.toHaveBeenCalled();
    });
    
    it('should handle errors correctly', async () => {
      // Настройка моков
      (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValue(createMockStats({
        size: 50
      }));
      
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockRejectedValue(new Error('Read error') as any);
      
      // Проверки - должна быть выброшена ошибка
      await expect(smartAppend(testFilePath, 'content')).rejects.toThrow('Read error');
    });
  });
});
