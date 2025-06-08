# Task: Implement Conditional WSL Configuration in MCP Server

## Overview

Implement a conditional WSL configuration approach where WSL shell configuration is only included in the merged configuration if the user explicitly provides WSL settings in their configuration file. This prevents the default inclusion of WSL configuration when it may not be available or needed on the target system.

## Problem Statement

Currently, the Windows CLI MCP server always includes WSL configuration in the default configuration, even when users don't explicitly configure it. This can cause issues on systems where WSL is not available or when users don't intend to use WSL functionality.

## Solution Approach

Modify the configuration merging logic to conditionally include WSL configuration only when:

1. User explicitly provides WSL configuration in their config file, OR
2. User explicitly sets a flag to enable default WSL configuration

## Technical Implementation Details

### 1. TypeScript Interface Changes

**File: `src/types/config.ts`**

- **Current State**: `wsl?: ShellConfig` (optional in interface but always present in practice)
- **Required Changes**:
  - Ensure `wsl` property is truly optional in `ServerConfig.shells`
  - Add optional `includeDefaultWSL?: boolean` flag to `SecurityConfig` interface

```typescript
export interface SecurityConfig {
  maxCommandLength: number;
  blockedCommands: string[];
  blockedArguments: string[];
  allowedPaths: string[];
  restrictWorkingDirectory: boolean;
  commandTimeout: number;
  enableInjectionProtection: boolean;
  initialDir?: string;
  includeDefaultWSL?: boolean; // NEW: Flag to include default WSL config
}
```

### 2. Default Configuration Updates

**File: `src/utils/config.ts`**

**Current Issue**: `DEFAULT_CONFIG.shells.wsl` is always present with test script path
**Required Changes**:

1. **Remove WSL from DEFAULT_CONFIG**: Do not include `wsl` property in the default shells configuration
2. **Add Security Flag**: Add `includeDefaultWSL: false` to default security configuration
3. **Create Separate WSL Default**: Create a separate constant for default WSL configuration

```typescript
const DEFAULT_WSL_CONFIG: ShellConfig = {
  enabled: true,
  command: 'wsl.exe',
  args: ['-e'],
  validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
  blockedOperators: ['&', '|', ';', '`'],
  allowedPaths: [],
  wslMountPoint: '/mnt/',
  inheritGlobalPaths: true
};

export const DEFAULT_CONFIG: ServerConfig = {
  security: {
    // ... existing security config
    includeDefaultWSL: false, // NEW: Default to not including WSL
  },
  shells: {
    powershell: { /* ... */ },
    cmd: { /* ... */ },
    gitbash: { /* ... */ }
    // wsl: REMOVED from default config
  }
};
```

### 3. Configuration Merge Logic Updates

**File: `src/utils/config.ts`**

**Function: `mergeConfigs()`**

**Required Changes**:

1. **Conditional WSL Inclusion**: Only include WSL in merged config under specific conditions
2. **Default WSL Application**: Apply default WSL config when user requests it
3. **Validation Updates**: Handle cases where WSL might not be present

```typescript
function mergeConfigs(defaultConfig: ServerConfig, userConfig: Partial<ServerConfig>): ServerConfig {
  const merged: ServerConfig = {
    security: {
      ...defaultConfig.security,
      ...(userConfig.security || {})
    },
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
      // WSL handling logic goes here - see detailed implementation below
    }
  };

  // NEW: Conditional WSL configuration logic
  const shouldIncludeWSL = 
    userConfig.shells?.wsl ||                           // User provided WSL config
    merged.security.includeDefaultWSL ||                // User requested default WSL
    userConfig.security?.includeDefaultWSL;             // User requested via security flag

  if (shouldIncludeWSL) {
    merged.shells.wsl = {
      ...DEFAULT_WSL_CONFIG,
      ...(userConfig.shells?.wsl || {})
    };
  }

  // Update validation loop to handle optional WSL
  for (const [key, shell] of Object.entries(merged.shells) as [keyof typeof merged.shells, ShellConfig][]) {
    const defaultShellForKey = key === 'wsl' ? DEFAULT_WSL_CONFIG : defaultConfig.shells[key];
    if (defaultShellForKey && shell) {
      if (!shell.validatePath) {
        shell.validatePath = defaultShellForKey.validatePath;
      }
      if (!shell.blockedOperators) {
        shell.blockedOperators = defaultShellForKey.blockedOperators;
      }
    }
  }

  return merged;
}
```

### 4. Runtime Code Updates

**File: `src/index.ts`**

**Required Changes**:

1. **Tool List Generation**: Update to handle optional WSL
2. **Command Execution**: Add null checks for WSL configuration
3. **Validation**: Ensure WSL-specific validation only runs when WSL is configured

**Specific Locations to Modify**:

- **Line ~280** (`ListToolsRequestSchema` handler): Filter allowed shells to exclude WSL if not configured
- **Line ~320** (`execute_command` tool): Add validation that WSL is configured before allowing WSL commands
- **Line ~350** (WSL path validation): Only perform WSL-specific validation if WSL is configured

```typescript
// In ListToolsRequestSchema handler
const allowedShells = (Object.keys(this.config.shells) as Array<keyof typeof this.config.shells>)
  .filter(shell => {
    const shellConf = this.config.shells[shell];
    return shellConf && shellConf.enabled;
  });

// In execute_command tool
const shellKey = args.shell as keyof typeof this.config.shells;
const shellConfig = this.config.shells[shellKey];

if (!shellConfig) {
  throw new McpError(
    ErrorCode.InvalidRequest,
    `Shell '${shellKey}' is not configured or enabled`
  );
}
```

### 5. Validation Function Updates

**File: `src/utils/validation.ts`**

**Required Changes**:

- **Function `validateWslWorkingDirectory`**: Add parameter validation to ensure it's only called when WSL is configured
- **Function `resolveWslAllowedPaths`**: Add null checks for WSL configuration

### 6. Test Infrastructure Updates

**Files to Update**:

- `tests/helpers/TestCLIServer.ts`
- `tests/helpers/testUtils.ts`
- All test files that assume WSL is always present

**Required Changes**:

1. **TestCLIServer**: Explicitly enable WSL with emulator configuration
2. **Test Utilities**: Add helper functions for testing with/without WSL
3. **Existing Tests**: Update tests to handle conditional WSL presence

```typescript
// In TestCLIServer.ts
constructor(overrides: Partial<ServerConfig> = {}) {
  const baseConfig: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  
  // Explicitly enable WSL with emulator for testing
  const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl.sh');
  
  const config: ServerConfig = {
    ...baseConfig,
    security: { 
      ...baseConfig.security, 
      includeDefaultWSL: true, // Enable WSL for tests
      ...(overrides.security || {}) 
    },
    shells: { 
      ...baseConfig.shells,
      wsl: { // Explicitly configure WSL for tests
        enabled: true,
        command: 'bash',
        args: [wslEmulatorPath, '-e'],
        validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
        blockedOperators: ['&', '|', ';', '`']
      },
      ...(overrides.shells || {}) 
    }
  } as ServerConfig;

  this.server = new CLIServer(config);
}
```

## Configuration Examples

### 1. User Config Without WSL (New Behavior)

```json
{
  "security": {
    "allowedPaths": ["C:\\Projects"]
  },
  "shells": {
    "powershell": { "enabled": true }
  }
}
```

**Result**: No WSL configuration included

### 2. User Config Requesting Default WSL

```json
{
  "security": {
    "allowedPaths": ["C:\\Projects"],
    "includeDefaultWSL": true
  }
}
```

**Result**: Default WSL configuration included

### 3. User Config With Custom WSL

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"]
    }
  }
}
```

**Result**: Custom WSL configuration used

## Unit Test Requirements

### New Test Files to Create

1. **`tests/conditionalWSL.test.ts`**:
   - Test merging behavior with no WSL config
   - Test merging behavior with `includeDefaultWSL: true`
   - Test merging behavior with custom WSL config
   - Test tool list generation with/without WSL
   - Test command execution rejection when WSL not configured

2. **`tests/configMerging.test.ts`**:
   - Test all shell combinations with optional WSL
   - Test validation function behavior with missing WSL
   - Test edge cases in merge logic

### Existing Tests to Update

1. **`tests/wsl.test.ts`**: Update to explicitly enable WSL in test setup
2. **`tests/integration/*.test.ts`**: Update WSL-related integration tests
3. **`tests/validation.test.ts`**: Add tests for WSL validation with missing config
4. **`tests/configNormalization.test.ts`**: Update for new merge behavior

### Test Implementation Examples

```typescript
// tests/conditionalWSL.test.ts
describe('Conditional WSL Configuration', () => {
  test('should not include WSL when user config has no WSL settings', () => {
    const userConfig = {
      security: { allowedPaths: ['C:\\test'] }
    };
    const merged = mergeConfigs(DEFAULT_CONFIG, userConfig);
    expect(merged.shells.wsl).toBeUndefined();
  });

  test('should include default WSL when includeDefaultWSL is true', () => {
    const userConfig = {
      security: { includeDefaultWSL: true }
    };
    const merged = mergeConfigs(DEFAULT_CONFIG, userConfig);
    expect(merged.shells.wsl).toBeDefined();
    expect(merged.shells.wsl!.command).toBe('wsl.exe');
  });

  test('should reject WSL commands when WSL not configured', async () => {
    const config = buildTestConfig({ /* no WSL config */ });
    const server = new CLIServer(config);
    
    await expect(server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'echo test' }
    })).rejects.toThrow('Shell \'wsl\' is not configured');
  });
});
```

## Documentation Updates

### Files to Update

1. **`README.md`**:
   - Add section explaining conditional WSL configuration
   - Update configuration examples
   - Add troubleshooting section for WSL issues

2. **`config.sample.json`**:
   - Add example with `includeDefaultWSL: true`
   - Add comments explaining WSL behavior

3. **Tool descriptions** (in code):
   - Update shell enumeration logic documentation
   - Add comments about conditional WSL handling

### README Updates Required

```markdown
## WSL Configuration

WSL (Windows Subsystem for Linux) support is optional and only included when:

1. You explicitly configure WSL in your `config.json`
2. You set `"includeDefaultWSL": true` in the security section

### Enable Default WSL
```json
{
  "security": {
    "includeDefaultWSL": true
  }
}
```

### Custom WSL Configuration

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"]
    }
  }
}
```

## Implementation Phases

### Phase 1: Core Infrastructure

1. Update TypeScript interfaces
2. Modify DEFAULT_CONFIG structure
3. Implement conditional merge logic
4. Update validation functions

### Phase 2: Runtime Integration

1. Update server tool enumeration
2. Add runtime WSL validation
3. Update command execution logic
4. Handle error cases gracefully

### Phase 3: Testing

1. Create comprehensive unit tests
2. Update existing test infrastructure
3. Validate all WSL-related test scenarios
4. Test edge cases and error conditions

### Phase 4: Documentation

1. Update README with new behavior
2. Update configuration examples
3. Add troubleshooting guidance
4. Update inline code documentation

## Acceptance Criteria

### ✅ Functional Requirements

1. **Configuration Behavior**:
   - [ ] WSL is NOT included in merged config when user provides no WSL settings
   - [ ] WSL IS included when user sets `includeDefaultWSL: true`
   - [ ] WSL IS included when user provides custom WSL configuration
   - [ ] Custom WSL settings properly override defaults when both are present

2. **Runtime Behavior**:
   - [ ] Tool list excludes WSL when not configured
   - [ ] WSL commands are rejected with clear error when WSL not configured
   - [ ] WSL commands work normally when WSL is configured
   - [ ] Other shells continue to work regardless of WSL configuration state

3. **Backward Compatibility**:
   - [ ] Existing user configs with explicit WSL settings continue to work
   - [ ] Existing user configs without WSL settings now exclude WSL (breaking change - acceptable)
   - [ ] All non-WSL functionality remains unchanged

### ✅ Technical Requirements

1. **Code Quality**:
   - [ ] All TypeScript types are correctly updated
   - [ ] No type assertion bypasses (`!` operator) without justification
   - [ ] Proper null/undefined checking for optional WSL configuration
   - [ ] Error messages are clear and actionable

2. **Test Coverage**:
   - [ ] Unit tests cover all merge logic branches
   - [ ] Unit tests cover runtime behavior with/without WSL
   - [ ] Integration tests validate end-to-end scenarios
   - [ ] All existing WSL tests updated to explicitly enable WSL
   - [ ] Test coverage remains above 90% for modified files

3. **Performance**:
   - [ ] Configuration loading time not significantly impacted
   - [ ] Memory usage not increased due to conditional logic
   - [ ] No performance regressions in command execution

### ✅ Validation Steps

1. **Unit Test Validation**

   ```bash
   npm test
   ```

   - [ ] All tests pass
   - [ ] No test timeout warnings
   - [ ] Coverage reports show adequate coverage of new code

2. **Integration Testing**

   ```bash
   npm test tests/integration/
   ```

   - [ ] All integration tests pass
   - [ ] WSL-specific integration tests work with explicit WSL enabling

3. **Manual Configuration Testing**
   - [ ] Config with no WSL settings: WSL commands rejected
   - [ ] Config with `includeDefaultWSL: true`: WSL commands work
   - [ ] Config with custom WSL: WSL commands work with custom settings
   - [ ] Invalid WSL configurations produce clear error messages

4. **Documentation Validation**
   - [ ] README examples work as documented
   - [ ] Configuration examples are valid JSON
   - [ ] All code comments are accurate and helpful

### ✅ Definition of Done

- [ ] All acceptance criteria met
- [ ] Code review completed and approved
- [ ] All unit tests pass (`npm test`)
- [ ] All integration tests pass
- [ ] Documentation updated and reviewed
- [ ] Manual testing scenarios completed successfully
- [ ] No regressions in existing functionality
- [ ] Performance impact assessed and acceptable

## Risk Assessment

### High Risk Areas

1. **Breaking Change**: Users with no WSL config will lose WSL functionality
2. **Test Dependencies**: Many tests assume WSL is always available
3. **Type Safety**: Optional WSL requires careful null checking

### Mitigation Strategies

1. **Comprehensive Testing**: Extensive test coverage for all scenarios
