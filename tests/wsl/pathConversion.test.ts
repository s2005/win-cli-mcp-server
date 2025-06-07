import { convertWindowsToWslPath } from '../../src/utils/validation';

describe('convertWindowsToWslPath', () => {
  test('converts drive letter path', () => {
    const win = 'D:\\mcp\\project';
    expect(convertWindowsToWslPath(win)).toBe('/mnt/d/mcp/project');
  });

  test('custom mount point', () => {
    const win = 'C:\\test';
    expect(convertWindowsToWslPath(win, '/media/')).toBe('/media/c/test');
  });

  test('throws on UNC path', () => {
    expect(() => convertWindowsToWslPath('\\\\server\\share')).toThrow();
  });
});
