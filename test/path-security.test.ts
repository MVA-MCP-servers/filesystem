import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Импортируем функции для тестирования из нашего экспортного файла
import { validatePath } from './test-exports.js';

// Мок для fs/promises
jest.mock('fs/promises');

describe('Path Security Tests', () => {
  // Моделируем разрешенные директории для тестов
  const allowedDirectories = [
    path.normalize('/allowed/dir1'),
    path.normalize('/allowed/dir2'),
    path.normalize('C:\\allowed\\windows\\dir')
  ];
  
  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks();
    
    // Предполагаем, что validatePath имеет доступ к allowedDirectories
    // В реальном коде это может быть глобальная переменная или параметр
    global.allowedDirectories = allowedDirectories;
  });
  
  describe('Basic Path Validation', () => {
    it('should accept paths within allowed directories', async () => {
      const safePath = path.join('/allowed/dir1', 'file.txt');
      
      // Мокаем fs.realpath для возврата того же пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(safePath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(safePath);
      expect(result).toBe(safePath);
    });
    
    it('should reject paths outside allowed directories', async () => {
      const unsafePath = '/unauthorized/path/file.txt';
      
      // Проверяем, что функция выбрасывает ошибку
      await expect(validatePath(unsafePath)).rejects.toThrow('Access denied');
    });
    
    it('should handle Windows-style paths', async () => {
      const windowsPath = 'C:\\allowed\\windows\\dir\\file.txt';
      
      // Мокаем fs.realpath для возврата того же пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(windowsPath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(windowsPath);
      expect(result).toBe(windowsPath);
    });
    
    it('should normalize paths before validation', async () => {
      const nonNormalizedPath = '/allowed/dir1/../dir1/file.txt';
      const normalizedPath = '/allowed/dir1/file.txt';
      
      // Мокаем fs.realpath для возврата нормализованного пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(normalizedPath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(nonNormalizedPath);
      expect(result).toBe(normalizedPath);
    });
  });
  
  describe('Symlink Handling', () => {
    it('should follow symlinks and validate their targets', async () => {
      const symlinkPath = '/allowed/dir1/symlink';
      const targetPath = '/allowed/dir2/target';
      
      // Мокаем fs.realpath для возврата реального пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(targetPath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(symlinkPath);
      expect(result).toBe(targetPath);
      expect(fs.realpath).toHaveBeenCalledWith(symlinkPath);
    });
    
    it('should reject symlinks targeting outside allowed directories', async () => {
      const symlinkPath = '/allowed/dir1/symlink';
      const targetPath = '/unauthorized/target';
      
      // Мокаем fs.realpath для возврата пути вне разрешенных директорий
      (fs.realpath as jest.Mock).mockResolvedValueOnce(targetPath);
      
      // Проверяем, что функция выбрасывает ошибку
      await expect(validatePath(symlinkPath)).rejects.toThrow('Access denied');
    });
    
    it('should handle nested symlinks correctly', async () => {
      const path1 = '/allowed/dir1/symlink1';
      const path2 = '/allowed/dir2/symlink2';
      const finalPath = '/allowed/dir2/target';
      
      // Мокаем fs.realpath для имитации цепочки символических ссылок
      (fs.realpath as jest.Mock).mockResolvedValueOnce(finalPath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(path1);
      expect(result).toBe(finalPath);
    });
  });
  
  describe('New File Validation', () => {
    it('should validate parent directory for new files', async () => {
      const newFilePath = '/allowed/dir1/new/file.txt';
      const parentDir = '/allowed/dir1/new';
      
      // Мокаем fs.realpath для выбрасывания ошибки (файл не существует)
      (fs.realpath as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
      
      // Мокаем fs.realpath для родительской директории
      (fs.realpath as jest.Mock).mockResolvedValueOnce(parentDir);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(newFilePath);
      expect(result).toBe(newFilePath);
    });
    
    it('should reject if parent directory is outside allowed directories', async () => {
      const unsafeNewFilePath = '/unauthorized/new/file.txt';
      const parentDir = '/unauthorized/new';
      
      // Мокаем fs.realpath для выбрасывания ошибки (файл не существует)
      (fs.realpath as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
      
      // Мокаем fs.realpath для родительской директории
      (fs.realpath as jest.Mock).mockResolvedValueOnce(parentDir);
      
      // Проверяем, что функция выбрасывает ошибку
      await expect(validatePath(unsafeNewFilePath)).rejects.toThrow('Access denied');
    });
    
    it('should reject if parent directory does not exist', async () => {
      const newFilePath = '/allowed/dir1/non-existent-dir/file.txt';
      
      // Мокаем fs.realpath для выбрасывания ошибки (файл не существует)
      (fs.realpath as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
      
      // Мокаем fs.realpath для родительской директории, которая не существует
      (fs.realpath as jest.Mock).mockRejectedValueOnce(new Error('Directory not found'));
      
      // Проверяем, что функция выбрасывает ошибку
      await expect(validatePath(newFilePath)).rejects.toThrow('Parent directory does not exist');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle home directory expansion', async () => {
      // Тест для проверки обработки пути с тильдой (~)
      const tildeBasedPath = '~/documents/file.txt';
      const expandedPath = path.join(os.homedir(), 'documents/file.txt');
      
      // Предполагаем, что домашняя директория разрешена
      (global.allowedDirectories as string[]).push(path.normalize(os.homedir()));
      
      // Мокаем fs.realpath для возврата расширенного пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(expandedPath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(tildeBasedPath);
      expect(result).toBe(expandedPath);
    });
    
    it('should reject paths with directory traversal attempts', async () => {
      const traversalPath = '/allowed/dir1/../../../etc/passwd';
      
      // Нормализованный путь будет вне разрешенных директорий
      const normalizedPath = '/etc/passwd';
      
      // Мокаем fs.realpath для возврата нормализованного пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(normalizedPath);
      
      // Проверяем, что функция выбрасывает ошибку
      await expect(validatePath(traversalPath)).rejects.toThrow('Access denied');
    });
    
    it('should handle relative paths correctly', async () => {
      // Предполагаем, что текущая директория - /current/dir
      process.cwd = jest.fn().mockReturnValue('/current/dir');
      
      // Добавляем текущую директорию в список разрешенных
      (global.allowedDirectories as string[]).push('/current/dir');
      
      const relativePath = './file.txt';
      const absolutePath = '/current/dir/file.txt';
      
      // Мокаем fs.realpath для возврата абсолютного пути
      (fs.realpath as jest.Mock).mockResolvedValueOnce(absolutePath);
      
      // Вызываем функцию и проверяем результат
      const result = await validatePath(relativePath);
      expect(result).toBe(absolutePath);
    });
    
    it('should handle case sensitive/insensitive path comparisons correctly', async () => {
      // Тест для проверки корректности сравнения путей в разных ОС
      const testPath = '/Allowed/Dir1/file.txt'; // Обратите внимание на регистр
      
      if (process.platform === 'win32') {
        // На Windows сравнение должно быть нечувствительно к регистру
        (fs.realpath as jest.Mock).mockResolvedValueOnce(testPath);
        const result = await validatePath(testPath);
        expect(result).toBe(testPath);
      } else {
        // На Unix-системах сравнение должно быть чувствительно к регистру
        await expect(validatePath(testPath)).rejects.toThrow('Access denied');
      }
    });
  });
  
  describe('Cache Functionality', () => {
    it('should cache realpath results for performance', async () => {
      const safePath = '/allowed/dir1/file.txt';
      
      // Мокаем fs.realpath для возврата пути
      (fs.realpath as jest.Mock).mockResolvedValue(safePath);
      
      // Вызываем функцию дважды
      await validatePath(safePath);
      await validatePath(safePath);
      
      // Проверяем, что fs.realpath был вызван только один раз
      // Это предполагает, что validatePath использует кэширование
      expect(fs.realpath).toHaveBeenCalledTimes(1);
    });
  });
});
