/**
 * Модуль обнаружения неполных ответов от LLM (Language Learning Models)
 * с помощью маркера завершения контента.
 * 
 * @module content-completion-marker
 */

// Экспортируем интерфейс для конфигурации
export interface ContentCompletionConfig {
  /** Маркер завершения контента для проверки полноты ответа */
  CONTENT_COMPLETION_MARKER: string;
  /** Порог размера для определения больших файлов (в байтах) */
  LARGE_CONTENT_THRESHOLD: number;
  /** Расширения файлов, которые считаются бинарными */
  BINARY_CONTENT_EXTENSIONS: string[];
  /** Включение/отключение отладочных сообщений */
  DEBUG: boolean;
}

// Конфигурация по умолчанию
export const DEFAULT_CONFIG: ContentCompletionConfig = {
  CONTENT_COMPLETION_MARKER: '// END_OF_CONTENT',
  LARGE_CONTENT_THRESHOLD: 100000, // 100KB
  BINARY_CONTENT_EXTENSIONS: ['.bin', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.7z', '.tar', '.gz'],
  DEBUG: false
};

/**
 * Определяет, является ли контент полным на основе наличия маркера завершения
 * @param content Контент для проверки
 * @param config Конфигурация с маркером завершения
 * @returns true, если контент содержит маркер завершения или является бинарным
 */
export function isContentComplete(
  content: string | Buffer, 
  config: ContentCompletionConfig = DEFAULT_CONFIG
): boolean {
  // Бинарный контент всегда считается полным
  if (typeof content !== 'string') {
    return true;
  }
  
  // Проверяем наличие маркера завершения в текстовом контенте
  return content.trim().endsWith(config.CONTENT_COMPLETION_MARKER);
}

/**
 * Удаляет маркер завершения из контента
 * @param content Контент для очистки
 * @param config Конфигурация с маркером завершения
 * @returns Контент без маркера завершения
 */
export function removeCompletionMarker(
  content: string | Buffer, 
  config: ContentCompletionConfig = DEFAULT_CONFIG
): string | Buffer {
  // Для бинарного контента ничего не делаем
  if (typeof content !== 'string') {
    return content;
  }
  
  // Для текстового контента удаляем маркер с конца
  return content.replace(new RegExp(`${config.CONTENT_COMPLETION_MARKER}\\s*$`), '');
}

// Интерфейс для параметров определения метода записи
export interface WriteMethodOptions {
  /** Путь к файлу */
  path: string;
  /** Контент для записи */
  content: string | Buffer;
  /** Существует ли файл уже */
  fileExists?: boolean;
  /** Размер существующего файла */
  fileSize?: number;
  /** Запрошенный метод записи (если указан пользователем) */
  requestedFunction?: string;
  /** Полная перезапись файла */
  isFullRewrite?: boolean;
  /** Конфигурация */
  config?: ContentCompletionConfig;
}

/**
 * Определяет оптимальную функцию для записи файла
 * на основе анализа параметров и наличия маркера завершения
 * 
 * @param options Параметры для определения метода записи
 * @returns Название оптимального метода: 'write_file' или 'smart_append_file'
 */
export function determineOptimalWriteMethod(
  options: WriteMethodOptions
): 'write_file' | 'smart_append_file' {
  const { 
    path, 
    content, 
    fileExists = false, 
    requestedFunction,
    isFullRewrite = false,
    config = DEFAULT_CONFIG 
  } = options;

  // Функция логирования
  const debug = (message: string) => {
    if (config.DEBUG) {
      console.log(`[DEBUG] ${message}`);
    }
  };

  // Для явного запроса полной перезаписи используем write_file
  if (isFullRewrite === true) {
    debug(`Full rewrite requested for ${path}. Using write_file.`);
    return 'write_file';
  }

  // Проверяем наличие маркера завершения для текстового контента
  if (typeof content === 'string') {
    const complete = isContentComplete(content, config);
    if (!complete) {
      debug(`Content for ${path} appears to be incomplete (missing END_OF_CONTENT marker). Using smart_append_file.`);
      return 'smart_append_file';
    }
  }

  // Определяем размер контента
  const contentSize = typeof content === 'string' ? content.length : content.byteLength;

  // Для больших объемов данных всегда предпочитаем smart_append_file
  if (contentSize > config.LARGE_CONTENT_THRESHOLD) {
    debug(`Large content detected (${contentSize} bytes). Using smart_append_file for ${path}`);
    return 'smart_append_file';
  }

  // Если файл существует и контент не полный, используем smart_append_file
  if (fileExists) {
    // Если при этом запрошена полная перезапись, уважаем этот запрос
    if (requestedFunction === 'write_file') {
      debug(`File ${path} exists, but write_file explicitly requested.`);
      return 'write_file';
    }
    
    debug(`File ${path} exists. Using smart_append_file for safety.`);
    return 'smart_append_file';
  }

  // Для новых файлов по умолчанию используем write_file
  debug(`Using default write_file for ${path}.`);
  return 'write_file';
}

/**
 * Модифицированные параметры для интеграции с функцией performOptimizedWrite
 */
export interface ModifiedWriteOptions {
  path: string;
  content: string | Buffer;
  fileExists?: boolean;
  fileSize?: number;
  requestedFunction?: 'write_file' | 'smart_append_file';
  isFullRewrite?: boolean;
  config?: ContentCompletionConfig;
}

/**
 * Подготавливает параметры для записи с учетом маркера завершения
 * @param options Исходные параметры записи
 * @returns Модифицированные параметры с учетом маркера завершения
 */
export function prepareWriteOperation(
  options: ModifiedWriteOptions
): ModifiedWriteOptions {
  const { 
    path, 
    content, 
    fileExists = false, 
    fileSize = 0,
    requestedFunction,
    isFullRewrite = false,
    config = DEFAULT_CONFIG 
  } = options;

  // Определяем оптимальный метод записи
  const optimalMethod = determineOptimalWriteMethod({
    path,
    content,
    fileExists,
    fileSize,
    requestedFunction,
    isFullRewrite,
    config
  });

  // Удаляем маркер завершения из контента
  const cleanedContent = typeof content === 'string' ? 
    removeCompletionMarker(content, config) : 
    content;

  // Возвращаем модифицированные параметры
  return {
    path,
    content: cleanedContent,
    fileExists,
    fileSize,
    requestedFunction: optimalMethod,
    isFullRewrite,
    config
  };
}
