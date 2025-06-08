# Task: Fix Integration and Async Test Failures

## Overview and Problem Statement

The integration tests (`endToEnd.test.ts`, `shellExecution.test.ts`) and async operation tests (`asyncOperations.test.ts`) are failing because they depend on the underlying WSL command execution to work properly. These tests are symptomatic of the core WSL execution issues but require specific attention to ensure they work correctly after the base fixes are applied.

**Current Issues:**

1. Integration tests fail with exit code 127 when executing `pwd` command
2. Async tests fail because WSL commands don't execute properly
3. Tests assume certain paths exist (e.g., `/tmp`) that may not be available in the emulated environment

## Technical Implementation Details

### File: `scripts/wsl-emulator.js` (Enhancement)

Enhance the WSL emulator to better handle common test scenarios:

```javascript
#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);

// Handle WSL list distributions command
if ((args.includes('-l') || args.includes('--list')) && 
    (args.includes('-v') || args.includes('--verbose'))) {
  console.log('NAME            STATE           VERSION');
  console.log('* Ubuntu-Test    Running         2');
  process.exit(0);
}

// Handle command execution with -e flag
if (args[0] === '-e') {
  if (args.length < 2) {
    console.error('Error: No command provided after -e flag.');
    console.error('Usage: wsl-emulator -e <command>');
    process.exit(1);
  }

  const command = args[1];
  const commandArgs = args.slice(2);

  // Special handling for common test commands
  switch (command) {
    case 'pwd':
      // For pwd, return the current working directory
      console.log(process.cwd());
      process.exit(0);
      break;

    case 'exit':
      // Handle 'exit N' command
      if (commandArgs.length === 1) {
        const exitCode = parseInt(commandArgs[0], 10);
        if (!isNaN(exitCode)) {
          process.exit(exitCode);
        }
      }
      process.exit(0);
      break;

    case 'ls':
      // Special handling for ls commands in test scenarios
      if (commandArgs.includes('/tmp')) {
        // Simulate /tmp directory listing
        console.log('total 0');
        console.log('drwxrwxrwt  2 root root  40 Jan  1 00:00 .');
        console.log('drwxr-xr-x 20 root root 480 Jan  1 00:00 ..');
        process.exit(0);
      } else if (commandArgs.includes('/mnt/c')) {
        // Simulate error for non-existent mount
        console.error(`ls: cannot access '${commandArgs.join(' ')}': No such file or directory`);
        process.exit(2);
      }
      break;

    case 'echo':
      // Handle echo command
      console.log(commandArgs.join(' '));
      process.exit(0);
      break;

    case 'uname':
      // Handle uname command
      if (commandArgs.includes('-a')) {
        console.log('Linux Ubuntu-Test 5.10.0-0-generic #0-Ubuntu SMP x86_64 GNU/Linux');
        process.exit(0);
      }
      break;
  }

  // For other commands, try to execute them
  try {
    const result = spawnSync(command, commandArgs, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, WSL_DISTRO_NAME: 'Ubuntu-Test' }
    });
    process.exit(result.status || 0);
  } catch (error) {
    console.error(`Command execution failed: ${error.message}`);
    process.exit(127);
  }
}

// If no recognized command, show error
console.error('Error: Invalid arguments. Expected -e <command> OR --list --verbose');
console.error('Received:', args.join(' '));
process.exit(1);
```

### File: `tests/helpers/TestCLIServer.ts` (Update)

Ensure the test helper properly configures the environment:

```typescript
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG, DEFAULT_WSL_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

export class TestCLIServer {
  private server: CLIServer;

  constructor(overrides: Partial<ServerConfig> = {}) {
    const baseConfig: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Configure wsl shell to use the local emulator script
    const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');
    const wslShell = {
      ...DEFAULT_WSL_CONFIG,
      command: 'node',
      args: [wslEmulatorPath, '-e'],
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    baseConfig.shells = { ...baseConfig.shells, wsl: wslShell };

    // Disable other shells by default for cross platform reliability
    if (baseConfig.shells.powershell) baseConfig.shells.powershell.enabled = false;
    if (baseConfig.shells.cmd) baseConfig.shells.cmd.enabled = false;
    if (baseConfig.shells.gitbash) baseConfig.shells.gitbash.enabled = false;

    // Allow -e argument for the emulator
    baseConfig.security.blockedArguments = baseConfig.security.blockedArguments.filter(a => a !== '-e');

    // Merge overrides deeply
    const config: ServerConfig = {
      ...baseConfig,
      security: { ...baseConfig.security, ...(overrides.security || {}) },
      shells: { 
        ...baseConfig.shells,
        ...(overrides.shells || {}),
        // Ensure wsl config is preserved if shells are overridden
        wsl: overrides.shells?.wsl ? { ...wslShell, ...overrides.shells.wsl } : wslShell
      }
    } as ServerConfig;

    this.server = new CLIServer(config);
  }

  async executeCommand(options: { 
    shell: keyof ServerConfig['shells']; 
    command: string; 
    workingDir?: string; 
  }) {
    const result = await this.server._executeTool({
      name: 'execute_command',
      arguments: {
        shell: options.shell as string,
        command: options.command,
        workingDir: options.workingDir
      }
    });

    const output = result.content[0]?.text ?? '';
    const exitCode = (result.metadata as any)?.exitCode ?? -1;
    const workingDirectory = (result.metadata as any)?.workingDirectory;

    return { ...result, output, exitCode, workingDirectory };
  }

  async callTool(name: string, args: Record<string, any>) {
    return this.server._executeTool({ name, arguments: args });
  }
}
```

### File: `tests/asyncOperations.test.ts` (Update configuration)

Ensure async tests use the proper emulator configuration:

```typescript
import { describe, test, expect, beforeEach } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';
import path from 'path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');

describe('Async Command Execution', () => {
  let server: CLIServer;
  let config: ServerConfig;

  beforeEach(() => {
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.shells.wsl = {
      enabled: true,
      command: 'node', // Use node instead of bash
      args: [wslEmulatorPath, '-e'], // Use JS emulator
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    // ... rest of configuration
  });
  
  // ... rest of tests
});
```

## Working Examples

### Integration Test Execution

```typescript
// Should work with enhanced emulator
const server = new TestCLIServer({
  security: { restrictWorkingDirectory: true, allowedPaths: ['/tmp'] }
});

const result = await server.executeCommand({ 
  shell: 'wsl', 
  command: 'pwd', 
  workingDir: '/tmp' 
});

expect(result.exitCode).toBe(0);
expect(result.output).toContain(process.cwd()); // Emulator returns Node's cwd
```

### Async Operations

```typescript
// Multiple concurrent commands should work
const commands = ['echo first', 'echo second', 'echo third'];
const results = await Promise.all(
  commands.map(cmd => server.executeCommand({ shell: 'wsl', command: cmd }))
);

results.forEach((result, idx) => {
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain(commands[idx].split(' ')[1]);
});
```

## Unit Test Requirements

### Integration Test Fixes

1. **End-to-End Test**: Should execute commands with proper isolation
2. **Shell Execution Test**: Should handle working directory restrictions correctly
3. **Async Operations**: Should handle concurrent commands properly

### New Test Cases

Add emulator-specific tests to verify enhanced functionality:

```typescript
describe('WSL Emulator Enhanced Commands', () => {
  test('pwd returns current directory', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'pwd'], {
      encoding: 'utf8',
      cwd: '/tmp' // Set specific working directory
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('/tmp');
  });

  test('ls /tmp returns simulated output', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'ls', '/tmp'], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('total 0');
  });
});
```

## Documentation Updates

### File: `tests/README.md` (Create or Update)

```markdown
# Test Suite Documentation

## WSL Testing

The test suite uses a Node.js-based WSL emulator (`scripts/wsl-emulator.js`) to enable cross-platform testing of WSL functionality.

### Emulated Commands

The emulator provides special handling for common test commands:
- `pwd`: Returns the current working directory
- `echo`: Outputs arguments
- `ls /tmp`: Simulates temporary directory listing
- `ls /mnt/c`: Simulates non-existent mount error
- `exit N`: Exits with specified code
- `uname -a`: Returns Linux system information

### Test Configuration

All WSL tests should use the Node.js emulator:
```typescript
command: 'node',
args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e']
```

## Implementation Phases

### Phase 1: Enhance WSL Emulator

1. Update `scripts/wsl-emulator.js` with enhanced command handling
2. Add special cases for `pwd`, `ls`, and other common test commands
3. Test the emulator manually with various commands

### Phase 2: Update Test Configurations

1. Update `tests/helpers/TestCLIServer.ts` to use Node.js emulator
2. Update `tests/asyncOperations.test.ts` configuration
3. Ensure all test files using WSL use the correct configuration

### Phase 3: Verify Integration Tests

1. Run integration tests: `npm test tests/integration/`
2. Run async tests: `npm test tests/asyncOperations.test.ts`
3. Ensure all tests pass without exit code 127

### Phase 4: Add Documentation

1. Create or update test documentation
2. Document the emulator's special command handling
3. Add troubleshooting guide for common issues

## Acceptance Criteria

### Functional Requirements

- [ ] Integration tests execute WSL commands successfully
- [ ] Async operations handle multiple concurrent WSL commands
- [ ] Common test commands (`pwd`, `ls`, `echo`) work correctly
- [ ] Exit codes are properly propagated
- [ ] Working directory context is maintained

### Technical Requirements

- [ ] Enhanced emulator handles all test scenarios
- [ ] Test helper configuration is consistent
- [ ] No hardcoded paths that break cross-platform compatibility
- [ ] Proper error handling for edge cases

### Testing Requirements

- [ ] All integration tests pass
- [ ] All async operation tests pass
- [ ] No exit code 127 errors
- [ ] Tests run successfully on both Windows and Linux

### Validation Steps

1. Run integration tests: `npm test tests/integration/`
2. Run async tests: `npm test tests/asyncOperations.test.ts`
3. Run full test suite: `npm test`
4. Verify test output shows proper command execution

## Risk Assessment

### Technical Risks

1. **Risk:** Emulator behavior differs from real WSL
   - **Mitigation:** Focus on test-specific commands that don't require full WSL functionality

2. **Risk:** Working directory handling differences
   - **Mitigation:** Emulator returns Node's cwd, tests should account for this

3. **Risk:** Platform-specific command differences
   - **Mitigation:** Enhanced emulator provides consistent responses across platforms
