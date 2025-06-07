import { describe, it, expect } from '@jest/globals';
import { isWslPathAllowed } from '../../src/utils/validation';

describe('isWslPathAllowed', () => {
  it('should allow exact matches', () => {
    expect(isWslPathAllowed('/mnt/c/foo', ['/mnt/c/foo'])).toBe(true);
  });

  it('should allow subdirectory matches', () => {
    expect(isWslPathAllowed('/mnt/c/foo/bar', ['/mnt/c/foo'])).toBe(true);
  });

  it('should allow subdirectory match with trailing slash on allowed path', () => {
    expect(isWslPathAllowed('/mnt/c/foo/bar', ['/mnt/c/foo/'])).toBe(true);
  });

  it('should allow subdirectory match with trailing slash on test path', () => {
    expect(isWslPathAllowed('/mnt/c/foo/bar/', ['/mnt/c/foo'])).toBe(true);
  });

  it('should handle trailing slashes on both test and allowed paths', () => {
    expect(isWslPathAllowed('/mnt/c/foo/bar/', ['/mnt/c/foo/'])).toBe(true);
  });

  it('should not allow matches if test path is shorter than allowed path but is a prefix', () => {
    // This is effectively testing that "/mnt/c" is not allowed by "/mnt/c/foo"
    expect(isWslPathAllowed('/mnt/c', ['/mnt/c/foo'])).toBe(false);
  });

  it('should not allow subdirectory matches if not starting exactly with allowed path + /', () => {
    expect(isWslPathAllowed('/mnt/c/foobar', ['/mnt/c/foo'])).toBe(false);
  });

  it('should not allow matches based on different base paths', () => {
    expect(isWslPathAllowed('/mnt/d/foo', ['/mnt/c/foo'])).toBe(false);
  });

  it('should allow access to any path if root is allowed', () => {
    expect(isWslPathAllowed('/foo', ['/'])).toBe(true);
    expect(isWslPathAllowed('/mnt/c/some/deep/path', ['/'])).toBe(true);
  });

  it('should allow exact match if root is allowed and root is tested', () => {
    expect(isWslPathAllowed('/', ['/'])).toBe(true);
  });

  it('should pick the correct path from multiple allowed paths', () => {
    expect(isWslPathAllowed('/mnt/c/myapp/data', ['/home/user', '/mnt/c/myapp'])).toBe(true);
    expect(isWslPathAllowed('/home/user/config', ['/home/user', '/mnt/c/myapp'])).toBe(true);
  });

  it('should not allow paths not covered by multiple allowed paths', () => {
    expect(isWslPathAllowed('/srv/data', ['/home/user', '/mnt/c/myapp'])).toBe(false);
  });

  it('should correctly handle path normalization for testPath (e.g., ../, ./)', () => {
    expect(isWslPathAllowed('/mnt/c/foo/../bar', ['/mnt/c/bar'])).toBe(true); // /mnt/c/bar is allowed by /mnt/c/bar
    expect(isWslPathAllowed('/mnt/c/foo/./bar', ['/mnt/c/foo/bar'])).toBe(true); // /mnt/c/foo/bar is allowed by /mnt/c/foo/bar
  });

  it('should correctly handle path normalization for allowedPath (e.g., ../, ./)', () => {
    expect(isWslPathAllowed('/mnt/c/bar', ['/mnt/c/foo/../bar'])).toBe(true);
    expect(isWslPathAllowed('/mnt/c/foo/bar', ['/mnt/c/foo/./bar'])).toBe(true);
  });

  it('should return false for empty allowedPaths array', () => {
    expect(isWslPathAllowed('/mnt/c/foo', [])).toBe(false);
  });

  it('should return false if testPath is empty string', () => {
    expect(isWslPathAllowed('', ['/mnt/c/foo'])).toBe(false);
  });

  it('should correctly handle test path being a parent of an allowed path', () => {
    expect(isWslPathAllowed('/mnt/c/foo', ['/mnt/c/foo/bar'])).toBe(false);
  });

  it('should differentiate between /mnt/c/foo and /mnt/c/foobar', () => {
    const allowedPaths = ['/mnt/c/foo'];
    expect(isWslPathAllowed('/mnt/c/foo', allowedPaths)).toBe(true);
    expect(isWslPathAllowed('/mnt/c/foo/bar', allowedPaths)).toBe(true);
    expect(isWslPathAllowed('/mnt/c/foobar', allowedPaths)).toBe(false);
    expect(isWslPathAllowed('/mnt/c/foobar/baz', allowedPaths)).toBe(false);
  });

});
