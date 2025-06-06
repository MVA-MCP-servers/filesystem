# Инструкции для языковых моделей по использованию маркера завершения

Это руководство содержит инструкции для языковых моделей (Claude и других LLM) по правильному использованию маркера завершения контента при работе с MCP Filesystem Server.

## Основное правило

При генерации любого текстового контента для записи в файловую систему MCP, **всегда добавляйте маркер завершения в конец контента**:

```
// END_OF_CONTENT
```

Маркер должен быть:
- Добавлен на отдельной строке
- В самом конце текстового контента (последняя строка)
- Точно в таком формате, как указано выше

## Почему это важно

- Маркер завершения позволяет системе определить, был ли ответ обрезан из-за ограничений токенов
- Если маркер отсутствует, система автоматически переключается на безопасный режим дописывания
- Это предотвращает потерю данных при обрезании ответов и обеспечивает корректную обработку контента

## Примеры правильного использования

### Markdown-документ

```markdown
# Заголовок документа

Содержание документа с разными параграфами.

## Подзаголовок

- Список элементов
- Второй элемент

// END_OF_CONTENT
```

### JavaScript/TypeScript-код

```javascript
function example() {
  console.log('Это пример кода');
  return true;
}

// Вызов функции
example();

// END_OF_CONTENT
```

### Простой текстовый файл

```
Это простой текстовый файл.
Он содержит несколько строк текста.

// END_OF_CONTENT
```

## Особые случаи

### Бинарные файлы

Для бинарных файлов (PDF, изображения, архивы и т.д.) маркер завершения **не требуется**. 
Система автоматически определяет бинарные файлы по расширению или типу содержимого.

### Большие файлы

Для больших текстовых файлов (более 100KB) маркер завершения **обязателен**. 
Если контент генерируется по частям, то маркер нужен только в последней части.

### Прерывание генерации

Если генерация контента может быть прервана (например, из-за достижения лимита токенов):

1. Старайтесь добавить маркер завершения как можно раньше, если вы видите, что приближаетесь к лимиту токенов
2. Если вы не успеваете добавить маркер, система автоматически обнаружит незавершенный ответ
3. В следующем запросе можно будет продолжить добавление контента к файлу

### Запрос определенного метода записи

Если пользователь явно запрашивает использование конкретного метода записи (`write_file` или `smart_append_file`), 
этот запрос имеет приоритет над автоматическим определением.

## Алгоритм обработки маркера завершения

1. Языковая модель добавляет маркер завершения в конец генерируемого контента
2. При вызове функции записи система проверяет наличие маркера
3. Если маркер отсутствует, система использует `smart_append_file` вместо `write_file`
4. Если маркер присутствует, система удаляет его перед записью файла
5. Система возвращает информацию о выбранном методе записи

## Рекомендуемая последовательность действий

1. Сгенерируйте запрошенный контент как обычно
2. Добавьте маркер `// END_OF_CONTENT` на отдельной строке в конце
3. Используйте стандартные методы записи файлов (`write_file`, `append_file`, `smart_append_file`)
4. Система автоматически обработает маркер и выберет оптимальный метод записи

## Примеры API-вызовов

### Запись нового файла

```javascript
write_file({
  path: "/path/to/file.txt",
  content: "Это содержимое файла.\n// END_OF_CONTENT"
});
```

### Дописывание к существующему файлу

```javascript
append_file({
  path: "/path/to/file.txt",
  content: "Это дополнительный контент.\n// END_OF_CONTENT"
});
```

### Умное дописывание

```javascript
smart_append_file({
  path: "/path/to/file.txt",
  content: "Это контент с защитой от дублирования.\n// END_OF_CONTENT"
});
```

## Заключение

Добавление маркера завершения - это простая, но важная практика, которая значительно повышает надежность записи файлов при работе с LLM.

Следуя этим инструкциям, вы помогаете обеспечить корректную обработку контента даже в случаях, когда генерация может быть прервана из-за ограничений токенов.

// END_OF_CONTENT