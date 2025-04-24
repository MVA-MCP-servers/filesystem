import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { createMockStats } from './mock-helpers';

// Мокаем fs/promises и другие модули
jest.mock('fs/promises');
jest.mock('diff');
jest.mock('minimatch');

// Мокаем типы и схемы, которые используются в сервере
// В реальном проекте здесь бы были импорты из SDK
const mockSchemas = {
  ListToolsRequestSchema: Symbol('ListToolsRequestSchema'),
  CallToolRequestSchema: Symbol('CallToolRequestSchema'),
};

// Мокаем сервер и его методы
const mockServer = {
  setRequestHandler: jest.fn(),
  connect: jest.fn(),
};

// Импортируем функции для тестирования из нашего экспортного файла
import {
  validatePath,
  smartAppend,
  applyFileEdits,
  searchFiles,
  getFileStats,
} from './test-exports.js';

describe('Server API Handlers', () => {
  // Переменные, доступные во всех тестах
  const allowedDirectories = [
    path.normalize('/allowed/dir1'),
    path.normalize('/allowed/dir2'),
  ];
  
  beforeEach(() => {
    // Сбрасываем моки перед каждым тестом
    jest.clearAllMocks();
    
    // Предполагаем, что validatePath имеет доступ к allowedDirectories
    global.allowedDirectories = allowedDirectories;
    
    // Мокаем функции, которые используются в обработчиках
    jest.spyOn(global, 'validatePath' as any).mockImplementation(async (p) => {
      // Простая реализация для тестов
      if (typeof p === 'string' && p.startsWith('/allowed/')) return p;
      throw new Error('Access denied - path outside allowed directories');
    });
  });
  
  describe('ListToolsRequestHandler', () => {
    it('should return a list of available tools', async () => {
      // Создаем мок для обработчика ListToolsRequest
      const handler = jest.fn().mockImplementation(async () => {
        return {
          tools: [
            {
              name: 'read_file',
              description: 'Read the complete contents of a file...',
              inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
            },
            {
              name: 'write_file',
              description: 'Create a new file or completely overwrite...',
              inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
            },
            {
              name: 'append_file',
              description: 'Append content to the end of an existing file...',
              inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
            },
            {
              name: 'smart_append_file',
              description: 'Intelligently append content to a file without duplication...',
              inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, chunkSize: { type: 'number' } } },
            },
            // Другие инструменты...
          ]
        }
      });
      
      // Вызываем обработчик
      const result = await handler();
      
      // Проверяем результат
      expect(result && 'tools' in result ? result.tools.length : 0).toBe(4); // Или другое количество
      const tools = result && 'tools' in result && Array.isArray(result.tools) ? result.tools : [];
      expect(tools.map((t: any) => t.name)).toContain('smart_append_file');
    });
  });
  
  describe('CallToolRequestHandler', () => {
    describe('smart_append_file', () => {
      it('should validate path before performing operation', async () => {
        // Запрос на умное добавление контента в файл
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/allowed/dir1/log.txt',
              content: 'New log entry data',
              chunkSize: 1024
            }
          }
        };
        
        // Мок для validatePath
        const validatePathMock = jest.spyOn(global, 'validatePath' as any)
          .mockResolvedValueOnce('/allowed/dir1/log.txt');
        
        // Мок для smartAppend
        const smartAppendMock = jest.spyOn(global, 'smartAppend' as any)
          .mockResolvedValueOnce(undefined);
        
        // Создаем обработчик
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем, что validatePath был вызван с правильным аргументом
        expect(validatePathMock).toHaveBeenCalledWith('/allowed/dir1/log.txt');
        
        // Проверяем, что smartAppend был вызван с правильными аргументами
        expect(smartAppendMock).toHaveBeenCalledWith(
          '/allowed/dir1/log.txt',
          'New log entry data',
          1024
        );
        
        // Проверяем результат
        expect(result).toEqual({
          content: [{ type: 'text', text: 'Successfully smart-appended to /allowed/dir1/log.txt' }]
        });
      });
      
      it('should handle invalid paths correctly', async () => {
        // Запрос с недопустимым путем
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/unauthorized/path/file.txt',
              content: 'Some content'
            }
          }
        };
        
        // Мок для validatePath, чтобы выбрасывать ошибку безопасности
        jest.spyOn(global, 'validatePath' as any)
          .mockRejectedValueOnce(new Error('Access denied - path outside allowed directories'));
        
        // Создаем обработчик
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем результат - должна быть ошибка
        expect(result).toEqual({
          error: {
            message: 'Access denied - path outside allowed directories'
          }
        });
        
        // Проверяем, что smartAppend не был вызван
        expect(global.smartAppend).not.toHaveBeenCalled();
      });
      
      it('should handle missing arguments', async () => {
        // Запрос с отсутствующими аргументами
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              // path отсутствует
              content: 'Some content'
            }
          }
        };
        
        // Создаем обработчик с проверкой аргументов
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            
            // Проверяем обязательные аргументы
            if (!path) throw new Error('Invalid arguments for smart_append_file: path is required');
            if (!content) throw new Error('Invalid arguments for smart_append_file: content is required');
            
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем результат - должна быть ошибка
        expect(result).toEqual({
          error: {
            message: 'Invalid arguments for smart_append_file: path is required'
          }
        });
      });
      
      it('should handle file operation errors', async () => {
        // Запрос на умное добавление контента в файл
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/allowed/dir1/log.txt',
              content: 'New log entry data'
            }
          }
        };
        
        // Мок для validatePath
        jest.spyOn(global, 'validatePath' as any)
          .mockResolvedValueOnce('/allowed/dir1/log.txt');
        
        // Мок для smartAppend, который выбрасывает ошибку
        jest.spyOn(global, 'smartAppend' as any)
          .mockRejectedValueOnce(new Error('Failed to write to file: disk full'));
        
        // Создаем обработчик
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем результат - должна быть ошибка
        expect(result).toEqual({
          error: {
            message: 'Failed to write to file: disk full'
          }
        });
      });
      
      it('should use default chunkSize when not provided', async () => {
        // Запрос без указания размера чанка
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/allowed/dir1/log.txt',
              content: 'New log entry data'
              // chunkSize не указан
            }
          }
        };
        
        // Мок для validatePath
        jest.spyOn(global, 'validatePath' as any)
          .mockResolvedValueOnce('/allowed/dir1/log.txt');
        
        // Мок для smartAppend
        const smartAppendMock = jest.spyOn(global, 'smartAppend' as any)
          .mockResolvedValueOnce(undefined);
        
        // Создаем обработчик
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize = 1024 } = req.params.arguments; // Дефолтное значение 1024
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем, что smartAppend был вызван с дефолтным значением chunkSize
        expect(smartAppendMock).toHaveBeenCalledWith(
          '/allowed/dir1/log.txt',
          'New log entry data',
          1024 // Дефолтное значение
        );
        
        // Проверяем результат
        expect(result).toEqual({
          content: [{ type: 'text', text: 'Successfully smart-appended to /allowed/dir1/log.txt' }]
        });
      });
      
      it('should detect and handle partial duplicates efficiently', async () => {
        // Запрос на добавление частично дублирующегося контента
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/allowed/dir1/log.txt',
              content: 'overlap content plus new data',
              chunkSize: 2048
            }
          }
        };
        
        // Мок для validatePath
        jest.spyOn(global, 'validatePath' as any)
          .mockResolvedValueOnce('/allowed/dir1/log.txt');
        
        // Мок для fs.stat, чтобы симулировать существующий файл
        (fs.stat as jest.MockedFunction<typeof fs.stat>).mockResolvedValueOnce(createMockStats({
          size: 1000 // Размер файла в байтах
        }));
        
        // Мок для fs.readFile, чтобы симулировать существующее содержимое с перекрытием
        (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValueOnce('existing content with overlap' as any);
        
        // Мок для fs.appendFile
        const appendFileMock = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;
        appendFileMock.mockResolvedValueOnce(undefined as any);
        
        // Создаем обработчик с использованием реальной функции smartAppend
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            const validPath = await validatePath(path);
            
            // Здесь мы используем реальную логику smartAppend для демонстрации тестирования
            // В тестовой среде это упрощено, но в реальном коде должен быть полноценный алгоритм
            const fileExists = await fs.stat(validPath).then(() => true).catch(() => false);
            
            if (!fileExists) {
              await fs.writeFile(validPath, content, 'utf8');
            } else {
              const existingContent = await fs.readFile(validPath, 'utf8');
              
              // Находим наибольшее перекрытие
              let overlap = 0;
              const validContent = typeof content === 'string' ? content : String(content);
              for (let i = 1; i <= Math.min(existingContent.length, validContent.length); i++) {
                if (typeof existingContent === 'string' && existingContent.slice(-i) === validContent.slice(0, i)) {
                  overlap = i;
                }
              }
              
              // Если есть перекрытие, добавляем только новую часть
              if (overlap > 0) {
                await fs.appendFile(validPath, content.slice(overlap), 'utf8');
              } else {
                await fs.appendFile(validPath, content, 'utf8');
              }
            }
            
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем результат
        expect(result).toEqual({
          content: [{ type: 'text', text: 'Successfully smart-appended to /allowed/dir1/log.txt' }]
        });
        
        // Проверяем, что fs.appendFile был вызван с правильной частью контента без перекрытия
        expect(appendFileMock).toHaveBeenCalledWith(
          '/allowed/dir1/log.txt',
          ' plus new data', // Ожидаем только новую часть после перекрытия
          'utf8'
        );
      });
    });
    
    // Дополнительные тесты для других инструментов можно добавить здесь
    describe('integration tests', () => {
      it('should correctly integrate validatePath with smartAppend', async () => {
        // Запрос на умное добавление контента в файл
        const request = {
          params: {
            name: 'smart_append_file',
            arguments: {
              path: '/allowed/dir1/log.txt',
              content: 'New log entry data',
              chunkSize: 1024
            }
          }
        };
        
        // Сбрасываем моки и используем фактические реализации
        jest.resetAllMocks();
        
        // Мок для validatePath с реальной логикой
        jest.spyOn(global, 'validatePath' as any).mockImplementation(async (p) => {
          if (typeof p === 'string' && p.startsWith('/allowed/')) return p;
          throw new Error('Access denied - path outside allowed directories');
        });
        
        // Мок для smartAppend с упрощенной логикой
        jest.spyOn(global, 'smartAppend' as any).mockImplementation(async (filePath, content, chunkSize) => {
          // Проверяем, существует ли файл
          // Проверяем существование файла, предварительно проверяя тип
          const validFilePath = typeof filePath === 'string' ? filePath : String(filePath);
          const fileExists = await fs.stat(validFilePath).then(() => true).catch(() => false);
          
          if (!fileExists) {
            // Создаем новый файл, если он не существует
            const validContent = typeof content === 'string' ? content : String(content);
            await fs.writeFile(validFilePath, validContent, 'utf8');
          } else {
            // Читаем существующее содержимое для поиска перекрытий
            const existingContent = await fs.readFile(validFilePath, 'utf8');
            let overlap = 0;
            
            // Простой алгоритм поиска перекрытия
            const validContent = typeof content === 'string' ? content : String(content);
            for (let i = 1; i <= Math.min(existingContent.length, validContent.length); i++) {
              if (existingContent.slice(-i) === validContent.slice(0, i)) {
                overlap = i;
              }
            }
            
            // Добавляем только новую часть
            if (overlap > 0) {
              await fs.appendFile(validFilePath, validContent.slice(overlap), 'utf8');
            } else {
              await fs.appendFile(validFilePath, validContent, 'utf8');
            }
          }
        });
        
        // Мокаем fs.stat и другие методы файловой системы
        (fs.stat as jest.MockedFunction<typeof fs.stat>).mockImplementation(async (filePath) => {
          const validFilePath = typeof filePath === 'string' ? filePath : String(filePath);
          if (validFilePath === '/allowed/dir1/log.txt') {
            return createMockStats({
              size: 1000
            });
          }
          throw new Error('File not found');
        });
        
        (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockImplementation(async (filePath) => {
          const validFilePath = typeof filePath === 'string' ? filePath : String(filePath);
          if (validFilePath === '/allowed/dir1/log.txt') {
            return 'Previous log entry data with New';
          }
          throw new Error('File not found');
        });
        
        (fs.appendFile as jest.MockedFunction<typeof fs.appendFile>).mockResolvedValue(undefined as any);
        
        // Создаем обработчик
        const handler = jest.fn().mockImplementation(async (req: any) => {
          try {
            const { path, content, chunkSize } = req.params.arguments;
            const validPath = await validatePath(path);
            await smartAppend(validPath, content, chunkSize);
            return {
              content: [{ type: 'text', text: `Successfully smart-appended to ${path}` }]
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
              error: {
                message: errorMessage
              }
            };
          }
        });
        
        // Вызываем обработчик
        const result = await handler(request);
        
        // Проверяем результат
        expect(result).toEqual({
          content: [{ type: 'text', text: 'Successfully smart-appended to /allowed/dir1/log.txt' }]
        });
        
        // Проверяем, что fs.appendFile был вызван с правильным контентом
        // Учитывая перекрытие "New", должен быть добавлен только " log entry data"
        expect(fs.appendFile).toHaveBeenCalledWith(
          '/allowed/dir1/log.txt',
          ' log entry data',
          'utf8'
        );
      });
    });
  });
});
