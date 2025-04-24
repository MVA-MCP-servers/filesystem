import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Простая функция для демонстрации типизации моков
async function readAndProcessFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf8');
  return content.toUpperCase();
}

// Мокаем fs/promises
jest.mock('fs/promises');

describe('Typing Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should correctly type mocked fs functions', async () => {
    // Правильное типизирование мока
    const mockContent = 'test content';
    (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(mockContent as any);
    
    const result = await readAndProcessFile('/path/to/file.txt');
    
    expect(result).toBe('TEST CONTENT');
    expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf8');
  });

  it('should type Buffer operations correctly', () => {
    // Типизация для Buffer операций
    const buffer = Buffer.alloc(100);
    const sourceBuffer = Buffer.from('test data');
    
    // Проверка типизации
    Buffer.from(sourceBuffer).copy(buffer as Buffer);
    
    // Простой тест
    expect(buffer.toString()).toContain('test data');
  });

  it('should handle process.cwd mock typing', () => {
    // Типизация для process.cwd мока
    const origCwd = process.cwd;
    try {
      (process.cwd as unknown as jest.MockedFunction<typeof process.cwd>) = jest.fn().mockReturnValue('/mocked/path');
      
      expect(process.cwd()).toBe('/mocked/path');
    } finally {
      process.cwd = origCwd;
    }
  });
});

// Тест вызова TypeScript сборки
console.log('TypeScript typing check compiled successfully!');
