/**
 * Вспомогательные функции для правильного мокирования типов в тестах
 */
import { Stats } from 'fs';
import { jest } from '@jest/globals';

/**
 * Создает мок объект Stats, совместимый с типами fs.Stats
 */
export function createMockStats(params: { 
  size: number; 
  isDirectory?: boolean;
  isFile?: boolean;
}): Stats {
  const isDir = params.isDirectory ?? false;
  const isFile = params.isFile ?? !isDir;
  
  return {
    size: params.size,
    isDirectory: () => isDir,
    isFile: () => isFile,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    blksize: 4096,
    blocks: Math.ceil(params.size / 4096),
    atimeMs: Date.now(),
    mtimeMs: Date.now(),
    ctimeMs: Date.now(),
    birthtimeMs: Date.now(),
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date()
  } as Stats;
}

/**
 * Безопасно мокирует process.cwd
 */
export function mockProcessCwd(path: string): jest.Mock<string> {
  const originalCwd = process.cwd;
  const spy = jest.spyOn(process, 'cwd').mockImplementation(() => path);
  
  return spy;
}

/**
 * Создает объект, имитирующий FileHandle для fs.open
 */
export function createMockFileHandle(readImplementation: any, closeImplementation: any = () => Promise.resolve()) {
  return {
    read: readImplementation,
    close: closeImplementation,
    readFile: jest.fn(),
    writeFile: jest.fn(),
    appendFile: jest.fn(),
    datasync: jest.fn(),
    sync: jest.fn(),
    truncate: jest.fn(),
    stat: jest.fn(),
    chown: jest.fn(),
    chmod: jest.fn(),
    utimes: jest.fn()
  };
}
