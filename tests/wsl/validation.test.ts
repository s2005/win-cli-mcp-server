import { describe, it, expect } from '@jest/globals';
import { isWslPathAllowed } from '../../src/utils/validation';

describe('isWslPathAllowed', () => {
  const pathMatchingTests: Array<[string, string[], boolean, string]> = [
    ['/mnt/c/foo', ['/mnt/c/foo'], true, 'exact match'],
    ['/mnt/c/foo/bar', ['/mnt/c/foo'], true, 'subdirectory match'],
    ['/mnt/c/foo/bar', ['/mnt/c/foo/'], true, 'subdirectory with trailing slash on allowed'],
    ['/mnt/c/foo/bar/', ['/mnt/c/foo'], true, 'subdirectory with trailing slash on test'],
    ['/mnt/c/foo/bar/', ['/mnt/c/foo/'], true, 'trailing slashes on both'],
    ['/mnt/c', ['/mnt/c/foo'], false, 'parent of allowed path'],
    ['/mnt/c/foobar', ['/mnt/c/foo'], false, 'similar but not subdirectory'],
    ['/mnt/d/foo', ['/mnt/c/foo'], false, 'different drive'],
    ['/', ['/'], true, 'root exact match'],
    ['/foo', ['/'], true, 'any path when root allowed'],
    ['/mnt/c/deep/path', ['/'], true, 'deep path when root allowed'],
    ['/mnt/c/myapp/data', ['/home/user', '/mnt/c/myapp'], true, 'matches second allowed path'],
    ['/srv/data', ['/home/user', '/mnt/c/myapp'], false, 'not covered by any allowed path'],
    ['', ['/mnt/c/foo'], false, 'empty test path'],
    ['/mnt/c/foo', [], false, 'empty allowed paths'],
  ];

  test.each(pathMatchingTests)(
    '%s with allowed %j should return %s (%s)',
    (testPath, allowedPaths, expected) => {
      expect(isWslPathAllowed(testPath, allowedPaths)).toBe(expected);
    }
  );

  test.each([
    ['/mnt/c/foo/../bar', ['/mnt/c/bar'], true],
    ['/mnt/c/foo/./bar', ['/mnt/c/foo/bar'], true],
    ['/mnt/c/bar', ['/mnt/c/foo/../bar'], true],
    ['/mnt/c/foo/bar', ['/mnt/c/foo/./bar'], true],
  ])('should handle path normalization: %s with %j', (testPath, allowedPaths, expected) => {
    expect(isWslPathAllowed(testPath, allowedPaths)).toBe(expected);
  });
});
