/**
 * Модуль интеграции функциональности маркера завершения
 * в основной код MCP Filesystem Server.
 * 
 * @module content-completion-integration
 */

import * as fs from 'fs/promises';
import path from 'path';
import { 
  ContentCompletionConfig,
  DEFAULT_CONFIG,
  prepareWriteOperation
} from './content-completion-marker';

/**
 * Расширенные опции для функции записи файла
 * с поддержкой маркера завершения
 */
export interface EnhancedWriteOptions {
  /** Путь к файлу */
  path: string;
  /** Содержимое для записи */
  content: string | Buffer;
  /** Существует ли файл */
  fileExists?: boolean;
  /** Размер файла */
  fileSize?: number;
  /** Метод записи, запрошенный пользователем */
  requestedFunction?: 'write_file' | 'append_file' | 'smart_append_file';
  /** Флаг полной перезаписи */
  isFullRewrite?: boolean;
  /** Конфигурация модуля маркера завершения */
  contentCompletionConfig?: ContentCompletionConfig;
}

// Объявляем функцию smartAppend для ее использования в модуле
// Эта функция определена в основном модуле index.ts
declare function smartAppend(filePath: string, content: string, initialChunkSize?: number): Promise<void>;

/**
 * Модифицированная версия функции performOptimizedWrite с поддержкой маркера завершения
 * 
 * @param options Параметры записи
 * @returns Результат операции в формате ответа API
 */
export async function enhancedPerformOptimizedWrite(options: EnhancedWriteOptions): Promise<any> {
  // Распаковываем параметры с значениями по умолчанию
  const { 
    path: filePath, 
    content, 
    fileExists: initialFileExists, 
    fileSize: initialFileSize = 0,
    requestedFunction, 
    isFullRewrite = false,
    contentCompletionConfig = DEFAULT_CONFIG
  } = options;

  // Проверяем существование файла и получаем его размер, если файл существует
  let fileExists = initialFileExists;
  let fileSize = initialFileSize;
  
  // Если информация о существовании файла не предоставлена, проверяем
  if (fileExists === undefined) {
    try {
      const stats = await fs.stat(filePath);
      fileExists = true;
      fileSize = stats.size;
    } catch {
      fileExists = false;
      fileSize = 0;
    }
  }
  
  // Подготавливаем параметры с учетом маркера завершения
  const preparedOptions = prepareWriteOperation({
    path: filePath,
    content,
    fileExists,
    fileSize,
    requestedFunction: requestedFunction as any, // type cast для совместимости
    isFullRewrite,
    config: contentCompletionConfig
  });
  
  // Получаем очищенный контент и оптимальную функцию
  const cleanedContent = preparedOptions.content;
  const optimalFunction = preparedOptions.requestedFunction;
  
  // Выполняем запись с помощью выбранной функции
  try {
    // Вызываем соответствующую функцию записи файла
    switch (optimalFunction) {
      case 'write_file':
        if (typeof cleanedContent === 'string') {
          await fs.writeFile(filePath, cleanedContent, "utf-8");
        } else {
          await fs.writeFile(filePath, cleanedContent);
        }
        break;
        
      case 'smart_append_file':
        // Вызываем функцию smartAppend из основного модуля
        if (typeof cleanedContent === 'string') {
          // smartAppend определена в index.ts и доступна в глобальном контексте
          // Однако при компиляции TypeScript необходимо объявить ее интерфейс выше
          // Передаем в нее путь к файлу и очищенный контент
          await (global as any).smartAppend(filePath, cleanedContent);
        } else {
          // Для бинарных данных не можем использовать smart_append, просто записываем
          await fs.writeFile(filePath, cleanedContent);
        }
        break;
    }
    
    // Формируем информативное сообщение
    let message = `Successfully wrote to ${filePath}`;
    
    // Если функция отличается от запрошенной, добавляем информацию о выборе
    if (requestedFunction && requestedFunction !== optimalFunction) {
      message += ` (automatically used ${optimalFunction} for optimal performance)`;
    }
    
    // Если обнаружен неполный контент, добавляем информацию об этом
    if (typeof content === 'string' && 
        !content.trim().endsWith(contentCompletionConfig.CONTENT_COMPLETION_MARKER)) {
      message += ` (detected incomplete content)`;
    }
    
    return {
      content: [{ type: "text", text: message }],
      optimizedWrite: true,
      usedFunction: optimalFunction
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error during optimized write to ${filePath}: ${errorMessage}`);
    throw new Error(`Failed to write file: ${errorMessage}`);
  }
}
