# Task: Update Existing Tests for New Configuration Structure

## Overview and Problem Statement

All existing unit tests are written for the flat configuration structure. With the new inheritance-based configuration, these tests need to be updated to work with the new configuration format while maintaining the same test coverage and ensuring no functionality is lost.

### Current Issues

- Tests create configurations using old `security` top-level structure
- Test helpers like `buildTestConfig` return old format
- Mock configurations in tests use flat structure
- Tests directly access `config.security` instead of resolved shell configs
- No tests validate the new inheritance and override behavior

## Technical Implementation Details

### 1. Update Test Helper Utilities

Update `tests/helpers/testUtils.ts`:

```typescript
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { 
  ServerConfig, 
  GlobalConfig,
  BaseShellConfig, 
  WslShellConfig,
  ShellOverrides 
} from '../../src/types/config.js';

/**
 * Build a test configuration with the new structure
 */
export function buildTestConfig(overrides: DeepPartial<ServerConfig> = {}): ServerConfig {
  const config: ServerConfig = {
    global: {
      security: {
        maxCommandLength: 2000,
        commandTimeout: 30,
        enableInjectionProtection: true,
        restrictWorkingDirectory: true,
        ...overrides.global?.security
      },
      restrictions: {
        blockedCommands: ['format', 'shutdown'],
        blockedArguments: ['--system'],
        blockedOperators: ['&', '|', ';', '`'],
        ...overrides.global?.restrictions
      },
      paths: {
        allowedPaths: ['/test/default'],
        initialDir: undefined,
        ...overrides.global?.paths
      }
    },
    shells: {
      ...overrides.shells
    }
  };

  return config;
}

/**
 * Build a minimal shell configuration for testing
 */
export function buildShellConfig(
  shellType: 'base' | 'wsl' = 'base',
  overrides: Partial<BaseShellConfig | WslShellConfig> = {}
): BaseShellConfig | WslShellConfig {
  const base: BaseShellConfig = {
    enabled: true,
    executable: {
      command: 'test.exe',
      args: ['/c'],
      ...overrides.executable
    },
    overrides: overrides.overrides,
    validatePath: overrides.validatePath
  };

  if (shellType === 'wsl' && 'wslConfig' in overrides) {
    return {
      ...base,
      wslConfig: overrides.wslConfig
    } as WslShellConfig;
  }

  return base;
}

/**
 * Helper type for deep partial
 */
type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;
```

### 2. Update Mock Server Classes

Update `tests/helpers/MockCLIServer.ts`:

```typescript
import { ServerConfig, ResolvedShellConfig } from '../../src/types/config.js';
import { getResolvedShellConfig } from '../../src/utils/config.js';
import { createValidationContext } from '../../src/utils/validationContext.js';

export class MockCLIServer {
  private resolvedConfigs: Map<string, ResolvedShellConfig> = new Map();
  
  constructor(public config: ServerConfig) {
    // Pre-resolve all shell configurations
    for (const [shellName, shellConfig] of Object.entries(config.shells)) {
      if (shellConfig?.enabled) {
        const resolved = getResolvedShellConfig(config, shellName as keyof ServerConfig['shells']);
        if (resolved) {
          this.resolvedConfigs.set(shellName, resolved);
        }
      }
    }
  }

  getResolvedConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  validateCommand(shellName: string, command: string, workingDir: string): void {
    const resolved = this.getResolvedConfig(shellName);
    if (!resolved) {
      throw new Error(`Shell ${shellName} not found or not enabled`);
    }

    const context = createValidationContext(shellName, resolved);
    // ... use context for validation
  }
}
```

### 3. Update Configuration Test Files

Update `tests/configNormalization.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';
import { loadConfig, DEFAULT_CONFIG } from '../src/utils/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Config Normalization', () => {
  const createTempConfig = (config: any): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-test-'));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  };

  test('loadConfig with new format preserves structure', () => {
    const newFormatConfig = {
      global: {
        security: {
          maxCommandLength: 1500,
          commandTimeout: 45,
          enableInjectionProtection: false,
          restrictWorkingDirectory: true
        },
        restrictions: {
          blockedCommands: ['custom'],
          blockedArguments: ['--dangerous'],
          blockedOperators: ['&&']
        },
        paths: {
          allowedPaths: ['C:\\Custom\\Path']
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

    const configPath = createTempConfig(newFormatConfig);
    const cfg = loadConfig(configPath);

    expect(cfg.global.security.maxCommandLength).toBe(1500);
    expect(cfg.global.restrictions.blockedCommands).toContain('custom');
    expect(cfg.shells.cmd?.executable.command).toBe('cmd.exe');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('path normalization works with new structure', () => {
    const config = {
      global: {
        security: DEFAULT_CONFIG.global.security,
        restrictions: DEFAULT_CONFIG.global.restrictions,
        paths: {
          allowedPaths: ['C:\\Test\\Path', '/c/another/path', 'D:/mixed/slashes']
        }
      },
      shells: {}
    };

    const configPath = createTempConfig(config);
    const cfg = loadConfig(configPath);

    // All paths should be normalized
    expect(cfg.global.paths.allowedPaths).toContain('c:\\test\\path');
    expect(cfg.global.paths.allowedPaths).toContain('c:\\another\\path');
    expect(cfg.global.paths.allowedPaths).toContain('d:\\mixed\\slashes');

    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});
```

### 4. Update Validation Tests

Update `tests/validation.test.ts` (key sections):

```typescript
import { createValidationContext } from '../src/utils/validationContext.js';
import { buildTestConfig, buildShellConfig } from './helpers/testUtils.js';
import type { ResolvedShellConfig } from '../src/types/config.js';

describe('Shell Operator Validation', () => {
  const createResolvedConfig = (blockedOperators: string[]): ResolvedShellConfig => ({
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: false
    },
    restrictions: {
      blockedCommands: [],
      blockedArguments: [],
      blockedOperators
    },
    paths: { allowedPaths: [] }
  });

  test('validateShellOperators blocks configured operators', () => {
    const resolved = createResolvedConfig(['&', ';']);
    const context = createValidationContext('cmd', resolved);
    
    expect(() => validateShellOperators('echo test & echo done', context))
      .toThrow(/blocked operator.*cmd.*&/);
    expect(() => validateShellOperators('echo test ; echo done', context))
      .toThrow(/blocked operator.*cmd.*;/);
    expect(() => validateShellOperators('echo test | grep done', context))
      .not.toThrow(); // | not blocked
  });
});

describe('Command Blocking with Context', () => {
  test('blocks commands based on resolved config', () => {
    const resolved: ResolvedShellConfig = {
      enabled: true,
      executable: { command: 'cmd.exe', args: ['/c'] },
      security: {
        maxCommandLength: 2000,
        commandTimeout: 30,
        enableInjectionProtection: true,
        restrictWorkingDirectory: false
      },
      restrictions: {
        blockedCommands: ['format', 'del', 'rd'],
        blockedArguments: [],
        blockedOperators: []
      },
      paths: { allowedPaths: [] }
    };
    
    const context = createValidationContext('cmd', resolved);
    
    expect(isCommandBlocked('del', context)).toBe(true);
    expect(isCommandBlocked('format', context)).toBe(true);
    expect(isCommandBlocked('dir', context)).toBe(false);
  });
});
```

### 5. Update Command Chain Tests

Update `tests/commandChain.test.ts`:

```typescript
import { MockCLIServer } from './helpers/MockCLIServer.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('Command Chain Validation', () => {
  test('validates chained commands with new config structure', () => {
    const config = buildTestConfig({
      global: {
        security: {
          restrictWorkingDirectory: true,
          enableInjectionProtection: false
        },
        restrictions: {
          blockedCommands: ['rm'],
          blockedArguments: ['--exec']
        },
        paths: {
          allowedPaths: ['/test/allowed']
        }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: { command: 'cmd.exe', args: ['/c'] }
        }
      }
    });

    const server = new MockCLIServer(config);
    
    // Should pass - cd within allowed path
    expect(() => {
      server.validateCommand('cmd', 'cd /test/allowed/sub && echo hi', '/test/allowed');
    }).not.toThrow();
    
    // Should fail - cd outside allowed path
    expect(() => {
      server.validateCommand('cmd', 'cd /other && echo hi', '/test/allowed');
    }).toThrow();
    
    // Should fail - blocked command
    expect(() => {
      server.validateCommand('cmd', 'cd /test/allowed && rm file.txt', '/test/allowed');
    }).toThrow(/blocked/i);
  });
});
```

### 6. Update Server Initialization Tests

Update `tests/serverCwdInitialization.test.ts`:

```typescript
import { CLIServer } from '../src/index.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('Server CWD Initialization', () => {
  test('initializes with new config structure', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\allowed');
    
    const config = buildTestConfig({
      global: {
        security: {
          restrictWorkingDirectory: true
        },
        paths: {
          allowedPaths: ['C:\\allowed']
        }
      },
      shells: {
        wsl: {
          enabled: true,
          executable: { command: 'wsl.exe', args: ['-e'] }
        }
      }
    });
    
    const server = new CLIServer(config);
    expect((server as any).serverActiveCwd).toBe('C:\\allowed');
    
    cwdSpy.mockRestore();
  });

  test('handles initialDir in new structure', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\other');
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    
    const config = buildTestConfig({
      global: {
        security: {
          restrictWorkingDirectory: true
        },
        paths: {
          allowedPaths: ['C:\\allowed'],
          initialDir: 'C:\\allowed'
        }
      }
    });
    
    const server = new CLIServer(config);
    expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed');
    expect((server as any).serverActiveCwd).toBe('C:\\allowed');
    
    chdirSpy.mockRestore();
    cwdSpy.mockRestore();
  });
});
```

### 7. Update Test Coverage

Update tests to cover:

- Configuration loading and validation
- Shell override merging behavior
- Validation context creation
- Resolved configuration generation
- WSL-specific configurations

## Working Examples

### Example: Updated Test Configuration

Before (Old):

```typescript
const config = {
  security: {
    maxCommandLength: 1000,
    blockedCommands: ['rm'],
    allowedPaths: ['C:\\test'],
    restrictWorkingDirectory: true,
    commandTimeout: 30,
    enableInjectionProtection: true
  },
  shells: {
    cmd: {
      enabled: true,
      command: 'cmd.exe',
      args: ['/c']
    }
  }
};
```

After (New Structure):

```typescript
const config = buildTestConfig({
  global: {
    security: {
      maxCommandLength: 1000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['rm']
    },
    paths: {
      allowedPaths: ['C:\\test']
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
});
```

### Example: Shell-Specific Test

```typescript
// Test that WSL uses its own paths, not global Windows paths
test('WSL uses shell-specific paths', () => {
  const config = buildTestConfig({
    global: {
      paths: {
        allowedPaths: ['C:\\Windows\\Path']
      }
    },
    shells: {
      wsl: {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        overrides: {
          paths: {
            allowedPaths: ['/home/user', '/tmp']
          }
        }
      }
    }
  });

  const server = new MockCLIServer(config);
  const wslResolved = server.getResolvedConfig('wsl');
  
  // WSL should use its override paths, not global Windows paths
  expect(wslResolved?.paths.allowedPaths).toEqual(['/home/user', '/tmp']);
  expect(wslResolved?.paths.allowedPaths).not.toContain('C:\\Windows\\Path');
});
```

## Unit Test Requirements

### 1. Update All Test Files

The following test files need updates:

- `tests/validation.test.ts` - Use validation context
- `tests/commandChain.test.ts` - Use new config structure
- `tests/commandSettings.test.ts` - Use resolved configs
- `tests/configNormalization.test.ts` - Test new config format
- `tests/serverCwdInitialization.test.ts` - New paths structure
- `tests/conditionalShells.test.ts` - New shell structure
- `tests/errorHandling.test.ts` - Updated error paths
- `tests/getConfig.test.ts` - New config format
- `tests/initialDirConfig.test.ts` - New paths location
- `tests/processManagement.test.ts` - Resolved configs
- `tests/asyncOperations.test.ts` - New config format
- `tests/directoryValidator.test.ts` - Use context
- `tests/wsl.test.ts` - WSL-specific config
- `tests/integration/*.test.ts` - All integration tests

### 2. Test Update Strategy

For each test file:

1. Replace `buildTestConfig` calls with new version
2. Update direct `config.security` access to use `config.global`
3. Add config resolution where needed
4. Create validation contexts for validation tests
5. Update assertions to match new structure

### 3. New Test Coverage

Add tests for:

- Configuration loading and validation
- Shell override merging behavior
- Validation context creation
- Resolved configuration generation
- WSL-specific configurations

## Documentation Updates

### 1. Update Test Documentation

Create `tests/TESTING_GUIDE.md`:

```markdown
# Testing Guide for New Configuration Structure

## Overview

Tests now use the inheritance-based configuration structure with global defaults and shell-specific overrides.

## Key Changes

### Configuration Creation

Use the updated `buildTestConfig` helper:
```typescript
const config = buildTestConfig({
  global: {
    security: { /* ... */ },
    restrictions: { /* ... */ },
    paths: { /* ... */ }
  },
  shells: { /* ... */ }
});
```

### Validation Testing

Create validation contexts for shell-specific validation:

```typescript
const resolved = getResolvedShellConfig(config, 'cmd');
const context = createValidationContext('cmd', resolved);
```

## Test Patterns

### Pattern 1: Testing Shell Overrides

```typescript
test('shell overrides global settings', () => {
  const config = buildTestConfig({
    global: { security: { commandTimeout: 30 } },
    shells: {
      wsl: {
        overrides: { security: { commandTimeout: 120 } }
      }
    }
  });
  
  const resolved = getResolvedShellConfig(config, 'wsl');
  expect(resolved.security.commandTimeout).toBe(120);
});
```

### Pattern 2: Testing Path Validation

```typescript
test('validates paths for specific shell', () => {
  const resolved = createResolvedConfig(/* ... */);
  const context = createValidationContext('wsl', resolved);
  
  expect(() => validateWorkingDirectory('/home/user', context))
    .not.toThrow();
});
```

### 2. Update Contributing Guide

Add to `CONTRIBUTING.md`:

## Testing with New Configuration Structure

When writing tests:

1. Use `buildTestConfig()` helper for new format configs
2. Create validation contexts for validation tests
3. Test both global defaults and shell overrides
4. Include comprehensive configuration tests

Example test structure:

```typescript
import { buildTestConfig } from './helpers/testUtils';
import { getResolvedShellConfig } from '../src/utils/config';

describe('My Feature', () => {
  test('works with new config', () => {
    const config = buildTestConfig({
      global: { /* ... */ },
      shells: { /* ... */ }
    });
    
    // Test implementation
  });
});
```

## Implementation Phases

### Phase 1: Update Test Infrastructure

1. Update test helper utilities
2. Update mock server classes
3. Create new test builders

### Phase 2: Update Core Tests

1. Update validation tests
2. Update configuration tests
3. Update command chain tests

### Phase 3: Update Integration Tests

1. Update all integration test configs
2. Update test assertions
3. Add comprehensive integration tests

### Phase 4: Add New Test Coverage

1. Add configuration validation tests
2. Add override behavior tests
3. Add validation context tests

## Acceptance Criteria

### Functional Requirements

- [ ] All existing tests pass with new configuration structure
- [ ] Test coverage remains at or above previous levels
- [ ] New inheritance behavior is properly tested
- [ ] Shell-specific validation is tested for each shell type

### Technical Requirements

- [ ] Test helpers use new configuration structure
- [ ] No hardcoded old configuration remains in tests
- [ ] Mock implementations use resolved configurations
- [ ] Validation tests use proper contexts
- [ ] Integration tests reflect real-world usage

### Testing Requirements

- [ ] All test files are updated
- [ ] New test files for configuration validation are created
- [ ] Test helpers have their own tests
- [ ] Edge cases are covered (empty configs, partial configs)
- [ ] Performance of tests is not significantly impacted

### Documentation Requirements

- [ ] Testing guide explains new patterns
- [ ] Contributing guide updated
- [ ] Test file comments explain structure
- [ ] Complex test scenarios are documented

## Risk Assessment

### Technical Risks

1. **Risk**: Missing test updates cause false failures
   - **Mitigation**: Systematic file-by-file update with checklist

2. **Risk**: Test helpers become too complex
   - **Mitigation**: Keep helpers focused and well-documented

3. **Risk**: Integration tests miss real issues
   - **Mitigation**: Test actual configuration scenarios end-to-end
