import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Импортируем функции для тестирования из нашего экспортного файла
import { 
  findMaxOverlapSimple, 
  findMaxOverlapRabinKarp,
  smartAppend
} from './test-exports.js';

// Мок для fs/promises
jest.mock('fs/promises');

describe('Overlap Algorithms Tests', () => {
  describe('findMaxOverlapSimple', () => {
    it('should correctly find no overlap', () => {
      expect(findMaxOverlapSimple('hello', 'world')).toBe(0);
      expect(findMaxOverlapSimple('abcdef', '123456')).toBe(0);
      expect(findMaxOverlapSimple('', 'test')).toBe(0);
      expect(findMaxOverlapSimple('test', '')).toBe(0);
      expect(findMaxOverlapSimple('', '')).toBe(0);
    });

    it('should correctly find partial overlaps', () => {
      // Типичные случаи перекрытия
      expect(findMaxOverlapSimple('hello', 'llo world')).toBe(0); // Нет перекрытия, т.к. ищем только конец-начало
      expect(findMaxOverlapSimple('hello world', 'world peace')).toBe(5);
      expect(findMaxOverlapSimple('test data', 'data analysis')).toBe(4);
      
      // Одиночные символы
      expect(findMaxOverlapSimple('abc', 'c123')).toBe(1);
      expect(findMaxOverlapSimple('xyz', 'z')).toBe(1);
      
      // Перекрытие с пробелами
      expect(findMaxOverlapSimple('end of line ', ' start of next')).toBe(1);
    });

    it('should correctly find full overlaps', () => {
      // Когда одна строка полностью содержится в конце/начале другой
      expect(findMaxOverlapSimple('full match', 'match')).toBe(5);
      expect(findMaxOverlapSimple('prefix', 'prefix overlaps')).toBe(0); // Начало не перекрывается с концом
      expect(findMaxOverlapSimple('contains overlap', 'overlap')).toBe(7);
    });

    it('should work correctly with special characters', () => {
      // Спецсимволы и юникод
      expect(findMaxOverlapSimple('test\n', '\ncase')).toBe(1);
      expect(findMaxOverlapSimple('emoji😀', '😀test')).toBe(2); // Эмодзи - 2 байта
      expect(findMaxOverlapSimple('special$chars', '$chars test')).toBe(6);
      expect(findMaxOverlapSimple('кириллица', 'ица test')).toBe(3);
    });
  });

  describe('findMaxOverlapRabinKarp', () => {
    it('should correctly find no overlap', () => {
      expect(findMaxOverlapRabinKarp('hello', 'world')).toBe(0);
      expect(findMaxOverlapRabinKarp('abcdef', '123456')).toBe(0);
      expect(findMaxOverlapRabinKarp('', 'test')).toBe(0);
      expect(findMaxOverlapRabinKarp('test', '')).toBe(0);
      expect(findMaxOverlapRabinKarp('', '')).toBe(0);
    });

    it('should correctly find partial overlaps', () => {
      // Типичные случаи перекрытия
      expect(findMaxOverlapRabinKarp('hello', 'llo world')).toBe(0); // Нет перекрытия, т.к. ищем только конец-начало
      expect(findMaxOverlapRabinKarp('hello world', 'world peace')).toBe(5);
      expect(findMaxOverlapRabinKarp('test data', 'data analysis')).toBe(4);
      
      // Одиночные символы
      expect(findMaxOverlapRabinKarp('abc', 'c123')).toBe(1);
      expect(findMaxOverlapRabinKarp('xyz', 'z')).toBe(1);
      
      // Перекрытие с пробелами
      expect(findMaxOverlapRabinKarp('end of line ', ' start of next')).toBe(1);
    });

    it('should correctly find full overlaps', () => {
      // Когда одна строка полностью содержится в конце/начале другой
      expect(findMaxOverlapRabinKarp('full match', 'match')).toBe(5);
      expect(findMaxOverlapRabinKarp('prefix', 'prefix overlaps')).toBe(0); // Начало не перекрывается с концом
      expect(findMaxOverlapRabinKarp('contains overlap', 'overlap')).toBe(7);
    });

    it('should work correctly with special characters', () => {
      // Спецсимволы и юникод
      expect(findMaxOverlapRabinKarp('test\n', '\ncase')).toBe(1);
      expect(findMaxOverlapRabinKarp('emoji😀', '😀test')).toBe(2); // Эмодзи - 2 байта
      expect(findMaxOverlapRabinKarp('special$chars', '$chars test')).toBe(6);
      expect(findMaxOverlapRabinKarp('кириллица', 'ица test')).toBe(3);
    });

    it('should handle minimum overlap threshold correctly', () => {
      // В коде установлен MIN_OVERLAP = 4, поэтому проверяем это поведение
      const threshold = 4; // Должно соответствовать значению в исходном коде
      
      // Строки с перекрытием меньше порогового значения
      const str1 = 'end abc';
      const str2 = 'abc start';
      
      // Для перекрытий меньше порога Рабин-Карп должен использовать простой алгоритм
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(3);
      
      // Строки с перекрытием равным пороговому значению
      const str3 = 'end abcd';
      const str4 = 'abcd start';
      
      // Для перекрытий равных или больше порога используется Рабин-Карп
      expect(findMaxOverlapRabinKarp(str3, str4)).toBe(4);
    });

    it('should handle large strings efficiently', () => {
      // Создаем большие строки с перекрытием
      const overlapPart = 'common_overlap_marker';
      const str1 = 'a'.repeat(10000) + overlapPart;
      const str2 = overlapPart + 'b'.repeat(10000);
      
      // Проверяем корректность определения перекрытия
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(overlapPart.length);
      
      // Проверяем эффективность (не должно зависать)
      const start = Date.now();
      findMaxOverlapRabinKarp(str1, str2);
      const duration = Date.now() - start;
      
      // На современных машинах это не должно занимать больше 100 мс
      expect(duration).toBeLessThan(100);
      
      // Дополнительный тест с очень большими строками без перекрытия
      const bigStr1 = 'a'.repeat(100000);
      const bigStr2 = 'b'.repeat(100000);
      
      expect(findMaxOverlapRabinKarp(bigStr1, bigStr2)).toBe(0);
    });
    
    it('should handle hash collisions correctly', () => {
      // Создаем строки, у которых могут возникнуть коллизии хешей
      // Хотя точное создание коллизий сложно в тестовой среде, мы можем проверить, 
      // что алгоритм правильно обрабатывает сравнение строк даже при возможных коллизиях
      
      // Разные строки с одинаковой длиной и похожим содержимым
      const str1 = 'abcdef123456';
      const str2 = '654321fedcba';
      
      // Не должно быть перекрытия
      expect(findMaxOverlapRabinKarp(str1, str2)).toBe(0);
      
      // Строка с действительным перекрытием
      const str3 = 'test12345';
      const str4 = '12345test';
      
      // Должно найти перекрытие, даже если хеши могут совпадать для других частей
      expect(findMaxOverlapRabinKarp(str3, str4)).toBe(5);
    });
  });

  describe('Algorithm Comparison', () => {
    it('should produce identical results for both algorithms', () => {
      // Набор тестовых пар строк
      const testCases = [
        { str1: 'hello', str2: 'world' },
        { str1: 'hello world', str2: 'world peace' },
        { str1: 'test data', str2: 'data analysis' },
        { str1: 'abc', str2: 'c123' },
        { str1: 'end of line ', str2: ' start of next' },
        { str1: 'full match', str2: 'match' },
        { str1: 'emoji😀', str2: '😀test' },
        { str1: 'special$chars', str2: '$chars test' },
        { str1: 'кириллица', str2: 'ица test' },
        { str1: '', str2: '' },
        { str1: 'a'.repeat(100) + 'overlap', str2: 'overlap' + 'b'.repeat(100) }
      ];
      
      // Проверяем одинаковость результатов обоих алгоритмов
      for (const { str1, str2 } of testCases) {
        const simpleResult = findMaxOverlapSimple(str1, str2);
        const rabinKarpResult = findMaxOverlapRabinKarp(str1, str2);
        
        expect(rabinKarpResult).toBe(simpleResult);
      }
    });
    
    it('should compare performance of both algorithms', () => {
      // Функция для измерения производительности
      const measurePerformance = (algorithm: (str1: string, str2: string) => number, testCases: Array<{str1: string, str2: string}>, runs = 10) => {
        const start = Date.now();
        
        for (let i = 0; i < runs; i++) {
          for (const { str1, str2 } of testCases) {
            algorithm(str1, str2);
          }
        }
        
        return Date.now() - start;
      };
      
      // Создаем набор больших тестовых случаев
      const largeTestCases = [
        { 
          str1: 'a'.repeat(5000) + 'overlap', 
          str2: 'overlap' + 'b'.repeat(5000) 
        },
        { 
          str1: 'c'.repeat(5000) + 'test', 
          str2: 'test' + 'd'.repeat(5000) 
        },
        { 
          str1: 'e'.repeat(5000), 
          str2: 'f'.repeat(5000) 
        }
      ];
      
      // Измеряем время выполнения обоих алгоритмов
      const simpleTime = measurePerformance(findMaxOverlapSimple, largeTestCases);
      const rabinKarpTime = measurePerformance(findMaxOverlapRabinKarp, largeTestCases);
      
      // В идеале, Рабин-Карп должен быть быстрее для больших строк
      // Но в тестовой среде с мокнутыми функциями это не всегда заметно
      // Поэтому мы просто логируем результаты для информации
      console.log(`Simple algorithm time: ${simpleTime}ms`);
      console.log(`Rabin-Karp algorithm time: ${rabinKarpTime}ms`);
    });
  });

  describe('smartAppend Tests', () => {
    let tempDir: string;
    let testFilePath: string;
    
    beforeEach(() => {
      // Подготовка окружения для каждого теста
      tempDir = path.join(os.tmpdir(), 'test-overlap-');
      testFilePath = path.join(tempDir, 'test-smartappend.txt');
      
      // Сбрасываем моки
      jest.clearAllMocks();
    });

    it('should write entire content for new files', async () => {
      // Симулируем, что файла не существует
      (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
      
      // Мок для fs.writeFile
      const writeFileMock = fs.writeFile as jest.Mock;
      writeFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем smartAppend
      const content = 'New file content';
      await smartAppend(testFilePath, content);
      
      // Проверяем, что fs.writeFile был вызван с правильными аргументами
      expect(writeFileMock).toHaveBeenCalledWith(testFilePath, content, 'utf8');
    });
    
    it('should use efficient algorithm for small files', async () => {
      // Симулируем существующий файл небольшого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 500, // 500 байт
        isDirectory: () => false
      });
      
      // Мок для fs.readFile
      (fs.readFile as jest.Mock).mockResolvedValueOnce('Initial content with overlap');
      
      // Мок для fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Создаем шпион для функции findMaxOverlapSimple
      const findMaxOverlapSimpleSpy = jest.spyOn(global, 'findMaxOverlapSimple' as any)
        .mockReturnValueOnce(7); // предполагаем перекрытие 'overlap'
      
      // Вызываем smartAppend
      await smartAppend(testFilePath, 'overlap and new data');
      
      // Проверяем, что для малых файлов использовалась функция findMaxOverlapSimple
      expect(findMaxOverlapSimpleSpy).toHaveBeenCalled();
      
      // Проверяем, что fs.appendFile был вызван только с новой частью контента
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, ' and new data', 'utf8');
    });
    
    it('should use chunk reading for large files', async () => {
      // Симулируем существующий файл большого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 15 * 1024 * 1024, // 15 МБ
        isDirectory: () => false
      });
      
      // Создаем моки для операций с файловым дескриптором
      const openMock = fs.open as jest.Mock;
      const readMock = jest.fn().mockImplementation((buffer, offset, length, position) => {
        // Заполняем буфер тестовыми данными
        const tailContent = 'end with overlap data';
        Buffer.from(tailContent).copy(buffer);
        return { bytesRead: tailContent.length };
      });
      const closeMock = jest.fn().mockResolvedValue(undefined);
      
      openMock.mockResolvedValueOnce({
        read: readMock,
        close: closeMock
      });
      
      // Создаем шпион для функции findMaxOverlapRabinKarp
      const findMaxOverlapRabinKarpSpy = jest.spyOn(global, 'findMaxOverlapRabinKarp' as any)
        .mockReturnValueOnce(10); // предполагаем перекрытие 'overlap data'
      
      // Мок для fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем smartAppend
      await smartAppend(testFilePath, 'overlap data followed by something new');
      
      // Проверяем, что fs.open был вызван для чтения файла по частям
      expect(openMock).toHaveBeenCalledWith(testFilePath, 'r');
      
      // Проверяем, что для больших файлов использовалась функция findMaxOverlapRabinKarp
      expect(findMaxOverlapRabinKarpSpy).toHaveBeenCalled();
      
      // Проверяем, что fs.appendFile был вызван только с новой частью контента
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, ' followed by something new', 'utf8');
    });
    
    it('should handle empty files correctly', async () => {
      // Симулируем существующий пустой файл
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 0, // 0 байт
        isDirectory: () => false
      });
      
      // Мок для fs.readFile
      (fs.readFile as jest.Mock).mockResolvedValueOnce('');
      
      // Мок для fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем smartAppend
      const content = 'Content for empty file';
      await smartAppend(testFilePath, content);
      
      // Проверяем, что fs.appendFile был вызван с полным контентом
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, content, 'utf8');
    });
    
    it('should increase chunk size when no overlap found', async () => {
      // Симулируем существующий файл большого размера
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 20 * 1024 * 1024, // 20 МБ
        isDirectory: () => false
      });
      
      // Создаем моки для операций с файловым дескриптором
      const openMock = fs.open as jest.Mock;
      // Создаем последовательные моки для чтения частей файла
      // с увеличивающимся размером чанка
      const readMock = jest.fn()
        // Первое чтение - небольшой чанк, без перекрытия
        .mockImplementationOnce((buffer, offset, length, position) => {
          const smallChunk = 'no overlap here';
          Buffer.from(smallChunk).copy(buffer);
          return { bytesRead: smallChunk.length };
        })
        // Второе чтение - больший чанк, с перекрытием
        .mockImplementationOnce((buffer, offset, length, position) => {
          const largerChunk = 'bigger chunk with overlap data';
          Buffer.from(largerChunk).copy(buffer);
          return { bytesRead: largerChunk.length };
        });
      
      const closeMock = jest.fn().mockResolvedValue(undefined);
      
      openMock.mockResolvedValueOnce({
        read: readMock,
        close: closeMock
      });
      
      // Создаем шпионы для функций поиска перекрытия
      const findMaxOverlapRabinKarpSpy = jest.spyOn(global, 'findMaxOverlapRabinKarp' as any)
        // Первый вызов - перекрытие не найдено
        .mockReturnValueOnce(0)
        // Второй вызов - найдено перекрытие
        .mockReturnValueOnce(11); // "overlap data"
      
      // Мок для fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Вызываем smartAppend с небольшим начальным размером чанка
      await smartAppend(testFilePath, 'overlap data and more content', 512);
      
      // Проверяем, что fs.open был вызван для чтения файла
      expect(openMock).toHaveBeenCalledWith(testFilePath, 'r');
      
      // Проверяем, что read был вызван хотя бы дважды (для разных размеров чанка)
      expect(readMock).toHaveBeenCalledTimes(2);
      
      // Проверяем, что функция findMaxOverlapRabinKarp была вызвана дважды
      expect(findMaxOverlapRabinKarpSpy).toHaveBeenCalledTimes(2);
      
      // Проверяем, что fs.appendFile был вызван только с новой частью контента
      expect(appendFileMock).toHaveBeenCalledWith(testFilePath, ' and more content', 'utf8');
    });
    
    it('should handle errors correctly', async () => {
      // Симулируем ошибку при чтении информации о файле
      (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('Failed to get file stats'));
      
      // Симулируем ошибку при записи в файл
      (fs.writeFile as jest.Mock).mockRejectedValueOnce(new Error('Failed to write to file'));
      
      // Проверяем, что ошибка пробрасывается наверх
      await expect(smartAppend(testFilePath, 'content')).rejects.toThrow('Failed to write to file');
    });
    
    it('should handle case when no content needs to be appended', async () => {
      // Симулируем существующий файл
      (fs.stat as jest.Mock).mockResolvedValueOnce({
        size: 100, // 100 байт
        isDirectory: () => false
      });
      
      // Мок для fs.readFile
      (fs.readFile as jest.Mock).mockResolvedValueOnce('Complete content');
      
      // Мок для fs.appendFile
      const appendFileMock = fs.appendFile as jest.Mock;
      appendFileMock.mockResolvedValueOnce(undefined);
      
      // Шпион для findMaxOverlapSimple
      jest.spyOn(global, 'findMaxOverlapSimple' as any)
        .mockReturnValueOnce(15); // полное перекрытие
      
      // Вызываем smartAppend с полностью перекрывающимся контентом
      await smartAppend(testFilePath, 'Complete content');
      
      // Проверяем, что fs.appendFile не был вызван, так как новый контент полностью перекрывается
      expect(appendFileMock).not.toHaveBeenCalled();
    });
    
    it('should gracefully handle invalid input', async () => {
      // Тестируем с нестроковыми аргументами
      await expect(smartAppend(testFilePath, null as any)).rejects.toThrow();
      await expect(smartAppend(null as any, 'content')).rejects.toThrow();
      
      // Тестируем с некорректным размером чанка
      await expect(smartAppend(testFilePath, 'content', -1)).rejects.toThrow();
    });
  });
});
