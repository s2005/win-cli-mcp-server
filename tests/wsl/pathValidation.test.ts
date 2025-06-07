import { isWslPathAllowed, resolveWslAllowedPaths } from '../../src/utils/validation';
import { ShellConfig } from '../../src/types/config';

describe('WSL path validation', () => {
  const wslConfig: ShellConfig = {
    enabled: true,
    command: 'wsl.exe',
    args: ['-e'],
    blockedOperators: [],
    allowedPaths: ['/home/user'],
    wslMountPoint: '/mnt/',
    inheritGlobalPaths: true
  };

  test('direct allowed path', () => {
    expect(isWslPathAllowed('/home/user/project', ['/home/user'])).toBe(true);
  });

  test('resolve global paths', () => {
    const global = ['C:\\mcp'];
    const resolved = resolveWslAllowedPaths(global, wslConfig);
    expect(resolved).toContain('/mnt/c/mcp');
    expect(resolved).toContain('/home/user');
  });
});
