import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, DEFAULT_CONFIG, getResolvedShellConfig } from '../src/utils/config.js';
import { ServerConfig } from '../src/types/config.js';

describe('Config Normalization', () => {
  const createTempConfig = (config: Partial<ServerConfig>): string => {
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
      global: {
        paths: { allowedPaths: inputPaths },
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    });

    const cfg = loadConfig(configPath);
    const normalized = cfg.global.paths.allowedPaths;

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
      global: {
        security: {
          maxCommandLength: 500,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        paths: {
          allowedPaths: ['C:\\Custom\\Path']
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    };

    const configPath = createTempConfig(partialConfig);
    const cfg = loadConfig(configPath);

    expect(cfg.global.security.maxCommandLength).toBe(500);
    expect(cfg.global.paths.allowedPaths).toContain('c:\\custom\\path');

    expect(cfg.global.restrictions.blockedCommands).toEqual(DEFAULT_CONFIG.global.restrictions.blockedCommands);
    expect(cfg.global.security.commandTimeout).toBe(DEFAULT_CONFIG.global.security.commandTimeout);
    expect(cfg.global.security.enableInjectionProtection).toBe(DEFAULT_CONFIG.global.security.enableInjectionProtection);

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('minimal config only includes specified shells', () => {
    const partialConfig = {
      global: {
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        paths: {
          allowedPaths: []
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      },
      shells: {
        gitbash: {
          enabled: true,
          executable: {
            command: "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
            args: []
          }
        }
      }
    };

    const configPath = createTempConfig(partialConfig);
    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('gitbash');
    expect(cfg.shells).not.toHaveProperty('powershell');
    expect(cfg.shells).not.toHaveProperty('cmd');
    expect(cfg.shells).not.toHaveProperty('wsl');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('empty shells config results in no shells', () => {
    const configPath = createTempConfig({
      global: {
        paths: { allowedPaths: ['C\\test'] },
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    });

    const cfg = loadConfig(configPath);

    expect(Object.keys(cfg.shells)).toHaveLength(0);

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('multiple shells config includes only specified shells', () => {
    const partialConfig = {
      global: {
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        paths: {
          allowedPaths: []
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      },
      shells: {
        powershell: { 
          enabled: false,
          executable: {
            command: "powershell.exe",
            args: []
          }
        },
        cmd: { 
          enabled: true,
          executable: {
            command: "cmd.exe",
            args: ["/c"]
          }
        }
      }
    };

    const configPath = createTempConfig(partialConfig);
    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('powershell');
    expect(cfg.shells).toHaveProperty('cmd');
    expect(cfg.shells).not.toHaveProperty('gitbash');
    expect(cfg.shells).not.toHaveProperty('wsl');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('includeDefaultWSL setting is ignored (deprecated)', () => {
    const configPath = createTempConfig({
      global: {
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: true,
          // @ts-ignore - testing deprecated property
          includeDefaultWSL: true
        },
        paths: {
          allowedPaths: ['C\\test']
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).not.toHaveProperty('wsl');
    expect(cfg.global.security).not.toHaveProperty('includeDefaultWSL');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});

describe('Shell Config Resolution', () => {
  test('getResolvedShellConfig properly merges global and shell-specific settings', () => {
    const config: ServerConfig = {
      global: {
        security: {
          restrictWorkingDirectory: true,
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 30000
        },
        restrictions: {
          blockedCommands: ['rm', 'del'],
          blockedArguments: [],
          blockedOperators: []
        },
        paths: {
          allowedPaths: ['c:\\global\\path']
        }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          },
          overrides: {
            restrictions: {
              blockedCommands: ['format']
            },
            paths: {
              allowedPaths: ['c:\\cmd\\specific']
            }
          }
        }
      }
    };
    
    const resolved = getResolvedShellConfig(config, 'cmd');
    expect(resolved).not.toBeNull();
    
    // Should override the global blockedCommands
    expect(resolved!.restrictions.blockedCommands).toEqual(['format']);
    
    // Should override allowedPaths
    expect(resolved!.paths.allowedPaths).toEqual(['c:\\cmd\\specific']);
    
    // Should inherit other properties
    expect(resolved!.security.restrictWorkingDirectory).toBe(true);
    expect(resolved!.security.maxCommandLength).toBe(1000);
    expect(resolved!.restrictions.blockedOperators).toEqual([]);
  });

  test('getResolvedShellConfig falls back to global settings when shell-specific are not provided', () => {
    const config: ServerConfig = {
      global: {
        security: {
          restrictWorkingDirectory: true,
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 30000
        },
        restrictions: {
          blockedCommands: ['rm', 'del'],
          blockedArguments: [],
          blockedOperators: []
        },
        paths: {
          allowedPaths: ['c:\\global\\path']
        }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          }
        }
      }
    };
    
    const resolved = getResolvedShellConfig(config, 'cmd');
    expect(resolved).not.toBeNull();
    
    // Should inherit all global properties
    expect(resolved!.restrictions.blockedCommands).toEqual(['rm', 'del']);
    expect(resolved!.paths.allowedPaths).toEqual(['c:\\global\\path']);
    expect(resolved!.security.restrictWorkingDirectory).toBe(true);
    expect(resolved!.security.maxCommandLength).toBe(1000);
    expect(resolved!.restrictions.blockedOperators).toEqual([]);
  });

  test('getResolvedShellConfig handles WSL shell configuration correctly', () => {
    const config: ServerConfig = {
      global: {
        security: {
          restrictWorkingDirectory: true,
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 30000
        },
        restrictions: {
          blockedCommands: ['rm', 'del'],
          blockedArguments: [],
          blockedOperators: []
        },
        paths: {
          allowedPaths: ['c:\\global\\path']
        }
      },
      shells: {
        wsl: {
          enabled: true,
          executable: {
            command: 'wsl.exe',
            args: []
          },
          wslConfig: {
            mountPoint: '/mnt/',
            inheritGlobalPaths: true
          },
          overrides: {
            paths: {
              allowedPaths: ['/home/user']
            }
          }
        }
      }
    };
    
    const resolved = getResolvedShellConfig(config, 'wsl');
    expect(resolved).not.toBeNull();
    
    // Should have WSL-specific configuration
    expect(resolved!.wslConfig).toBeDefined();
    expect(resolved!.wslConfig?.mountPoint).toBe('/mnt/');
    expect(resolved!.wslConfig?.inheritGlobalPaths).toBe(true);
    
    // Should have WSL-specific allowed paths
    expect(resolved!.paths.allowedPaths).toContain('/home/user');
    
    // Should have inherited security settings
    expect(resolved!.security.restrictWorkingDirectory).toBe(true);
  });
});
