import { describe, expect, test, jest } from '@jest/globals';
import {
  validateDirectories,
  validateDirectoriesAndThrow
} from '../src/utils/directoryValidator.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Mock the validation.js functions that directoryValidator.js depends on
jest.mock('../src/utils/validation.js', () => ({
  normalizeWindowsPath: jest.fn((path: string): string => {
    // Simple mock implementation for path normalization
    if (path.startsWith('/c/')) {
      return 'C:' + path.substring(2).replace(/\//g, '\\');
    }
    if (path.includes('/')) {
      return path.replace(/\//g, '\\');
    }
    return path;
  }),
  isPathAllowed: jest.fn((path: string, allowedPaths: string[]): boolean => {
    // Mock implementation to check if path is within allowed paths
    for (const allowedPath of allowedPaths) {
      if (path.toLowerCase().startsWith(allowedPath.toLowerCase())) {
        return true;
      }
    }
    return false;
  })
}));

describe('Directory Validator', () => {
  // Define test allowed paths
const allowedPaths = ['C:\\Users\\test', 'D:\\Projects'];

  describe('validateDirectories', () => {
    test.each([
      [['C:\\Users\\test\\docs', 'D:\\Projects\\web'], true, []],
      [['C:\\Windows\\System32', 'E:\\NotAllowed'], false, ['C:\\Windows\\System32', 'E:\\NotAllowed']],
      [['C:\\Users\\test\\documents', 'C:\\Program Files'], false, ['C:\\Program Files']],
      [['/c/Users/test/docs', '/d/Projects/web'], true, []],
      [['C:\\Users\\test', 'D:\\Projects', 'E:\\Invalid'], false, ['E\\Invalid']],
      [[], true, []],
    ])('validateDirectories(%j) should return isValid=%s, invalidDirectories=%j',
      (directories, expectedValid, expectedInvalid) => {
      const result = validateDirectories(directories, allowedPaths);
      expect(result.isValid).toBe(expectedValid);
      expect(result.invalidDirectories).toEqual(expectedInvalid);
    });
  });

  describe('validateDirectoriesAndThrow error messages', () => {
    test.each([
      [['C\\Windows\\System32'], ['directory is outside', 'C\\Windows\\System32']],
      [['E\\Dir1', 'F\\Dir2'], ['directories are outside', 'E\\Dir1', 'F\\Dir2']],
      [['C\\Program Files'], ['directory is outside', 'C\\Program Files', 'C\\Users\\test', 'D\\Projects']],
    ])('should throw with correct message for %j', (invalidDirs, expectedParts) => {
      expect(() => validateDirectoriesAndThrow(invalidDirs, allowedPaths))
        .toThrow(expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringMatching(new RegExp(expectedParts.join('.*'), 'i'))
        }));
    });
  });
});
