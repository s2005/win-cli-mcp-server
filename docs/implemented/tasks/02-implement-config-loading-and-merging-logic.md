# Task: Implement Configuration Loading and Merging Logic

## Overview and Problem Statement

With the new inheritance-based configuration structure defined in Task 01, we need to implement the logic to load configurations and properly merge global defaults with shell-specific overrides. This enables the new flexible configuration system.

### Current Issues

- Configuration loader only handles flat structure
- No mechanism to merge global settings with shell overrides
- Array merging strategy (append vs replace) is not defined

## Technical Implementation Details

### 1. Implement Configuration Merger

Create `src/utils/configMerger.ts`:

```typescript
import type {
  GlobalConfig,
  ShellOverrides,
  ResolvedShellConfig,
  BaseShellConfig,
  WslShellConfig,
  GlobalSecurityConfig,
  GlobalRestrictionsConfig,
  GlobalPathsConfig
} from '../types/config.js';
import { isWslShellConfig } from './configTypes.js';

/**
 * Deep merge two objects, with source overriding target
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] === undefined) continue;
    
    if (typeof source[key] === 'object' && 
        source[key] !== null && 
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])) {
      // Recursively merge objects
      result[key] = deepMerge(target[key] as any, source[key] as any);
    } else {
      // Direct assignment for primitives and arrays
      result[key] = source[key] as any;
    }
  }
  
  return result;
}

/**
 * Merge arrays based on strategy
 */
export type ArrayMergeStrategy = 'replace' | 'append' | 'prepend' | 'union';

function mergeArrays<T>(target: T[], source: T[], strategy: ArrayMergeStrategy): T[] {
  switch (strategy) {
    case 'replace':
      return [...source];
    case 'append':
      return [...target, ...source];
    case 'prepend':
      return [...source, ...target];
    case 'union':
      return Array.from(new Set([...target, ...source]));
    default:
      return source;
  }
}

/**
 * Merge restrictions with specific strategies
 */
function mergeRestrictions(
  global: GlobalRestrictionsConfig,
  overrides: Partial<GlobalRestrictionsConfig>
): GlobalRestrictionsConfig {
  return {
    blockedCommands: overrides.blockedCommands !== undefined
      ? mergeArrays(global.blockedCommands, overrides.blockedCommands, 'append')
      : global.blockedCommands,
    blockedArguments: overrides.blockedArguments !== undefined
      ? mergeArrays(global.blockedArguments, overrides.blockedArguments, 'append')
      : global.blockedArguments,
    blockedOperators: overrides.blockedOperators !== undefined
      ? overrides.blockedOperators // Replace for operators
      : global.blockedOperators
  };
}

/**
 * Merge path configurations
 */
function mergePaths(
  global: GlobalPathsConfig,
  overrides: Partial<GlobalPathsConfig>
): GlobalPathsConfig {
  return {
    allowedPaths: overrides.allowedPaths !== undefined
      ? overrides.allowedPaths // Replace paths entirely for shell-specific needs
      : global.allowedPaths,
    initialDir: overrides.initialDir !== undefined
      ? overrides.initialDir
      : global.initialDir
  };
}

/**
 * Resolve final configuration for a shell by merging global and overrides
 */
export function resolveShellConfiguration(
  global: GlobalConfig,
  shell: BaseShellConfig | WslShellConfig
): ResolvedShellConfig {
  const overrides = shell.overrides || {};
  
  const resolved: ResolvedShellConfig = {
    enabled: shell.enabled,
    executable: shell.executable,
    security: overrides.security 
      ? deepMerge(global.security, overrides.security)
      : global.security,
    restrictions: overrides.restrictions
      ? mergeRestrictions(global.restrictions, overrides.restrictions)
      : global.restrictions,
    paths: overrides.paths
      ? mergePaths(global.paths, overrides.paths)
      : global.paths,
    validatePath: shell.validatePath
  };

  // Add WSL config if present
  if (isWslShellConfig(shell)) {
    resolved.wslConfig = shell.wslConfig;
  }

  return resolved;
}

/**
 * Apply WSL path inheritance if configured
 */
export function applyWslPathInheritance(
  resolved: ResolvedShellConfig,
  globalPaths: string[]
): ResolvedShellConfig {
  if (!resolved.wslConfig || !resolved.wslConfig.inheritGlobalPaths) {
    return resolved;
  }

  const mountPoint = resolved.wslConfig.mountPoint || '/mnt/';
  const convertedPaths: string[] = [];

  // Convert Windows paths to WSL format
  for (const path of globalPaths) {
    if (path.match(/^[A-Z]:\\/i)) {
      const drive = path[0].toLowerCase();
      const rest = path.substring(2).replace(/\\/g, '/');
      convertedPaths.push(`${mountPoint}${drive}${rest}`);
    }
  }

  // Merge with existing WSL paths (union to avoid duplicates)
  resolved.paths.allowedPaths = Array.from(new Set([
    ...resolved.paths.allowedPaths,
    ...convertedPaths
  ]));

  return resolved;
}
```

### 2. Update Configuration Loader

Update `src/utils/config.ts` (key changes only):

```typescript
import { resolveShellConfiguration, applyWslPathInheritance } from './configMerger.js';
import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

// Update DEFAULT_CONFIG to new format
export const DEFAULT_CONFIG: ServerConfig = {
  global: {
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['format', 'shutdown', 'restart'],
      blockedArguments: ['--exec', '-e', '/c', '-enc', '-encodedcommand', '--system'],
      blockedOperators: ['&', '|', ';', '`']
    },
    paths: {
      allowedPaths: [os.homedir(), process.cwd()],
      initialDir: undefined
    }
  },
  shells: {
    powershell: {
      enabled: true,
      executable: {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command']
      },
      validatePath: (dir: string) => /^[a-zA-Z]:\\/.test(dir)
    },
    cmd: {
      enabled: true,
      executable: {
        command: 'cmd.exe',
        args: ['/c']
      },
      validatePath: (dir: string) => /^[a-zA-Z]:\\/.test(dir),
      overrides: {
        restrictions: {
          blockedCommands: ['del', 'rd', 'rmdir']
        }
      }
    },
    gitbash: {
      enabled: true,
      executable: {
        command: 'C:\\Program Files\\Git\\bin\\bash.exe',
        args: ['-c']
      },
      validatePath: (dir: string) => /^([a-zA-Z]:\\|\/[a-z]\/)/.test(dir),
      overrides: {
        restrictions: {
          blockedCommands: ['rm']
        }
      }
    }
  }
};

export function loadConfig(configPath?: string): ServerConfig {
  // ... existing file loading logic ...
  
  const config = loadedConfig as ServerConfig;
  
  // Validate and process paths
  if (config.global.paths.initialDir) {
    const normalizedInitialDir = normalizeWindowsPath(config.global.paths.initialDir);
    if (fs.existsSync(normalizedInitialDir) && fs.statSync(normalizedInitialDir).isDirectory()) {
      config.global.paths.initialDir = normalizedInitialDir;
      if (config.global.security.restrictWorkingDirectory) {
        if (!config.global.paths.allowedPaths.includes(normalizedInitialDir)) {
          config.global.paths.allowedPaths.push(normalizedInitialDir);
        }
      }
    } else {
      console.warn(`WARN: Configured initialDir '${config.global.paths.initialDir}' does not exist.`);
      config.global.paths.initialDir = undefined;
    }
  }
  
  // Normalize allowed paths
  config.global.paths.allowedPaths = normalizeAllowedPaths(
    config.global.paths.allowedPaths
  );
  
  return config;
}

/**
 * Get resolved configuration for a specific shell
 */
export function getResolvedShellConfig(
  config: ServerConfig,
  shellName: keyof ServerConfig['shells']
): ResolvedShellConfig | null {
  const shell = config.shells[shellName];
  if (!shell || !shell.enabled) {
    return null;
  }
  
  let resolved = resolveShellConfiguration(config.global, shell);
  
  // Special handling for WSL path inheritance
  if (shellName === 'wsl' && resolved.wslConfig) {
    resolved = applyWslPathInheritance(resolved, config.global.paths.allowedPaths);
  }
  
  return resolved;
}
```

## Working Examples

### Example: Shell Configuration Resolution

Given global config and shell with overrides:

```typescript
const resolved = resolveShellConfiguration(config.global, config.shells.wsl);
// Result:
{
  enabled: true,
  executable: { command: 'wsl.exe', args: ['-e'] },
  security: {
    maxCommandLength: 1500,
    commandTimeout: 120,  // Overridden
    enableInjectionProtection: true,
    restrictWorkingDirectory: true
  },
  restrictions: {
    blockedCommands: ['rm', 'format', 'dd'],  // Appended
    blockedArguments: ['--force'],
    blockedOperators: ['&', '|', ';']  // Replaced
  },
  paths: {
    allowedPaths: ['/home/user', '/tmp'],  // Replaced
    initialDir: '/home/user'  // Overridden
  }
}
```

## Unit Test Requirements

### 1. Create `tests/utils/configMerger.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { resolveShellConfiguration, applyWslPathInheritance } from '../../src/utils/configMerger';
import type { GlobalConfig, BaseShellConfig, WslShellConfig, ResolvedShellConfig } from '../../src/types/config';

describe('Config Merger', () => {
  const mockGlobal: GlobalConfig = {
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['format'],
      blockedArguments: ['--system'],
      blockedOperators: ['&', '|']
    },
    paths: {
      allowedPaths: ['C:\\Users'],
      initialDir: 'C:\\Users\\Default'
    }
  };

  describe('resolveShellConfiguration', () => {
    test('returns global config when no overrides', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.security).toEqual(mockGlobal.security);
      expect(resolved.restrictions).toEqual(mockGlobal.restrictions);
      expect(resolved.paths).toEqual(mockGlobal.paths);
    });

    test('merges security overrides', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          security: {
            commandTimeout: 60,
            maxCommandLength: 3000
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.security.commandTimeout).toBe(60);
      expect(resolved.security.maxCommandLength).toBe(3000);
      expect(resolved.security.enableInjectionProtection).toBe(true); // Unchanged
    });

    test('appends blocked commands and arguments', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          restrictions: {
            blockedCommands: ['del', 'rd'],
            blockedArguments: ['--force']
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.restrictions.blockedCommands).toEqual(['format', 'del', 'rd']);
      expect(resolved.restrictions.blockedArguments).toEqual(['--system', '--force']);
    });

    test('replaces blocked operators', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'bash.exe', args: ['-c'] },
        overrides: {
          restrictions: {
            blockedOperators: ['&', '|', ';', '`']
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.restrictions.blockedOperators).toEqual(['&', '|', ';', '`']);
    });

    test('replaces paths entirely', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        overrides: {
          paths: {
            allowedPaths: ['/home/user', '/tmp'],
            initialDir: '/home/user'
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.paths.allowedPaths).toEqual(['/home/user', '/tmp']);
      expect(resolved.paths.initialDir).toBe('/home/user');
    });

    test('preserves WSL config', () => {
      const wslShell: WslShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, wslShell);
      
      expect(resolved.wslConfig).toEqual({
        mountPoint: '/mnt/',
        inheritGlobalPaths: true
      });
    });
  });

  describe('applyWslPathInheritance', () => {
    test('converts and merges Windows paths for WSL', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: ['/home/user'],
          initialDir: '/home/user'
        },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };

      const globalPaths = ['C:\\Users', 'D:\\Projects', '/already/unix'];
      const updated = applyWslPathInheritance(resolved, globalPaths);
      
      expect(updated.paths.allowedPaths).toContain('/home/user');
      expect(updated.paths.allowedPaths).toContain('/mnt/c/Users');
      expect(updated.paths.allowedPaths).toContain('/mnt/d/Projects');
      expect(updated.paths.allowedPaths).not.toContain('/already/unix'); // Non-Windows paths not converted
    });

    test('does not inherit when disabled', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: ['/home/user']
        },
        wslConfig: {
          inheritGlobalPaths: false
        }
      };

      const globalPaths = ['C:\\Users', 'D:\\Projects'];
      const updated = applyWslPathInheritance(resolved, globalPaths);
      
      expect(updated.paths.allowedPaths).toEqual(['/home/user']);
    });

    test('handles custom mount points', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: []
        },
        wslConfig: {
          mountPoint: '/wsl/',
          inheritGlobalPaths: true
        }
      };

      const globalPaths = ['C:\\Test'];
      const updated = applyWslPathInheritance(resolved, globalPaths);
      
      expect(updated.paths.allowedPaths).toContain('/wsl/c/Test');
    });
  });
});
```

### 2. Update Existing Tests

Any tests that create or use configurations need to be updated to use the new format.

## Documentation Updates

### 1. Update Configuration Examples

Update `config.sample.json`:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        "format",
        "shutdown",
        "restart",
        "reg",
        "regedit",
        "net",
        "netsh",
        "takeown",
        "icacls"
      ],
      "blockedArguments": [
        "--exec",
        "-e",
        "/c",
        "-enc",
        "-encodedcommand",
        "-command",
        "--interactive",
        "-i",
        "--login",
        "--system"
      ],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\YourUsername", "C:\\Projects"],
      "initialDir": "C:\\Users\\YourUsername"
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": ["del", "rd", "rmdir"]
        }
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": ["rm", "chmod"],
          "blockedOperators": ["&", "|", ";", "`", "$(", "||", "&&"]
        }
      }
    },
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true
      },
      "overrides": {
        "security": {
          "commandTimeout": 120
        },
        "restrictions": {
          "blockedCommands": ["rm -rf /", "dd", "mkfs"]
        },
        "paths": {
          "allowedPaths": ["/home", "/tmp", "/mnt/c/Users"],
          "initialDir": "/home/username"
        }
      }
    }
  }
}
```

### 2. Create `docs/CONFIG_MERGING.md`

```markdown
# Configuration Merging Behavior

## Overview

The inheritance-based configuration system allows global defaults to be overridden by shell-specific settings.

## Merge Strategies

### Security Settings
- **Strategy**: Deep merge
- **Behavior**: Shell overrides replace individual properties
- **Example**: 
  ```json
  // Global: commandTimeout: 30
  // Shell override: commandTimeout: 60
  // Result: commandTimeout: 60
  ```

### Restrictions

#### Blocked Commands

- **Strategy**: Append
- **Behavior**: Shell commands are added to global list
- **Example**:

  ```json
  // Global: ["format", "shutdown"]
  // Shell override: ["del", "rd"]
  // Result: ["format", "shutdown", "del", "rd"]
  ```

#### Blocked Arguments

- **Strategy**: Append
- **Behavior**: Shell arguments are added to global list

#### Blocked Operators

- **Strategy**: Replace
- **Behavior**: Shell operators completely replace global list
- **Example**:

  ```json
  // Global: ["&", "|"]
  // Shell override: ["&", "|", ";", "`"]
  // Result: ["&", "|", ";", "`"]
  ```

### Paths

- **Strategy**: Replace
- **Behavior**: Shell paths completely replace global paths
- **Rationale**: Different shells use different path formats

## Special Cases

### WSL Path Inheritance

When `wslConfig.inheritGlobalPaths` is true:

1. Windows paths from global config are converted to WSL format
2. Converted paths are merged with shell-specific paths
3. Duplicates are removed

Example:

```json
// Global paths: ["C:\\Users", "D:\\Projects"]
// WSL override paths: ["/home/user"]
// WSL mount point: "/mnt/"
// Result: ["/home/user", "/mnt/c/Users", "/mnt/d/Projects"]
```

## Implementation Phases

### Phase 1: Core Implementation

1. Implement configuration merger with array strategies
2. Update configuration loader to handle new format

### Phase 2: Testing

1. Test all merge strategies
2. Test WSL path inheritance
3. Validate configuration loading

### Phase 3: Integration

1. Update main configuration loading flow
2. Add resolved configuration getter
3. Update configuration validation

## Acceptance Criteria

### Functional Requirements

- [ ] Global settings are properly merged with shell overrides
- [ ] Array merge strategies work as specified (append for commands/args, replace for operators/paths)
- [ ] WSL path inheritance converts and merges paths correctly
- [ ] Configuration validation works with new structure

### Technical Requirements

- [ ] Type-safe configuration merging
- [ ] Efficient merging without deep cloning issues
- [ ] Proper handling of undefined/null values in overrides

### Testing Requirements

- [ ] 100% test coverage for merge strategies
- [ ] Tests for all edge cases (empty arrays, undefined values)
- [ ] Tests for WSL-specific path inheritance
- [ ] Integration tests with full configurations

### Documentation Requirements

- [ ] config.sample.json updated to new format
- [ ] Merge behavior documented clearly
- [ ] Code comments explain merge strategies

## Risk Assessment

### Technical Risks

1. **Risk**: Complex merge logic may have bugs
   - **Mitigation**: Comprehensive unit testing with edge cases

2. **Risk**: Performance impact from deep merging
   - **Mitigation**: Optimize merge operations, avoid unnecessary clones

3. **Risk**: Array merge strategies may confuse users
   - **Mitigation**: Clear documentation with examples
