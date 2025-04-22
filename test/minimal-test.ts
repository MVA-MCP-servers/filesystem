/**
 * Минимальный тестовый файл для проверки алгоритмов перекрытия
 */

// Функция для поиска максимального перекрытия конца первой строки и начала второй
function findMaxOverlap(str1: string, str2: string): number {
  const maxPossibleOverlap = Math.min(str1.length, str2.length);
  for (let len = maxPossibleOverlap; len > 0; len--) {
    if (str1.slice(-len) === str2.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

// Проверки
console.log('Тест алгоритма поиска перекрытия:');
console.log('---------------------------------');

// Тест 1: Нет перекрытия
const test1_str1 = 'hello';
const test1_str2 = 'world';
const test1_result = findMaxOverlap(test1_str1, test1_str2);
console.log(`Тест 1: '${test1_str1}' и '${test1_str2}' -> перекрытие: ${test1_result}`);
console.log(`Ожидаемый результат: 0`);
console.log(`Тест ${test1_result === 0 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 2: Полное перекрытие
const test2_str1 = 'testing';
const test2_str2 = 'testing123';
const test2_result = findMaxOverlap(test2_str1, test2_str2);
console.log(`Тест 2: '${test2_str1}' и '${test2_str2}' -> перекрытие: ${test2_result}`);
console.log(`Ожидаемый результат: 7`);
console.log(`Тест ${test2_result === 7 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 3: Частичное перекрытие
const test3_str1 = 'hello world';
const test3_str2 = 'world peace';
const test3_result = findMaxOverlap(test3_str1, test3_str2);
console.log(`Тест 3: '${test3_str1}' и '${test3_str2}' -> перекрытие: ${test3_result}`);
console.log(`Ожидаемый результат: 5`);
console.log(`Тест ${test3_result === 5 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 4: Пустые строки
const test4_str1 = '';
const test4_str2 = '';
const test4_result = findMaxOverlap(test4_str1, test4_str2);
console.log(`Тест 4: '${test4_str1}' и '${test4_str2}' -> перекрытие: ${test4_result}`);
console.log(`Ожидаемый результат: 0`);
console.log(`Тест ${test4_result === 0 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 5: Одна пустая строка
const test5_str1 = 'hello';
const test5_str2 = '';
const test5_result = findMaxOverlap(test5_str1, test5_str2);
console.log(`Тест 5: '${test5_str1}' и '${test5_str2}' -> перекрытие: ${test5_result}`);
console.log(`Ожидаемый результат: 0`);
console.log(`Тест ${test5_result === 0 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 6: Специальные символы
const test6_str1 = 'special$chars';
const test6_str2 = '$chars test';
const test6_result = findMaxOverlap(test6_str1, test6_str2);
console.log(`Тест 6: '${test6_str1}' и '${test6_str2}' -> перекрытие: ${test6_result}`);
console.log(`Ожидаемый результат: 6`);
console.log(`Тест ${test6_result === 6 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест 7: Юникод
const test7_str1 = 'hello💡';
const test7_str2 = '💡world';
const test7_result = findMaxOverlap(test7_str1, test7_str2);
console.log(`Тест 7: '${test7_str1}' и '${test7_str2}' -> перекрытие: ${test7_result}`);
console.log(`Ожидаемый результат: 1 (эмодзи)`);
console.log(`Тест ${test7_result === 1 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
console.log();

// Тест на производительность
console.log('Тест производительности:');
console.log('-----------------------');

// Генерируем большие строки с перекрытием
const largePrefix = 'a'.repeat(100000);
const largeSuffix = 'b'.repeat(100000);
const overlapText = 'ThisIsOverlappingText';

const largeStr1 = largePrefix + overlapText;
const largeStr2 = overlapText + largeSuffix;

console.log(`Тестирование с большими строками (~100K символов)...`);
const startTime = Date.now();
const largeResult = findMaxOverlap(largeStr1, largeStr2);
const endTime = Date.now();

console.log(`Найденное перекрытие: ${largeResult} символов`);
console.log(`Ожидаемое перекрытие: ${overlapText.length} символов`);
console.log(`Время выполнения: ${endTime - startTime} мс`);
console.log(`Тест ${largeResult === overlapText.length ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}`);
