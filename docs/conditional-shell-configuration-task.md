# Task: Implement Conditional Shell Configuration

## Overview and Problem Statement

### Current Issue

The Windows CLI MCP Server automatically includes PowerShell, CMD, and Git Bash shells in the configuration even when they are not explicitly specified in the user's config.json file. This differs from WSL shell behavior, which is only included when explicitly configured.

### Example Problem

```json
// User's config.json (only specifies gitbash)
{
  "shells": {
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "args": ["-c"],
      "blockedOperators": ["&", "|", ";", "`"]
    }
  }
}

// Current merged config output (unwanted powershell and cmd included)
{
  "shells": {
    "powershell": { "enabled": true, "command": "powershell.exe", ... },
    "cmd": { "enabled": true, "command": "cmd.exe", ... },
    "gitbash": { "enabled": true, "command": "C:\\Program Files\\Git\\usr\\bin\\bash.exe", ... }
  }
}

// Expected merged config output (only gitbash)
{
  "shells": {
    "gitbash": { "enabled": true, "command": "C:\\Program Files\\Git\\usr\\bin\\bash.exe", ... }
  }
}
```

### Expected Behavior

All shells should follow WSL pattern - only included when explicitly configured by user.

## Technical Implementation Details

## Root Cause Location

- **File:** `src/utils/config.ts`
- **Function:** `mergeConfigs` (lines 140-160)
- **Issue:** Unconditional spreading of default shell configurations

### Current Problematic Code

```typescript
shells: {
  // Merge each shell config individually so unspecified options fall back to defaults
  powershell: {
    ...defaultConfig.shells.powershell,
    ...(userConfig.shells?.powershell || {})
  },
  cmd: {
    ...defaultConfig.shells.cmd,
    ...(userConfig.shells?.cmd || {})
  },
  gitbash: {
    ...defaultConfig.shells.gitbash,
    ...(userConfig.shells?.gitbash || {})
  }
}
```

## Required Code Changes

### Step 1: Replace Shells Section

Update the `mergeConfigs` function in `src/utils/config.ts` (lines ~140-160):

```typescript
// BEFORE: Remove this entire shells object
shells: {
  powershell: {
    ...defaultConfig.shells.powershell,
    ...(userConfig.shells?.powershell || {})
  },
  cmd: {
    ...defaultConfig.shells.cmd,
    ...(userConfig.shells?.cmd || {})
  },
  gitbash: {
    ...defaultConfig.shells.gitbash,
    ...(userConfig.shells?.gitbash || {})
  }
}

// AFTER: Replace with this conditional logic
const merged: ServerConfig = {
  security: {
    ...defaultConfig.security,
    ...(userConfig.security || {})
  },
  shells: {} // Start with empty shells object
};

// Apply WSL pattern to all shells
const shouldIncludePowerShell = userConfig.shells?.powershell !== undefined;
const shouldIncludeCmd = userConfig.shells?.cmd !== undefined;
const shouldIncludeGitBash = userConfig.shells?.gitbash !== undefined;
const shouldIncludeWSL =
  userConfig.shells?.wsl !== undefined ||
  merged.security.includeDefaultWSL === true ||
  userConfig.security?.includeDefaultWSL === true;

// Conditionally add shells
if (shouldIncludePowerShell) {
  merged.shells.powershell = {
    ...defaultConfig.shells.powershell,
    ...(userConfig.shells.powershell || {})
  };
}

if (shouldIncludeCmd) {
  merged.shells.cmd = {
    ...defaultConfig.shells.cmd,
    ...(userConfig.shells.cmd || {})
  };
}

if (shouldIncludeGitBash) {
  merged.shells.gitbash = {
    ...defaultConfig.shells.gitbash,
    ...(userConfig.shells.gitbash || {})
  };
}

if (shouldIncludeWSL) {
  merged.shells.wsl = {
    ...DEFAULT_WSL_CONFIG,
    ...(userConfig.shells?.wsl || {})
  };
}
```

### Step 2: Update Shell Validation Loop

Modify the validation loop in `src/utils/config.ts` (lines ~180-190):

```typescript
// BEFORE: Current loop assumes all shells exist
for (const [key, shell] of Object.entries(merged.shells) as [keyof typeof merged.shells, ShellConfig][]) {
  const defaultShellForKey = key === 'wsl' ? DEFAULT_WSL_CONFIG : defaultConfig.shells[key as keyof typeof defaultConfig.shells];
  if (defaultShellForKey) { // Check if the shell actually exists in default config
    if (!shell.validatePath) {
      shell.validatePath = defaultShellForKey.validatePath;
    }
    if (!shell.blockedOperators) {
      shell.blockedOperators = defaultShellForKey.blockedOperators;
    }
  }
}

// AFTER: Handle conditional shell presence
for (const [key, shell] of Object.entries(merged.shells) as [keyof typeof merged.shells, ShellConfig][]) {
  // Get the appropriate default config
  let defaultShellForKey: ShellConfig | undefined;
  if (key === 'wsl') {
    defaultShellForKey = DEFAULT_WSL_CONFIG;
  } else if (key in defaultConfig.shells) {
    defaultShellForKey = defaultConfig.shells[key as keyof typeof defaultConfig.shells];
  }
  
  if (defaultShellForKey) {
    if (!shell.validatePath) {
      shell.validatePath = defaultShellForKey.validatePath;
    }
    if (!shell.blockedOperators) {
      shell.blockedOperators = defaultShellForKey.blockedOperators;
    }
  }
}
```

## Working Examples

### Example 1: Minimal Configuration (GitBash only)

```json
{
  "shells": {
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
    }
  }
}
```

Result: Only GitBash shell available

### Example 2: Multiple Shells

```json
{
  "shells": {
    "powershell": { "enabled": false },
    "cmd": { "enabled": true },
    "gitbash": { "enabled": true }
  }
}
```

Result: PowerShell, CMD, and GitBash shells available (WSL not included)

### Example 3: WSL with other shells

```json
{
  "shells": {
    "gitbash": { "enabled": true }
  },
  "security": {
    "includeDefaultWSL": true
  }
}
```

Result: GitBash and WSL shells available

## Unit Test Requirements

**File 1: tests/configNormalization.test.ts - Add new test cases:**

```typescript
test('minimal config only includes specified shells', () => {
  const partialConfig = {
    shells: {
      gitbash: {
        enabled: true,
        command: "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
      }
    }
  };

  const configPath = createTempConfig(partialConfig);
  const cfg = loadConfig(configPath);

  // Should only include gitbash
  expect(cfg.shells).toHaveProperty('gitbash');
  expect(cfg.shells).not.toHaveProperty('powershell');
  expect(cfg.shells).not.toHaveProperty('cmd');
  expect(cfg.shells).not.toHaveProperty('wsl');

  fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
});

test('empty shells config results in no shells', () => {
  const configPath = createTempConfig({
    security: { allowedPaths: ['C:\\test'] }
  });

  const cfg = loadConfig(configPath);

  // Should have no shells
  expect(Object.keys(cfg.shells)).toHaveLength(0);

  fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
});

test('multiple shells config includes only specified shells', () => {
  const partialConfig = {
    shells: {
      powershell: { enabled: false },
      cmd: { enabled: true }
    }
  };

  const configPath = createTempConfig(partialConfig);
  const cfg = loadConfig(configPath);

  // Should include powershell and cmd, but not gitbash or wsl
  expect(cfg.shells).toHaveProperty('powershell');
  expect(cfg.shells).toHaveProperty('cmd');
  expect(cfg.shells).not.toHaveProperty('gitbash');
  expect(cfg.shells).not.toHaveProperty('wsl');

  fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
});
```

**File 2: tests/getConfig.test.ts - Update existing tests:**

```typescript
test('createSerializableConfig handles empty shells config', () => {
  const testConfigMinimal: ServerConfig = {
    security: { ...testConfig.security },
    shells: {} // No shells configured
  };

  const safeConfig = createSerializableConfig(testConfigMinimal);
  
  expect(safeConfig).toBeDefined();
  expect(safeConfig.security).toBeDefined();
  expect(safeConfig.shells).toBeDefined();
  expect(Object.keys(safeConfig.shells)).toHaveLength(0);
});
```

**File 3: Create new file tests/conditionalShells.test.ts:**

```typescript
import { describe, expect, test } from '@jest/globals';
import { loadConfig } from '../src/utils/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Conditional Shell Configuration', () => {
  const createTempConfig = (config: any): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-shell-test-'));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  };

  test('WSL behavior unchanged with includeDefaultWSL', () => {
    const configPath = createTempConfig({
      security: { includeDefaultWSL: true }
    });

    const cfg = loadConfig(configPath);

    expect(cfg.shells).toHaveProperty('wsl');
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

    expect(cfg.shells.gitbash.validatePath).toBeDefined();
    expect(cfg.shells.gitbash.blockedOperators).toBeDefined();
    expect(cfg.shells.gitbash.blockedOperators).toEqual(['&', '|', ';', '`']);

});

## Documentation Updates

### File 1: README.md

Update the Configuration section (around line 150):

{{ ... }}
### Shell Configuration

### Important Note

Shells must be explicitly configured to be included. Only shells specified in your config.json will be available.

### Example: Minimal Configuration
```json
{
  "shells": {
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "args": ["-c"]
    }
  }
}
```

This configuration will only enable Git Bash. PowerShell and CMD will not be available.

### Example: Full Configuration

```json
{
  "shells": {
    "powershell": {
      "enabled": true,
      "command": "powershell.exe",
      "args": ["-NoProfile", "-NonInteractive", "-Command"]
    },
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"]
    },
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\bin\\bash.exe",
      "args": ["-c"]
    }
  }
}
```

#### Migration from Previous Versions

If you were relying on default PowerShell, CMD, or Git Bash shells, you must now explicitly configure them:

```json
{
  "shells": {
    "powershell": { "enabled": true },
    "cmd": { "enabled": true },
    "gitbash": { "enabled": true }
  }
}
```

```json

### File 2: config.sample.json

Update to show explicit shell configuration:

```json
{
  "security": {
    "maxCommandLength": 1000,
    "blockedCommands": [
      "rm",
      "del",
      "rmdir",
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
    "blockedArguments": ["-rf", "/f", "/s", "/q"],
    "allowedPaths": ["C:\\Users\\YourUsername", "C:\\Projects"],
    "restrictWorkingDirectory": true,
    "commandTimeout": 30,
    "enableInjectionProtection": true,
    "includeDefaultWSL": false
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "command": "powershell.exe",
      "args": ["-NoProfile", "-NonInteractive", "-Command"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\bin\\bash.exe",
      "args": ["-c"],
      "blockedOperators": ["&", "|", ";", "`"]
    }
  }
}
```

## Implementation Phases

### Phase 1: Core Configuration Logic

- Modify `mergeConfigs` function in `src/utils/config.ts`
- Replace unconditional shell spreading with conditional inclusion
- Update shell validation loop to handle optional shells

### Phase 2: Test Implementation

- Add test cases to `tests/configNormalization.test.ts`
- Update existing tests in `tests/getConfig.test.ts`
- Create new test file `tests/conditionalShells.test.ts`

### Phase 3: Documentation Updates

- Update README.md with new configuration requirements
- Update config.sample.json to show explicit shell configuration
- Add migration guidance for breaking changes

## Acceptance Criteria

**Functional Requirements:**

1. ✅ User config with only `gitbash` shell results in merged config containing only Git Bash
2. ✅ Empty shells configuration results in no shells in merged config
3. ✅ WSL behavior remains unchanged (conditional inclusion with `includeDefaultWSL`)
4. ✅ Explicitly configured shells work identical to current behavior
5. ✅ Shell validation and blocked operators assignment work with conditional shells

**Technical Validation Commands:**

```bash
# All existing unit tests pass
npm test

# New unit tests pass
npm test tests/conditionalShells.test.ts
npm test tests/configNormalization.test.ts

# Integration test - server starts with minimal config
echo '{"shells":{"gitbash":{"enabled":true}}}' > test-config.json
node dist/index.js --config test-config.json &
# Should start without errors and only show gitbash in available tools
```

**Manual Testing Scenarios:**

1. Create config with only gitbash, verify get_config tool shows only gitbash
2. Create empty config, verify no shells available in tools list
3. Create config with all shells, verify all work as before
4. Test WSL with includeDefaultWSL still works correctly

**Breaking Change Validation:**

- Users with existing full shell configurations see no behavior change
- Users with minimal configs no longer get unwanted default shells
- Clear error messages when no shells are configured but commands attempted

## Risk Assessment

**Technical Risks:**

- **Shell validation loop**: Risk of accessing undefined shell properties
  - **Mitigation**: Added proper type checking and undefined handling
- **Backward compatibility**: Risk of breaking existing configurations
  - **Mitigation**: Full shell specifications continue working identically
- **WSL behavior**: Risk of inadvertently changing WSL logic
  - **Mitigation**: WSL conditional inclusion code remains unchanged

**Validation Requirements:**

- All unit tests must pass before and after implementation
- Integration tests must validate server startup with different configurations
- Manual verification of shell availability in tools list
- Backward compatibility testing with existing full shell configurations

**Error Handling:**

- Graceful handling when no shells configured (empty tools list)
- Clear error messages for invalid shell configurations  
- Proper validation that conditional shell inclusion doesn't bypass existing validation logic
