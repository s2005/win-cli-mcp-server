import { describe, expect, test } from '@jest/globals';
import { loadConfig } from '../src/utils/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const createTempConfig = (config: any): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-shell-test-'));
  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
};

describe('Conditional Shell Configuration', () => {
  test('WSL only included with explicit shells.wsl configuration', () => {
    const configPath = createTempConfig({
      shells: {
        wsl: { enabled: true }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('wsl');
    expect(cfg.shells.wsl?.enabled).toBe(true);
    expect(cfg.shells).not.toHaveProperty('powershell');
    expect(cfg.shells).not.toHaveProperty('cmd');
    expect(cfg.shells).not.toHaveProperty('gitbash');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('backward compatibility with full shell specification', () => {
    const configPath = createTempConfig({
      shells: {
        powershell: { enabled: true },
        cmd: { enabled: true },
        gitbash: { enabled: true },
        wsl: { enabled: true }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('powershell');
    expect(cfg.shells).toHaveProperty('cmd');
    expect(cfg.shells).toHaveProperty('gitbash');
    expect(cfg.shells).toHaveProperty('wsl');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('shell validatePath and blockedOperators properly assigned', () => {
    const configPath = createTempConfig({
      shells: {
        gitbash: { enabled: true }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells.gitbash?.validatePath).toBeDefined();
    expect(cfg.shells.gitbash?.blockedOperators).toBeDefined();
    expect(cfg.shells.gitbash?.blockedOperators).toEqual(['&', '|', ';', '`']);

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});
