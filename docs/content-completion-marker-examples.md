imizedWrite(options) {
  // Создаем параметры для улучшенной функции с поддержкой маркера завершения
  const enhancedOptions = {
    ...options,
    contentCompletionConfig: {
      CONTENT_COMPLETION_MARKER: config.CONTENT_COMPLETION_MARKER,
      LARGE_CONTENT_THRESHOLD: config.LARGE_CONTENT_THRESHOLD,
      BINARY_CONTENT_EXTENSIONS: config.BINARY_CONTENT_EXTENSIONS,
      DEBUG: config.DEBUG || false
    }
  };
  
  // Вызываем улучшенную функцию
  return await enhancedPerformOptimizedWrite(enhancedOptions);
}

// Обработчик write_file
server.setRequestHandler("write_file", async (params) => {
  const { path, content } = params;
  
  try {
    // Валидация пути
    const validPath = await validatePath(path);
    
    // Если включена автоматическая оптимизация, используем оптимизированную запись
    if (config.autoOptimizeWriteOperations) {
      return await performOptimizedWrite({
        path: validPath,
        content,
        requestedFunction: 'write_file',
        isFullRewrite: true
      });
    }
    
    // Стандартное поведение, если оптимизация отключена
    await fs.writeFile(validPath, content, "utf-8");
    return {
      status: 'success',
      message: `Successfully wrote to ${path}`
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to write file: ${error.message}`
    };
  }
});
```

### Альтернативная интеграция (замена функции целиком)

```typescript
/**
 * Выполняет операцию записи файла с помощью оптимальной функции
 * с поддержкой маркера завершения
 * 
 * @param options Параметры операции записи
 * @returns Результат операции в формате ответа API
 */
async function performOptimizedWrite(options) {
  // Распаковываем параметры
  const { path, content, requestedFunction, isFullRewrite = false } = options;
  
  // Проверяем существование файла и получаем его размер
  let fileExists = options.fileExists;
  let fileSize = options.fileSize || 0;
  
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
  
  // Обновляем параметры
  options.fileExists = fileExists;
  options.fileSize = fileSize;
  
  // Проверяем наличие маркера завершения
  const isComplete = isContentComplete(content);
  
  // Определяем оптимальную функцию для записи
  let optimalFunction = requestedFunction;
  
  // Если контент не полный, используем smart_append_file
  if (!isComplete && typeof content === 'string') {
    log('info', `Content for ${path} appears to be incomplete (missing END_OF_CONTENT marker). Using smart_append_file.`);
    optimalFunction = 'smart_append_file';
  } 
  // Для больших файлов также предпочтительнее smart_append_file
  else if (typeof content === 'string' && content.length > config.LARGE_CONTENT_THRESHOLD) {
    log('info', `Large content detected (${content.length} chars). Using smart_append_file for ${path}`);
    optimalFunction = 'smart_append_file';
  }
  // Если файл существует и не запрошена явная перезапись, используем smart_append_file
  else if (fileExists && !isFullRewrite && requestedFunction !== 'write_file') {
    log('info', `File ${path} exists. Using smart_append_file for safety.`);
    optimalFunction = 'smart_append_file';
  }
  // В остальных случаях используем write_file
  else {
    optimalFunction = 'write_file';
  }
  
  // Удаляем маркер завершения из текстового контента
  const cleanContent = typeof content === 'string' 
    ? removeCompletionMarker(content) 
    : content;
  
  // Выполняем запись с помощью выбранной функции
  try {
    switch (optimalFunction) {
      case 'write_file':
        await fs.writeFile(path, cleanContent, "utf-8");
        break;
        
      case 'append_file':
        const fileHandle = await fs.open(path, 'a+');
        await fileHandle.writeFile(cleanContent, "utf-8");
        await fileHandle.close();
        break;
        
      case 'smart_append_file':
        await smartAppend(path, cleanContent.toString());
        break;
    }
    
    // Обновляем оценку оставшихся токенов
    if (typeof content === 'string' && config.tokenEstimationEnabled) {
      updateTokenEstimation(content.length);
    }
    
    // Формируем информативное сообщение
    let message = `Successfully wrote to ${path}`;
    
    // Если функция отличается от запрошенной, добавляем информацию о выборе
    if (requestedFunction && requestedFunction !== optimalFunction) {
      message += ` (automatically used ${optimalFunction} for optimal performance)`;
    }
    
    // Если обнаружен неполный контент, добавляем информацию об этом
    if (!isComplete && typeof content === 'string') {
      message += ` (detected incomplete content, missing completion marker)`;
    }
    
    return {
      content: [{ type: "text", text: message }],
      optimizedWrite: true,
      usedFunction: optimalFunction
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Error during optimized write to ${path}: ${errorMessage}`);
    throw new Error(`Failed to write file: ${errorMessage}`);
  }
}

// Вспомогательные функции для работы с маркером завершения

/**
 * Определяет, является ли контент полным на основе наличия маркера завершения
 * @param content Контент для проверки
 * @returns true, если контент содержит маркер завершения или является бинарным
 */
function isContentComplete(content) {
  if (typeof content !== 'string') {
    return true; // Бинарный контент всегда считается полным
  }
  
  return content.trim().endsWith(config.CONTENT_COMPLETION_MARKER);
}

/**
 * Удаляет маркер завершения из контента
 * @param content Контент для очистки
 * @returns Контент без маркера завершения
 */
function removeCompletionMarker(content) {
  if (typeof content !== 'string') {
    return content;
  }
  
  return content.replace(new RegExp(`${config.CONTENT_COMPLETION_MARKER}\\s*$`), '');
}
```

## Примеры использования для языковых моделей

### Генерация документации с маркером завершения

```typescript
// Запрос пользователя: "Создай документацию по проекту в файле docs/project-overview.md"

// Ответ языковой модели:
write_file({
  path: "docs/project-overview.md",
  content: `# Обзор проекта

## Введение

Этот проект представляет собой систему управления файлами для Language Learning Models (LLM),
предоставляющую безопасный доступ к файловой системе через набор инструментов.

## Ключевые компоненты

- **Server** - основной компонент, обрабатывающий запросы
- **File Operations** - набор функций для работы с файлами
- **Security Layer** - компонент, обеспечивающий безопасность доступа

## Архитектура

Система построена на модульной архитектуре, что обеспечивает легкость расширения и поддержки.

// END_OF_CONTENT`
});
```

### Генерация кода с маркером завершения

```typescript
// Запрос пользователя: "Напиши утилиту для форматирования дат"

// Ответ языковой модели:
write_file({
  path: "utils/date-formatter.js",
  content: `/**
 * Утилиты для форматирования дат
 */

/**
 * Форматирует дату в читаемый формат
 * @param {Date} date - Дата для форматирования
 * @param {string} format - Формат (short, medium, long)
 * @returns {string} Отформатированная дата
 */
function formatDate(date, format = 'medium') {
  const options = {
    short: { year: 'numeric', month: 'numeric', day: 'numeric' },
    medium: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  };
  
  return new Date(date).toLocaleDateString('ru-RU', options[format]);
}

module.exports = {
  formatDate
};

// END_OF_CONTENT`
});
```

### Обработка ошибок и неполных ответов

#### Сценарий 1: Ответ обрезан из-за лимита токенов

```typescript
// Запрос пользователя: "Напиши большой текст о преимуществах машинного обучения"

// Ответ языковой модели (обрезан из-за лимита токенов):
write_file({
  path: "articles/machine-learning-benefits.md",
  content: `# Преимущества машинного обучения

## Введение

Машинное обучение (Machine Learning, ML) - это область искусственного интеллекта,
которая фокусируется на разработке алгоритмов, позволяющих компьютерам обучаться
на основе данных без явного программирования.

## Основные преимущества

### 1. Автоматизация рутинных задач

Машинное обучение позволяет автоматизировать множество рутинных задач, которые 
ранее требовали человеческого участия. Это включает в себя:

- Обработку и классификацию документов
- Фильтрацию спама и нежелательного контента
- Рутинную аналитику данных
- Мониторинг систем и обнаружение аномалий

### 2. Обработка больших объемов данных

Современные алгоритмы машинного обучения способны обрабатывать огромные массивы 
данных, извлекая из них полезные инсайты, которые человек может не заметить.
Это особенно важно в эпоху Big Data, когда объемы доступной информации постоянно
растут.`
});

// Система обнаружит отсутствие маркера завершения и автоматически использует smart_append_file
// В следующий раз пользователь может продолжить генерацию с того места, где она была прервана

// Запрос пользователя: "Продолжи статью о преимуществах машинного обучения"

// Ответ языковой модели (продолжение):
smart_append_file({
  path: "articles/machine-learning-benefits.md",
  content: `

### 3. Персонализация пользовательского опыта

Машинное обучение позволяет создавать персонализированные рекомендации и адаптировать
контент под конкретного пользователя на основе его предпочтений и поведения:

- Рекомендательные системы для контента и товаров
- Персонализированная реклама
- Адаптивные интерфейсы
- Индивидуальная настройка сервисов

### 4. Предиктивный анализ

Одно из самых ценных применений машинного обучения - способность предсказывать
будущие события и тренды на основе исторических данных:

- Прогнозирование спроса и продаж
- Предсказание отказов оборудования
- Анализ финансовых рисков
- Медицинская диагностика и прогнозирование

## Заключение

Машинное обучение становится неотъемлемой частью современного технологического
ландшафта, предоставляя беспрецедентные возможности для бизнеса, науки и общества
в целом.

// END_OF_CONTENT`
});
```

#### Сценарий 2: Ответ завершен с маркером

```typescript
// Запрос пользователя: "Напиши короткий скрипт для вычисления факториала"

// Ответ языковой модели (полный ответ с маркером):
write_file({
  path: "utils/factorial.js",
  content: `/**
 * Вычисляет факториал числа
 * @param {number} n - Неотрицательное целое число
 * @returns {number} Факториал числа n
 */
function factorial(n) {
  if (n < 0) {
    throw new Error('Факториал определен только для неотрицательных чисел');
  }
  
  if (n === 0 || n === 1) {
    return 1;
  }
  
  return n * factorial(n - 1);
}

module.exports = { factorial };

// END_OF_CONTENT`
});

// Система обнаружит маркер завершения, удалит его и запишет файл с помощью write_file
```

## Автоматическое определение метода для различных сценариев

### Сценарий 1: Новый небольшой файл с маркером завершения

```typescript
write_file({
  path: "new-small-file.txt",
  content: "Это небольшой файл с маркером завершения.\n// END_OF_CONTENT"
});
// Результат: Используется write_file, так как файл небольшой и содержит маркер завершения
```

### Сценарий 2: Большой файл с маркером завершения

```typescript
write_file({
  path: "large-file.txt",
  content: "Очень большой текст... (более 100KB)\n// END_OF_CONTENT"
});
// Результат: Автоматически используется smart_append_file из-за большого размера
```

### Сценарий 3: Файл без маркера завершения

```typescript
write_file({
  path: "incomplete-file.txt",
  content: "Файл без маркера завершения, возможно, обрезанный контент..."
});
// Результат: Автоматически используется smart_append_file из-за отсутствия маркера
```

### Сценарий 4: Существующий файл с новым контентом

```typescript
write_file({
  path: "existing-file.txt", // Файл уже существует
  content: "Новый контент для существующего файла.\n// END_OF_CONTENT"
});
// Результат: По умолчанию используется smart_append_file для безопасности, 
// но если явно запрошен write_file, он будет использован
```

### Сценарий 5: Бинарный контент

```typescript
write_file({
  path: "binary-file.pdf",
  content: binaryBuffer // Бинарные данные
});
// Результат: Используется write_file, маркер завершения не требуется для бинарных файлов
```

## Заключение

Использование маркера завершения - это простой и эффективный способ повысить надежность записи файлов при работе с языковыми моделями. Система автоматически определяет оптимальный метод записи на основе контекста операции, что делает взаимодействие с MCP Filesystem Server более предсказуемым и безопасным.

// END_OF_CONTENT