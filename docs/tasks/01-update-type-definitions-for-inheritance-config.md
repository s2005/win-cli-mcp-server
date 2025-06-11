# Task: Update Type Definitions for Inheritance-Based Configuration

## Overview and Problem Statement

The current configuration structure has all security settings at the global level, which doesn't allow for shell-specific customization. This causes issues where Windows-specific settings (like paths) are applied to Unix-based shells (like WSL), and vice versa. We need to update the TypeScript interfaces to support an inheritance-based configuration where shells can override global defaults.

### Current Issues

- Global `allowedPaths` uses Windows format but WSL needs Unix paths
- Command timeout is the same for all shells, but some shells need longer timeouts
- Blocked commands are global but should be shell-specific (e.g., `del` for Windows, `rm` for Unix)
- WSL-specific fields are mixed with general shell configuration

## Technical Implementation Details

### 1. Update `src/types/config.ts`

Replace the current interfaces with:

```typescript
// Global configuration that applies to all shells by default
export interface GlobalConfig {
  security: GlobalSecurityConfig;
  restrictions: GlobalRestrictionsConfig;
  paths: GlobalPathsConfig;
}

export interface GlobalSecurityConfig {
  maxCommandLength: number;
  commandTimeout: number;
  enableInjectionProtection: boolean;
  restrictWorkingDirectory: boolean;
}

export interface GlobalRestrictionsConfig {
  blockedCommands: string[];
  blockedArguments: string[];
  blockedOperators: string[];
}

export interface GlobalPathsConfig {
  allowedPaths: string[];
  initialDir?: string;
}

// Shell-specific overrides
export interface ShellOverrides {
  security?: Partial<GlobalSecurityConfig>;
  restrictions?: Partial<GlobalRestrictionsConfig>;
  paths?: Partial<GlobalPathsConfig>;
}

// Shell executable configuration
export interface ShellExecutableConfig {
  command: string;
  args: string[];
}

// Base shell configuration
export interface BaseShellConfig {
  enabled: boolean;
  executable: ShellExecutableConfig;
  overrides?: ShellOverrides;
  validatePath?: (dir: string) => boolean;
}

// WSL-specific configuration
export interface WslSpecificConfig {
  mountPoint?: string;
  inheritGlobalPaths?: boolean;
  pathMapping?: {
    enabled: boolean;
    windowsToWsl: boolean;
  };
}

// Extended WSL shell configuration
export interface WslShellConfig extends BaseShellConfig {
  wslConfig?: WslSpecificConfig;
}

// Main server configuration
export interface ServerConfig {
  global: GlobalConfig;
  shells: {
    powershell?: BaseShellConfig;
    cmd?: BaseShellConfig;
    gitbash?: BaseShellConfig;
    wsl?: WslShellConfig;
  };
}

// Resolved configuration after merging (used internally)
export interface ResolvedShellConfig {
  enabled: boolean;
  executable: ShellExecutableConfig;
  security: GlobalSecurityConfig;
  restrictions: GlobalRestrictionsConfig;
  paths: GlobalPathsConfig;
  validatePath?: (dir: string) => boolean;
  wslConfig?: WslSpecificConfig; // Only present for WSL
}

// For backward compatibility during migration
export interface LegacySecurityConfig {
  maxCommandLength: number;
  blockedCommands: string[];
  blockedArguments: string[];
  allowedPaths: string[];
  restrictWorkingDirectory: boolean;
  commandTimeout: number;
  enableInjectionProtection: boolean;
  initialDir?: string;
}

export interface LegacyShellConfig {
  enabled: boolean;
  command: string;
  args: string[];
  validatePath?: (dir: string) => boolean;
  blockedOperators?: string[];
  allowedPaths?: string[];
  wslMountPoint?: string;
  inheritGlobalPaths?: boolean;
}

export interface LegacyServerConfig {
  security: LegacySecurityConfig;
  shells: {
    powershell?: LegacyShellConfig;
    cmd?: LegacyShellConfig;
    gitbash?: LegacyShellConfig;
    wsl?: LegacyShellConfig;
  };
}
```

### 2. Create Type Guards and Utilities

Create `src/utils/configTypes.ts`:

```typescript
import { ServerConfig, LegacyServerConfig, BaseShellConfig, WslShellConfig } from '../types/config.js';

// Type guard to check if config is legacy format
export function isLegacyConfig(config: any): config is LegacyServerConfig {
  return config.security && !config.global;
}

// Type guard to check if shell is WSL with specific config
export function isWslShellConfig(shell: BaseShellConfig | WslShellConfig | undefined): shell is WslShellConfig {
  return shell !== undefined && 'wslConfig' in shell;
}

// Type guard for resolved shell config
export function hasWslConfig(config: any): config is { wslConfig: WslSpecificConfig } {
  return config && typeof config.wslConfig === 'object';
}
```

## Working Examples

### Example New Configuration Format

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
      "blockedCommands": ["format", "shutdown"],
      "blockedArguments": ["--system"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\default", "D:\\Projects"],
      "initialDir": "C:\\Users\\default"
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 60
        },
        "restrictions": {
          "blockedCommands": ["format", "del", "rd"]
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
        "inheritGlobalPaths": true,
        "pathMapping": {
          "enabled": true,
          "windowsToWsl": true
        }
      },
      "overrides": {
        "security": {
          "commandTimeout": 120
        },
        "paths": {
          "allowedPaths": ["/home/user", "/tmp", "/mnt/c/Users"],
          "initialDir": "/home/user"
        }
      }
    }
  }
}
```

## Unit Test Requirements

### 1. Create `tests/types/configTypes.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { isLegacyConfig, isWslShellConfig, hasWslConfig } from '../../src/utils/configTypes';
import type { ServerConfig, LegacyServerConfig, BaseShellConfig, WslShellConfig } from '../../src/types/config';

describe('Config Type Guards', () => {
  describe('isLegacyConfig', () => {
    test('identifies legacy config structure', () => {
      const legacy = {
        security: {
          maxCommandLength: 1000,
          blockedCommands: ['rm'],
          blockedArguments: ['--rf'],
          allowedPaths: ['C:\\test'],
          restrictWorkingDirectory: true,
          commandTimeout: 30,
          enableInjectionProtection: true
        },
        shells: {}
      };
      expect(isLegacyConfig(legacy)).toBe(true);
    });

    test('identifies new config structure', () => {
      const newConfig = {
        global: {
          security: {},
          restrictions: {},
          paths: {}
        },
        shells: {}
      };
      expect(isLegacyConfig(newConfig)).toBe(false);
    });

    test('handles invalid config', () => {
      expect(isLegacyConfig({})).toBe(false);
      expect(isLegacyConfig(null)).toBe(false);
      expect(isLegacyConfig(undefined)).toBe(false);
    });
  });

  describe('isWslShellConfig', () => {
    test('identifies WSL shell config', () => {
      const wslShell: WslShellConfig = {
        enabled: true,
        executable: { command: 'wsl.exe', args: ['-e'] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };
      expect(isWslShellConfig(wslShell)).toBe(true);
    });

    test('identifies non-WSL shell config', () => {
      const cmdShell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] }
      };
      expect(isWslShellConfig(cmdShell)).toBe(false);
    });

    test('handles undefined', () => {
      expect(isWslShellConfig(undefined)).toBe(false);
    });
  });

  describe('hasWslConfig', () => {
    test('identifies objects with wslConfig', () => {
      const config = {
        wslConfig: {
          mountPoint: '/mnt/'
        }
      };
      expect(hasWslConfig(config)).toBe(true);
    });

    test('identifies objects without wslConfig', () => {
      expect(hasWslConfig({})).toBe(false);
      expect(hasWslConfig({ other: 'prop' })).toBe(false);
      expect(hasWslConfig(null)).toBe(false);
    });
  });
});
```

### 2. Update Existing Type Tests

Update any existing tests that import the old type definitions to use the new types or legacy types as appropriate.

## Documentation Updates

### 1. Create Migration Guide

Create `docs/MIGRATION_TO_INHERITANCE_CONFIG.md`:

```markdown
# Migration Guide: Inheritance-Based Configuration

## Overview

This guide helps you migrate from the flat configuration structure to the new inheritance-based configuration.

## Key Changes

1. **Global Settings**: Security settings are now under `global` instead of top-level `security`
2. **Shell Overrides**: Each shell can override global settings using the `overrides` property
3. **Separated Concerns**: Restrictions (commands, arguments, operators) are now separate from security settings
4. **WSL-Specific Config**: WSL has its own configuration section for mount points and path mapping

## Migration Steps

### Step 1: Restructure Your Configuration

Old format:
```json
{
  "security": {
    "maxCommandLength": 2000,
    "blockedCommands": ["rm", "del"],
    "blockedArguments": ["--exec"],
    "allowedPaths": ["C:\\Users"],
    "restrictWorkingDirectory": true,
    "commandTimeout": 30,
    "enableInjectionProtection": true
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"],
      "blockedOperators": ["&", "|"]
    }
  }
}
```

New format:

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
      "blockedCommands": ["rm", "del"],
      "blockedArguments": ["--exec"],
      "blockedOperators": ["&", "|"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    }
  }
}
```

### Step 2: Add Shell-Specific Overrides

If you need different settings for specific shells, add overrides:

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 120
        },
        "paths": {
          "allowedPaths": ["/home/user", "/tmp"]
        }
      }
    }
  }
}
```

## Backward Compatibility

The system will automatically detect and convert legacy configurations during the migration period.

### 2. Update Type Definition Documentation

Add to `src/types/README.md` (create if doesn't exist):

# Configuration Type Definitions

## Overview

The configuration system uses TypeScript interfaces to ensure type safety and provide clear contracts for configuration structure.

## Type Hierarchy

1. **ServerConfig**: Root configuration interface
   - `global`: Global settings that apply to all shells
   - `shells`: Shell-specific configurations

2. **GlobalConfig**: Default settings for all shells
   - `security`: Security-related settings
   - `restrictions`: Command and argument restrictions
   - `paths`: Path-related settings

3. **ShellConfig**: Individual shell configuration
   - `BaseShellConfig`: Standard shell configuration
   - `WslShellConfig`: Extended configuration for WSL

4. **ResolvedShellConfig**: Internal representation after merging global and shell-specific settings

## Type Guards

Use the provided type guards for runtime type checking:

- `isLegacyConfig()`: Check if configuration uses old format
- `isWslShellConfig()`: Check if shell configuration includes WSL-specific settings
- `hasWslConfig()`: Check if resolved config has WSL configuration

## Implementation Phases

### Phase 1: Type Definition Updates

1. Update `src/types/config.ts` with new interfaces
2. Create `src/utils/configTypes.ts` with type guards
3. Ensure all new types are exported properly

### Phase 2: Type Testing

1. Create comprehensive unit tests for type guards
2. Validate type compatibility with example configurations
3. Test edge cases and invalid configurations

### Phase 3: Documentation

1. Create migration guide for users
2. Document new type hierarchy
3. Update inline documentation in type files

## Acceptance Criteria

### Functional Requirements

- [ ] All new TypeScript interfaces are properly defined and exported
- [ ] Type guards correctly identify legacy vs new configuration formats
- [ ] Type guards correctly identify WSL-specific configurations
- [ ] All types have proper JSDoc comments explaining their purpose
- [ ] Backward compatibility types (Legacy*) are available for migration

### Technical Requirements

- [ ] No TypeScript compilation errors with new type definitions
- [ ] All type guards have 100% test coverage
- [ ] Type definitions follow existing naming conventions
- [ ] Proper use of `Partial<T>` for override types
- [ ] Proper use of optional properties where appropriate

### Testing Requirements

- [ ] Unit tests pass for all type guards
- [ ] Type guards handle null/undefined inputs gracefully
- [ ] Tests cover both positive and negative cases
- [ ] Tests validate type narrowing works correctly

### Documentation Requirements

- [ ] Migration guide clearly explains the changes
- [ ] Type hierarchy is documented
- [ ] Examples show both old and new formats
- [ ] JSDoc comments are complete and accurate

## Risk Assessment

### Technical Risks

1. **Risk**: Existing code expects old type structure
   - **Mitigation**: Keep legacy types available for gradual migration

2. **Risk**: Type guards may not cover all edge cases
   - **Mitigation**: Comprehensive unit testing with edge cases

3. **Risk**: Complex type hierarchy may confuse developers
   - **Mitigation**: Clear documentation and examples

### Compatibility Risks

1. **Risk**: Breaking change for existing configurations
   - **Mitigation**: Implement automatic migration in configuration loader

2. **Risk**: Third-party tools may depend on old structure
   - **Mitigation**: Support both formats during transition period
