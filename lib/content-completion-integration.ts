/**
 * Модуль интеграции функциональности маркера завершения
 * в основной код MCP Filesystem Server.
 * 
 * @module content-completion-integration
 */

import * as fs from 'fs/promises';
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

/**
 * Модифицированная версия функции performOptimizedWrite с поддержкой маркера завершения
 * 
 * Вставьте эту функцию в файл index.ts, заменив существующую функцию performOptimizedWrite,
 * или создайте новую функцию и вызывайте ее из существующей.
 * 
 * @param options Параметры записи
 * @returns Результат операции в формате ответа API
 */
export async function enhancedPerformOptimizedWrite(options: EnhancedWriteOptions): Promise<any> {
  // Распаковываем параметры с значениями по умолчанию
  const { 
    path, 
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
      const stats = await fs.stat(path);
      fileExists = true;
      fileSize = stats.size;
    } catch {
      fileExists = false;
      fileSize = 0;
    }
  }
  
  // Подготавливаем параметры с учетом маркера завершения
  const preparedOptions = prepareWriteOperation({
    path,
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
    // Примечание: здесь нужно использовать реальные функции записи из вашего кода
    switch (optimalFunction) {
      case 'write_file':
        await fs.writeFile(path, cleanedContent, "utf-8");
        break;
        
      case 'smart_append_file':
        // Здесь нужно вызвать вашу функцию smartAppend
        // await smartAppend(path, cleanedContent.toString());
        
        // Временная реализация, замените на вызов реальной функции
        if (typeof cleanedContent === 'string') {
          // Если файл не существует, создаем его
          if (!fileExists) {
            await fs.writeFile(path, cleanedContent, "utf-8");
          } else {
            // Если файл существует, дописываем в него
            const fileHandle = await fs.open(path, 'a');
            await fileHandle.writeFile(cleanedContent, "utf-8");
            await fileHandle.close();
          }
        } else {
          // Для бинарных данных просто записываем
          await fs.writeFile(path, cleanedContent);
        }
        break;
    }
    
    // Формируем информативное сообщение
    let message = `Successfully wrote to ${path}`;
    
    // Если функция отличается от запрошенной, добавляем информацию о выборе
    if (requestedFunction && requestedFunction !== optimalFunction) {
      message += ` (automatically used ${optimalFunction} for optimal performance)`;
    }
    
    // Если обнаружен неполный контент, добавляем информацию об этом
    if (typeof content === 'string' && 
        !content.trim().endsWith(contentCompletionConfig.CONTENT_COMPLETION_MARKER)) {
      message += ` (detected incomplete content, removed completion marker)`;
    }
    
    return {
      content: [{ type: "text", text: message }],
      optimizedWrite: true,
      usedFunction: optimalFunction
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error during optimized write to ${path}: ${errorMessage}`);
    throw new Error(`Failed to write file: ${errorMessage}`);
  }
}

/**
 * Инструкции по интеграции
 * 
 * Для интеграции функциональности маркера завершения в существующий код MCP Filesystem Server:
 * 
 * 1. Импортируйте модули в файле index.ts:
 *    import { ContentCompletionConfig, DEFAULT_CONFIG } from './lib/content-completion-marker';
 *    import { enhancedPerformOptimizedWrite } from './lib/content-completion-integration';
 * 
 * 2. Добавьте конфигурацию маркера завершения в общую конфигурацию:
 *    const config = {
 *      // Существующие настройки...
 *      
 *      // Настройки маркера завершения
 *      CONTENT_COMPLETION_MARKER: '// END_OF_CONTENT',
 *      LARGE_CONTENT_THRESHOLD: 100000, // 100KB
 *      BINARY_CONTENT_EXTENSIONS: ['.bin', '.pdf', ... и другие расширения ...],
 *    };
 * 
 * 3. Модифицируйте функцию performOptimizedWrite для использования улучшенной версии:
 *    async function performOptimizedWrite(options) {
 *      // Создаем параметры для улучшенной функции
 *      const enhancedOptions = {
 *        ...options,
 *        contentCompletionConfig: {
 *          CONTENT_COMPLETION_MARKER: config.CONTENT_COMPLETION_MARKER,
 *          LARGE_CONTENT_THRESHOLD: config.LARGE_CONTENT_THRESHOLD,
 *          BINARY_CONTENT_EXTENSIONS: config.BINARY_CONTENT_EXTENSIONS,
 *          DEBUG: config.DEBUG || false
 *        }
 *      };
 *      
 *      // Вызываем улучшенную функцию
 *      return await enhancedPerformOptimizedWrite(enhancedOptions);
 *    }
 * 
 * 4. Альтернативно, можно полностью заменить функцию performOptimizedWrite на содержимое
 *    функции enhancedPerformOptimizedWrite, адаптировав ее под существующий код.
 */
