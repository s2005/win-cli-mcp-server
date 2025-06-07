import { DEFAULT_CONFIG } from '../../src/utils/config';

describe('Default WSL configuration', () => {
  test('has inheritGlobalPaths true', () => {
    expect(DEFAULT_CONFIG.shells.wsl?.inheritGlobalPaths).toBe(true);
  });

  test('wslMountPoint default', () => {
    expect(DEFAULT_CONFIG.shells.wsl?.wslMountPoint).toBe('/mnt/');
  });
});
