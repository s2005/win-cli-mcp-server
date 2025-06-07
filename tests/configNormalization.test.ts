import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, DEFAULT_CONFIG } from '../src/utils/config.js';

describe('Config Normalization', () => {
  const createTempConfig = (config: any): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-test-'));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  };

  test.each([
    [
      ['C:\\SomeFolder\\Test', '/c/other/PATH', 'C:/Another/Folder', '/mnt/d/Incorrect/Path'],
      ['c:\\somefolder\\test', 'c:\\other\\path', 'c:\\another\\folder', '/mnt/d/incorrect/path']
    ],
    [
      ['D:\\Work\\Project', '\\\\server\\share', '/e/temp'],
      ['d:\\work\\project', '\\\\server\\share', 'e:\\temp']
    ],
    [
      ['/mnt/c/linux/style', '/home/user', 'C:\\Windows\\Path'],
      ['/mnt/c/linux/style', '/home/user', 'c:\\windows\\path']
    ],
  ])('loadConfig normalizes paths %j to %j', (inputPaths, expectedPaths) => {
    const configPath = createTempConfig({
      security: { allowedPaths: inputPaths }
    });

    const cfg = loadConfig(configPath);
    const normalized = cfg.security.allowedPaths;

    expectedPaths.forEach((expectedPath, index) => {
      if (expectedPath.startsWith('/mnt/') || expectedPath.startsWith('/home/')) {
        expect(normalized[index]).toBe(expectedPath);
      } else {
        expect(normalized[index]).toBe(expectedPath); // Changed from path.normalize(expectedPath)
      }
    });

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('loadConfig merges with defaults correctly', () => {
    const partialConfig = {
      security: {
        maxCommandLength: 500,
        allowedPaths: ['C:\\Custom\\Path']
      }
    };

    const configPath = createTempConfig(partialConfig);
    const cfg = loadConfig(configPath);

    expect(cfg.security.maxCommandLength).toBe(500);
    expect(cfg.security.allowedPaths).toContain('c:\\custom\\path');

    expect(cfg.security.blockedCommands).toEqual(DEFAULT_CONFIG.security.blockedCommands);
    expect(cfg.security.commandTimeout).toBe(DEFAULT_CONFIG.security.commandTimeout);
    expect(cfg.security.enableInjectionProtection).toBe(DEFAULT_CONFIG.security.enableInjectionProtection);

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});
