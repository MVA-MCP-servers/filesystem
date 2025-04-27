#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { enhancedPerformOptimizedWrite } from './lib/content-completion-integration';
import { isContentComplete, removeCompletionMarker, determineOptimalWriteMethod } from './lib/content-completion-marker';

// Глобальные настройки и конфигурация
// Расширяем global для правильного типизированного доступа
declare global {
  var DEBUG_LEVEL: string;
  var ESTIMATED_TOKENS_LEFT: number;
}

// Конфигурация сервера
const config = {
  // Общие настройки
  autoOptimizeWriteOperations: true,  // Включить автоматическую оптимизацию функций записи
  tokenEstimationEnabled: true,       // Включить оценку токенов
  
  // Пороговые значения
  smartWriteThreshold: 100000,        // Размер контента (в символах) для перенаправления на smart_append_file
  largeFileThreshold: 1024 * 1024,    // Размер "большого файла" (1 МБ)
  
  // Типы контента
  binaryContentExtensions: ['.bin', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.7z', '.tar', '.gz'],
  
  // Параметры оценки токенов
  defaultTokensEstimate: 50000,       // Оценка по умолчанию для количества оставшихся токенов
  symbolsPerToken: 4,                 // Примерное количество символов на один токен

  // Параметры маркера завершения контента
  contentCompletionMarker: {
    enabled: true,                    // Включить функциональность маркера завершения
    marker: "// END_OF_CONTENT",     // Строка маркера завершения
    autoSmartAppend: true,           // Автоматически использовать smart_append если маркер отсутствует
    sizeThreshold: 1024 * 1024       // Пороговое значение размера для определения метода записи
  }
};

// Устанавливаем глобальное значение уровня логирования
global.DEBUG_LEVEL = process.env.DEBUG_LEVEL || 'info'; // 'debug', 'info', 'warn', 'error'

// Инициализация оценки оставшихся токенов
global.ESTIMATED_TOKENS_LEFT = config.defaultTokensEstimate;

// Функция логирования - всегда используем stderr для предотвращения смешивания с JSON-RPC
function log(level: string, message: string): void {
  const levels: {[key: string]: number} = { debug: 0, info: 1, warn: 2, error: 3 };
  if ((levels[level] ?? 3) >= (levels[global.DEBUG_LEVEL] ?? 1)) {
    // Всегда пишем в stderr независимо от уровня логирования
    // Добавляем временную метку для упрощения анализа логов в долгосрочной перспективе
    const prefix = `[${new Date().toISOString()}] [filesystem] [${level}]`;
    console.error(`${prefix} ${message}`);
  }
}

/**
 * «Умный» append: дописывает только ту часть content,
 * которой ещё нет в конце файла по пути filePath.
 * Использует динамический размер буфера для надёжного поиска перекрытий.
 * 
 * Экспортируем функцию для использования в других модулях
 */
// Делаем функцию доступной в глобальной области видимости для использования в модулях интеграции
(global as any).smartAppend = smartAppend;
async function smartAppend(filePath: string, content: string, initialChunkSize = 1024): Promise<void> {
  // Задаём константы для стратегии динамического изменения буфера
  const MAX_CHUNK_SIZE = 1024 * 1024; // 1 МБ
  const MAX_FILE_SIZE_FOR_FULL_READ = 10 * 1024 * 1024; // 10 МБ
  const SMALL_CONTENT_THRESHOLD = initialChunkSize * 4;
  const MAX_ITERATIONS = 6; // Максимальное количество увеличений размера чанка

  // Проверяем, существует ли файл
  let fileStats;
  try {
    fileStats = await fs.stat(filePath);
  } catch {
    // Файл ещё не существует — запишем всё
    await fs.writeFile(filePath, content, "utf8");
    log('debug', `Файл ${filePath} не существует, создаем новый`);
    return;
  }

  // Измеряем фактический размер контента в байтах для корректного сравнения
  const contentBytes = Buffer.byteLength(content, "utf8");

  // Стратегия для коротких вставок или небольших файлов: читаем весь файл
  if (contentBytes <= SMALL_CONTENT_THRESHOLD || fileStats.size <= MAX_FILE_SIZE_FOR_FULL_READ) {
    try {
      const existing = await fs.readFile(filePath, "utf8");
      const overlap = findMaxOverlapSimple(existing, content);
      
      // Дозаписываем только оставшуюся часть
      const toWrite = content.slice(overlap);
      if (toWrite) {
        await fs.appendFile(filePath, toWrite, "utf8");
      }
      return;
    } catch (err) {
      // Если не удалось прочитать весь файл, продолжаем с чтением по частям
      log('warn', `Не удалось прочитать весь файл, переключаюсь на чтение по частям: ${err}`);
    }
  }

  // Для больших файлов используем динамическое изменение размера буфера
  let chunkSize = initialChunkSize;
  let overlap = 0;
  let iterations = 0;
  
  try {
    while (chunkSize <= MAX_CHUNK_SIZE && overlap === 0 && iterations < MAX_ITERATIONS) {
      // Читаем хвост существующего файла
      const start = Math.max(0, fileStats.size - chunkSize);
      const fd = await fs.open(filePath, "r");
      const buffer = Buffer.alloc(Math.min(fileStats.size, chunkSize));
      await fd.read(buffer, 0, buffer.length, start);
      await fd.close();
      const existing = buffer.toString("utf8");
      
      // Выбираем алгоритм поиска перекрытия в зависимости от размера чанка
      if (chunkSize > SMALL_CONTENT_THRESHOLD) {
        overlap = findMaxOverlapRabinKarp(existing, content);
      } else {
        overlap = findMaxOverlapSimple(existing, content);
      }
      
      if (overlap === 0 && chunkSize < MAX_CHUNK_SIZE) {
        // Если перекрытие не найдено, увеличиваем размер чанка
        chunkSize *= 2;
        iterations++;
        log('debug', `Перекрытие не найдено, увеличиваю размер буфера до ${chunkSize} байт (итерация ${iterations})`);
      }
    }

    // Дозаписываем только оставшуюся часть
    const toWrite = content.slice(overlap);
    if (toWrite) {
      await fs.appendFile(filePath, toWrite, "utf8");
    }
  } catch (error) {
    log('error', `Ошибка при выполнении smartAppend: ${error}`);
    throw error; // Пробрасываем ошибку дальше для обработки на верхнем уровне
  }
}

/**
 * Простой алгоритм поиска максимального перекрытия.
 * Подходит для небольших строк.
 */
function findMaxOverlapSimple(str1: string, str2: string): number {
  const maxPossibleOverlap = Math.min(str1.length, str2.length);
  
  // Ищем с самого большого перекрытия
  for (let len = maxPossibleOverlap; len > 0; len--) {
    if (str1.slice(-len) === str2.slice(0, len)) {
      return len;
    }
  }
  
  return 0;
}

/**
 * Алгоритм Рабина-Карпа для эффективного поиска перекрытий.
 * Использует хеширование для быстрого сравнения подстрок.
 * Оптимизированная версия с предварительным вычислением хешей.
 */
function findMaxOverlapRabinKarp(str1: string, str2: string): number {
  const maxPossibleOverlap = Math.min(str1.length, str2.length);
  if (maxPossibleOverlap === 0) return 0;
  
  // Минимальная длина осмысленного перекрытия
  const MIN_OVERLAP = 4;
  if (maxPossibleOverlap < MIN_OVERLAP) {
    // Для очень коротких строк используем простой алгоритм
    return findMaxOverlapSimple(str1, str2);
  }
  
  // Параметры хеширования
  const BASE = 256; // ASCII/UTF-8 основание
  const MOD = 1000000007; // Большое простое число для модуля
  
  // Предварительно вычисляем степени BASE для быстрых расчетов
  const powers: number[] = [1];
  for (let i = 1; i < maxPossibleOverlap; i++) {
    powers[i] = (powers[i-1] * BASE) % MOD;
  }
  
  // Вычисляем хеши префиксов str2
  const prefixHashes: number[] = [0];
  for (let i = 0; i < maxPossibleOverlap; i++) {
    const charCode = str2.charCodeAt(i);
    prefixHashes[i+1] = ((prefixHashes[i] * BASE) % MOD + charCode) % MOD;
  }
  
  // Вычисляем хеши суффиксов str1
  const reversePowers: number[] = [1];
  for (let i = 1; i < maxPossibleOverlap; i++) {
    reversePowers[i] = (reversePowers[i-1] * BASE) % MOD;
  }
  
  // Строим суффиксный хеш-массив в обратном порядке
  const suffixHashes: number[] = [0];
  for (let i = 1; i <= maxPossibleOverlap; i++) {
    const charCode = str1.charCodeAt(str1.length - i);
    suffixHashes[i] = (suffixHashes[i-1] + charCode * reversePowers[i-1]) % MOD;
  }
  
  // Ищем максимальное перекрытие, сравнивая хеши
  let maxOverlap = 0;
  
  // Проверяем разные длины перекрытия, начиная с максимальной
  for (let len = maxPossibleOverlap; len >= MIN_OVERLAP; len--) {
    const suffixHash = suffixHashes[len];
    const prefixHash = prefixHashes[len];
    
    if (suffixHash === prefixHash) {
      // Проверяем, действительно ли строки совпадают (для защиты от коллизий хешей)
      const suffix = str1.slice(str1.length - len);
      const prefix = str2.slice(0, len);
      
      if (suffix === prefix) {
        maxOverlap = len;
        break;
      }
    }
  }
  
  return maxOverlap;
}

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  // Заменяем все виды слэшей на OS-специфичный разделитель
  const unified = p.replace(/[\\/]+/g, path.sep);
  return path.normalize(unified);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
let exitCode = 0;
const errors: string[] = [];

// Process each directory sequentially
for (const dir of args) {
  const fullPath = path.resolve(expandHome(dir));
  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      errors.push(`Error: '${dir}' exists but is not a directory`);
      exitCode = Math.max(exitCode, 2);
    }
  } catch {
    errors.push(`Error: directory not found: '${dir}'`);
    exitCode = Math.max(exitCode, 3);
  }
}

// Exit with appropriate error code if any directory check failed
if (errors.length > 0) {
  errors.forEach(msg => console.error(msg));
  process.exit(exitCode);
}

// Security utilities
// Кэш реальных путей для ускорения fs.realpath
const realPathCache = new Map<string,string>();
async function getRealPath(p: string) {
  if (!realPathCache.has(p)) {
    realPathCache.set(p, await fs.realpath(p));
  }
  return realPathCache.get(p)!;
}

async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);

  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => {
    const rel = path.relative(dir, normalizedRequested);
    return !rel.startsWith('..');
  });
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await getRealPath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await getRealPath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const StreamReadFileArgsSchema = z.object({
  path: z.string(),
  offset: z.number().optional().default(0),
  limit: z.number().optional(),
  encoding: z.string().optional().default('utf8'),
  chunkSize: z.number().optional().default(DEFAULT_CHUNK_SIZE),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const AppendFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const SmartAppendFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  chunkSize: z.number().optional().default(1024),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  maxDepth: z.number().optional().default(3),
  maxItems: z.number().optional().default(1000),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
  maxDepth: z.number().optional().default(5),
  maxItems: z.number().optional().default(5000),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      try {
        // Validate each path before processing
        await validatePath(fullPath);

        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });

        if (shouldExclude) {
          continue;
        }

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);

    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }

    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;

    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);

      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });

      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });

        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }

  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);

  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }

  return formattedDiff;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const basicTools = [
    {
      name: "read_file",
      description:
        "Read the contents of a file from the file system. " +
        "For files larger than 1MB, only the first 1MB is returned to avoid overwhelming the LLM. " +
        "Handles various text encodings and provides detailed error messages " +
        "if the file cannot be read. Use this tool when you need to examine " +
        "the contents of a single file. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
    },
    {
      name: "stream_read_file",
      description:
        "Read large files with streaming support and precise control over reading positions. " +
        "Allows specifying offset (starting position), limit (maximum bytes to read), " +
        "and encoding. Perfect for processing large files in manageable chunks " +
        "or extracting specific portions of large files without loading the entire file. " +
        "Use this tool when standard read_file fails due to file size limitations " +
        "or when you need to read specific parts of a file. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(StreamReadFileArgsSchema) as ToolInput,
    },
    {
      name: "write_file",
      description:
        "Create a new file or completely overwrite an existing file with new content. " +
        "Use with caution as it will overwrite existing files without warning. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
    },
    {
      name: "append_file",
      description:
        "Append content to the end of an existing file or create a new file if it doesn't exist. " +
        "This is safer than write_file when you want to add content without overwriting existing data. " +
        "Handles text content with proper encoding. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(AppendFileArgsSchema) as ToolInput,
    },
    {
      name: "smart_append_file",
      description:
        "Intelligently append content to a file without duplication, even if previous append was interrupted. " +
        "Detects overlapping content between existing file end and new content beginning. " +
        "Only appends the non-overlapping content to avoid duplication. " +
        "Perfect for resilient logging and incremental data collection. " +
        "Only works within allowed directories.",
      inputSchema: zodToJsonSchema(SmartAppendFileArgsSchema) as ToolInput,
    },
    {
      name: "list_directory",
      description:
        "Get a detailed listing of all files and directories in a specified path. " +
        "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
        "prefixes. This tool is essential for understanding directory structure and " +
        "finding specific files within a directory. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
    },
    {
      name: "create_directory",
      description:
        "Create a new directory or ensure a directory exists. Can create multiple " +
        "nested directories in one operation. If the directory already exists, " +
        "this operation will succeed silently. Perfect for setting up directory " +
        "structures for projects or ensuring required paths exist. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
    },
    {
      name: "get_file_info",
      description:
        "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
        "information including size, creation time, last modified time, permissions, " +
        "and type. This tool is perfect for understanding file characteristics " +
        "without reading the actual content. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
    },
    {
      name: "list_allowed_directories",
      description:
        "Returns the list of directories that this server is allowed to access. " +
        "Use this to understand which directories are available before trying to access files.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ];

  const advancedTools = [
    {
      name: "read_multiple_files",
      description:
        "Read the contents of multiple files simultaneously. This is more " +
        "efficient than reading files one by one when you need to analyze " +
        "or compare multiple files. For files larger than 1MB, only the first 1MB is returned. " +
        "Each file's content is returned with its path as a reference. Failed reads for " +
        "individual files won't stop the entire operation. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
    },
    {
      name: "edit_file",
      description:
        "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        "with new content. Returns a git-style diff showing the changes made. " +
        "Only works within allowed directories.",
      inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
    },
    {
      name: "directory_tree",
      description:
          "Get a recursive tree view of files and directories as a JSON structure. " +
          "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
          "Files have no children array, while directories always have a children array (which may be empty). " +
          "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
      inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
    },
    {
      name: "move_file",
      description:
        "Move or rename files and directories. Can move files between directories " +
        "and rename them in a single operation. If the destination exists, the " +
        "operation will fail. Works across different directories and can be used " +
        "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
      inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
    },
    {
      name: "search_files",
      description:
        "Recursively search for files and directories matching a pattern. " +
        "Searches through all subdirectories from the starting path. The search " +
        "is case-insensitive and matches partial names. Returns full paths to all " +
        "matching items. Great for finding files when you don't know their exact location. " +
        "Only searches within allowed directories.",
      inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
    },
  ];

  const allTools = [...basicTools, ...advancedTools];
  return {
    tools: allTools
  };
});


// Константы для работы с размером файлов
const MAX_INLINE_SIZE = 1024 * 1024; // 1 МБ - максимальный размер для прямого чтения
const DEFAULT_CHUNK_SIZE = 512 * 1024; // 512 КБ - размер чанка для потокового чтения

interface ReadOptions {
  offset?: number;     // Начальная позиция чтения (в байтах)
  limit?: number;      // Максимальное количество байт для чтения
  encoding?: string;   // Кодировка ('utf8', 'base64', и т.д.)
  chunkSize?: number;  // Размер чанка для потокового чтения
}

/**
 * Чтение файла с ограничением размера для больших файлов
 * Если размер файла превышает MAX_INLINE_SIZE, возвращается только первая часть файла
 */
async function readFileWithSizeLimit(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  
  // Если файл большой, читаем только первую порцию
  if (stats.size > MAX_INLINE_SIZE) {
    log('info', `Большой файл (${stats.size} байт), чтение только первых ${MAX_INLINE_SIZE} байт: ${filePath}`);
    
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(MAX_INLINE_SIZE);
    await fd.read(buffer, 0, MAX_INLINE_SIZE, 0);
    await fd.close();
    
    const partialContent = buffer.toString('utf8');
    const warningMsg = `\n\n[⚠️ Предупреждение: Файл слишком большой (${Math.round(stats.size / 1024)} КБ), `+
                      `показаны только первые ${Math.round(MAX_INLINE_SIZE / 1024)} КБ из ${Math.round(stats.size / 1024)} КБ]`;
    
    return partialContent + warningMsg;
  }
  
  // Для небольших файлов - стандартное чтение целиком
  return await fs.readFile(filePath, 'utf8');
}

/**
 * Потоковое чтение файла с поддержкой указания смещения, лимита и кодировки
 * Позволяет читать большие файлы по частям с заданного смещения
 */
async function streamReadFile(filePath: string, options: ReadOptions = {}): Promise<string> {
  const {
    offset = 0,
    limit,
    encoding = 'utf8',
    chunkSize = DEFAULT_CHUNK_SIZE
  } = options;

  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  
  // Проверка, что смещение не превышает размер файла
  if (offset >= fileSize) {
    throw new Error(`Offset ${offset} exceeds file size ${fileSize}`);
  }

  // Определяем, сколько данных нужно прочитать
  const bytesToRead = limit ? Math.min(limit, fileSize - offset) : fileSize - offset;
  log('debug', `Stream reading ${bytesToRead} bytes from offset ${offset} in file ${filePath}`);

  // Для очень маленьких файлов или маленьких чанков используем прямое чтение
  if (bytesToRead <= chunkSize) {
    const fd = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    await fd.read(buffer, 0, bytesToRead, offset);
    await fd.close();
    return buffer.toString(encoding as BufferEncoding);
  }

  // Для больших объемов используем чтение по чанкам
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  const fd = await fs.open(filePath, 'r');

  try {
    while (bytesRead < bytesToRead) {
      // Размер текущего чанка
      const currentChunkSize = Math.min(chunkSize, bytesToRead - bytesRead);
      const buffer = Buffer.alloc(currentChunkSize);

      // Читаем чанк
      const result = await fd.read(buffer, 0, currentChunkSize, offset + bytesRead);
      
      // Проверяем результат чтения
      if (result.bytesRead === 0) {
        // Если ничего не прочитано, значит достигли конца файла
        break;
      }
      
      // Если прочитали меньше чем ожидали, обрезаем буфер
      if (result.bytesRead < currentChunkSize) {
        chunks.push(buffer.slice(0, result.bytesRead));
      } else {
        chunks.push(buffer);
      }
      
      bytesRead += result.bytesRead;
    }
  } finally {
    // Всегда закрываем файловый дескриптор
    await fd.close();
  }

  // Объединяем все чанки и возвращаем строку
  const completeBuffer = Buffer.concat(chunks);
  return completeBuffer.toString(encoding as BufferEncoding);
}

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const content = await readFileWithSizeLimit(validPath);
        return {
          content: [{ type: "text", text: content }],
        };
      }
      
      case "stream_read_file": {
        const parsed = StreamReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for stream_read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const { offset, limit, encoding, chunkSize } = parsed.data;
        
        try {
          // Получаем информацию о файле для включения в ответ
          const stats = await fs.stat(validPath);
          const fileSize = stats.size;
          
          // Вычисляем фактические границы чтения
          const effectiveOffset = Math.min(offset, fileSize);
          const effectiveLimit = limit ? Math.min(limit, fileSize - effectiveOffset) : fileSize - effectiveOffset;
          
          log('info', `Streaming file ${validPath} - Offset: ${effectiveOffset}, Limit: ${effectiveLimit}, ` +
                      `Total file size: ${fileSize}`);
          
          const content = await streamReadFile(validPath, {
            offset: effectiveOffset,
            limit: effectiveLimit,
            encoding,
            chunkSize
          });
          
          // Формируем информационное сообщение о чтении
          const infoMsg = `\n\n[ℹ️ Потоковое чтение: прочитано ${effectiveLimit} байт из ${fileSize} байт файла, ` +
                        `начиная с позиции ${effectiveOffset}]`;
          
          return {
            content: [{ type: "text", text: content + infoMsg }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('error', `Ошибка при потоковом чтении файла ${validPath}: ${errorMessage}`);
          throw new Error(`Stream read file error: ${errorMessage}`);
        }
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
          // Временно изменяем уровень логирования, если пользователь его указал
          const prevDebugLevel = global.DEBUG_LEVEL;
          if (parsed.data.logLevel) {
            global.DEBUG_LEVEL = parsed.data.logLevel;
          }
              const validPath = await validatePath(filePath);
              const content = await readFileWithSizeLimit(validPath);
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        
        const validPath = await validatePath(parsed.data.path);
        
        // Если включена автоматическая оптимизация, используем оптимизированную запись
        if (config.autoOptimizeWriteOperations) {
          return await performOptimizedWrite({
            path: validPath,
            content: parsed.data.content,
            requestedFunction: 'write_file',
            isFullRewrite: true
          });
        }
        
        // Стандартное поведение, если оптимизация отключена
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "append_file": {
        const parsed = AppendFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for append_file: ${parsed.error}`);
        }
        
        const validPath = await validatePath(parsed.data.path);
        
        // Если включена автоматическая оптимизация, используем оптимизированную запись
        if (config.autoOptimizeWriteOperations) {
          return await performOptimizedWrite({
            path: validPath,
            content: parsed.data.content,
            requestedFunction: 'append_file',
            isFullRewrite: false
          });
        }
        
        // Стандартное поведение, если оптимизация отключена
        try {
          // Открываем файл для добавления данных
          const fileHandle = await fs.open(validPath, 'a+');
          // Записываем содержимое в конец файла
          await fileHandle.writeFile(parsed.data.content, "utf-8");
          // Закрываем файл
          await fileHandle.close();
          
          return {
            content: [{ type: "text", text: `Successfully appended to ${parsed.data.path}` }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to append to file: ${errorMessage}`);
        }
      }
      
      case "smart_append_file": {
        const parsed = SmartAppendFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for smart_append_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        
        try {
          // Временно изменяем уровень логирования, если пользователь его указал
          const prevDebugLevel = global.DEBUG_LEVEL;
          if (parsed.data.logLevel) {
            global.DEBUG_LEVEL = parsed.data.logLevel;
          }
          
          try {
            await smartAppend(validPath, parsed.data.content, parsed.data.chunkSize);
            log('info', `Успешно выполнен smart-append к файлу ${parsed.data.path}`);
            return {
              content: [{ type: "text", text: `Successfully smart-appended to ${parsed.data.path}` }],
            };
          } finally {
            // Восстанавливаем оригинальный уровень логирования
            if (parsed.data.logLevel) {
              global.DEBUG_LEVEL = prevDebugLevel;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('error', `Ошибка при выполнении smart-append: ${errorMessage}`);
          throw new Error(`Failed to smart-append to file: ${errorMessage}`);
        }
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        
        // Implement maxDepth and maxItems limits
        async function listWithLimits(dirPath: string, currentDepth = 0, itemCount = 0): Promise<{entries: string[], count: number}> {
          const maxDepth = parsed.data?.maxDepth ?? 3;
          const maxItems = parsed.data?.maxItems ?? 1000;
          
          if (currentDepth > maxDepth || itemCount >= maxItems) {
            return { entries: [], count: itemCount };
          }
          
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          let result: string[] = [];
          let newCount = itemCount;
          
          for (const entry of entries) {
            if (newCount >= maxItems) break;
            
            result.push(`${"  ".repeat(currentDepth)}${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`);
            newCount++;
          }
          
          return { entries: result, count: newCount };
        }
        
        const { entries } = await listWithLimits(validPath);
        const formatted = entries.join("\n");
        
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

        case "directory_tree": {
            const parsed = DirectoryTreeArgsSchema.safeParse(args);
            if (!parsed.success) {
                throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
            }

            interface TreeEntry {
                name: string;
                type: 'file' | 'directory';
                children?: TreeEntry[];
            }

            // Tracking total items for the maxItems limit
            let totalItems = 0;

            async function buildTree(currentPath: string, currentDepth = 0): Promise<TreeEntry[]> {
                const maxDepth = parsed.data?.maxDepth ?? 5;
                const maxItems = parsed.data?.maxItems ?? 5000;
                
                // Check if we've reached depth or item limits
                if (currentDepth >= maxDepth || totalItems >= maxItems) {
                    return [];
                }
                
                const validPath = await validatePath(currentPath);
                const entries = await fs.readdir(validPath, {withFileTypes: true});
                const result: TreeEntry[] = [];

                for (const entry of entries) {
                    // Check item limit
                    if (totalItems >= maxItems) {
                        break;
                    }
                    
                    const entryData: TreeEntry = {
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file'
                    };
                    
                    totalItems++;

                    if (entry.isDirectory()) {
                        const subPath = path.join(currentPath, entry.name);
                        entryData.children = await buildTree(subPath, currentDepth + 1);
                    }

                    result.push(entryData);
                }

                return result;
            }

            const treeData = await buildTree(parsed.data.path, 0);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(treeData, null, 2)
                }],
            };
        }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const fileInfo = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: JSON.stringify(fileInfo, null, 2) }],
        };
      }
      
      case "list_allowed_directories": {
        return {
          content: [{ type: "text", text: `Allowed directories:\n${allowedDirectories.join('\n')}` }],
        };
      }

      default: {
        throw new Error(`Unknown tool: ${name}`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      error: {
        message: errorMessage,
      },
    };
  }
});

// Initialize transport and start server
const transport = new StdioServerTransport();
server.connect(transport);

log('info', `Secure filesystem server started. Allowed directories: ${allowedDirectories.join(', ')}`);
log('info', `Logging level: ${global.DEBUG_LEVEL}`);

шого контента (особенно при работе с LLM) или высоких требованиях к ресурсам, smart_append может быть более эффективным
    selectedFunction = options.fileExists ? 'smart_append_file' : 'write_file';
  }

  // Для больших объемов данных (особенно при работе с LLM) всегда предпочитаем smart_append_file
  const contentLength = options.content.length;
  if (contentLength > config.smartWriteThreshold) {
    // Оцениваем количество токенов, необходимых для обработки контента
    const contentTokens = Math.ceil(contentLength / config.symbolsPerToken);
    const remainingTokens = estimateRemainingTokens();
    
    // Если размер контента приближается к лимиту токенов, используем smart_append_file
    if (contentTokens > remainingTokens * 0.5) { // Если контент использует больше 50% оставшихся токенов
      selectedFunction = 'smart_append_file';
      log('info', `Large content detected (${contentLength} chars, ~${contentTokens} tokens) with ${remainingTokens} tokens remaining. Using smart_append_file for ${options.path}`);
    }
  }
  
  // Если контент небольшой и файл не существует, используем простую запись
  if (contentLength < 1000 && !options.fileExists) {
    selectedFunction = 'write_file';
  }

  // Учитываем явные предпочтения пользователя, если они указаны
  if (options.requestedFunction) {
    // Логируем только если мы рекомендуем другую функцию
    if (options.requestedFunction !== selectedFunction) {
      log('debug', `User requested ${options.requestedFunction}, but ${selectedFunction} might be more optimal for ${options.path}`);
    }
    // Возвращаем запрошенную пользователем функцию
    return options.requestedFunction as WriteFunction;
  }

  return selectedFunction;
}

/**
 * Выполняет операцию записи файла с помощью оптимальной функции
 * @param options Параметры операции записи
 * @returns Результат операции в формате ответа API
 */
async function performOptimizedWrite(options: WriteOperationOptions): Promise<any> {
  // Создаем параметры для улучшенной функции с поддержкой маркеров завершения
  const enhancedOptions = {
    ...options,
    contentCompletionConfig: {
      CONTENT_COMPLETION_MARKER: config.contentCompletionMarker.marker,
      LARGE_CONTENT_THRESHOLD: config.contentCompletionMarker.sizeThreshold,
      BINARY_CONTENT_EXTENSIONS: config.binaryContentExtensions,
      DEBUG: global.DEBUG_LEVEL === 'debug'
    }
  };
  
  // Вызываем улучшенную функцию для обработки маркеров завершения
  if (config.contentCompletionMarker.enabled) {
    return await enhancedPerformOptimizedWrite(enhancedOptions);
  }

  // Если функциональность маркеров завершения отключена, используем стандартную логику
  // Проверяем существование файла и получаем его размер, если файл существует
  let fileExists = options.fileExists;
  let fileSize = options.fileSize || 0;
  
  if (fileExists === undefined) {
    try {
      const stats = await fs.stat(options.path);
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
  
  // Определяем оптимальную функцию для записи
  const optimalFunction = determineOptimalWriteFunction(options);
  
  // Выполняем запись с помощью выбранной функции
  try {
    switch (optimalFunction) {
      case 'write_file':
        await fs.writeFile(options.path, options.content, "utf-8");
        break;
        
      case 'append_file':
        const fileHandle = await fs.open(options.path, 'a+');
        await fileHandle.writeFile(options.content, "utf-8");
        await fileHandle.close();
        break;
        
      case 'smart_append_file':
        await smartAppend(options.path, options.content);
        break;
    }
    
    // Обновляем оценку оставшихся токенов
    updateTokenEstimation(options.content.length);
    
    // Формируем информативное сообщение
    let message = `Successfully wrote to ${options.path}`;
    
    // Если функция отличается от запрошенной, добавляем информацию о выборе
    if (options.requestedFunction && options.requestedFunction !== optimalFunction) {
      message += ` (automatically used ${optimalFunction} for optimal performance)`;
    }
    
    return {
      content: [{ type: "text", text: message }],
      optimizedWrite: true,
      usedFunction: optimalFunction
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Error during optimized write to ${options.path}: ${errorMessage}`);
    throw new Error(`Failed to write file: ${errorMessage}`);
  }
}
