# Task: Implement Node.js-based WSL Emulator for Cross-Platform Testing

## Overview and Problem Statement

The current WSL tests are failing with exit code 127 ("command not found") because the bash script emulator (`scripts/wsl.sh`) is not executing properly in the test environment. The tests are trying to use `bash` to run the shell script, but this approach has compatibility issues.

**Current Issues:**

1. WSL tests fail with exit code 127 for all commands
2. The bash script emulator requires bash to be available and properly configured
3. Cross-platform compatibility is problematic with shell scripts

**Solution:** Replace the bash script emulator with a Node.js-based emulator that can run on any platform where Node.js is available.

## Technical Implementation Details

### File: `scripts/wsl-emulator.js` (Create New)

Create a new Node.js script that emulates WSL behavior for testing:

```javascript
#!/usr/bin/env node

// WSL Emulator for cross-platform testing
// Mimics basic wsl.exe behavior for development and testing

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

  // Get the command and its arguments
  const command = args[1];
  const commandArgs = args.slice(2);

  // Execute the command using child_process
  const { spawnSync } = require('child_process');
  
  // Special handling for test commands
  if (command === 'exit' && commandArgs.length === 1) {
    // Handle 'exit N' command
    const exitCode = parseInt(commandArgs[0], 10);
    if (!isNaN(exitCode)) {
      process.exit(exitCode);
    }
  }

  // Execute the command
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, WSL_DISTRO_NAME: 'Ubuntu-Test' }
  });

  // Exit with the command's exit code
  process.exit(result.status || 0);
}

// If no recognized command, show error
console.error('Error: Invalid arguments. Expected -e <command> OR --list --verbose');
console.error('Received:', args.join(' '));
process.exit(1);
```

### File: `tests/wsl.test.ts` (Update)

Update the WSL test configuration to use the Node.js emulator:

```typescript
const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');

beforeEach(() => {
  testConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  testConfig.shells.wsl = {
    enabled: true,
    command: 'node', // Use Node.js instead of bash
    args: [wslEmulatorPath, '-e'], // Run the JS emulator
    validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
    blockedOperators: ['&', '|', ';', '`']
  };
  // ... rest of the configuration
});
```

### File: `tests/helpers/TestCLIServer.ts` (Update)

Update the test helper to use the Node.js emulator:

```typescript
const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');
const wslShell = {
  ...DEFAULT_WSL_CONFIG,
  command: 'node',
  args: [wslEmulatorPath, '-e']
};
```

## Working Examples

### WSL List Command

```bash
node scripts/wsl-emulator.js -l -v
# Output:
# NAME            STATE           VERSION
# * Ubuntu-Test    Running         2
```

### Command Execution

```bash
node scripts/wsl-emulator.js -e echo "hello world"
# Output: hello world

node scripts/wsl-emulator.js -e exit 42
# Exit code: 42
```

## Unit Test Requirements

### All Existing WSL Tests Should Pass

1. **Basic command execution** - `echo` commands should work
2. **Exit code propagation** - `exit 42` should return exit code 42
3. **Error output capture** - Commands that fail should capture stderr
4. **Command argument handling** - Multi-argument commands like `ls -la /tmp`

### New Test Cases

Add a test to verify the emulator itself works correctly:

```typescript
describe('WSL Emulator Functionality', () => {
  test('emulator handles basic commands', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'echo', 'test'], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('test');
  });

  test('emulator propagates exit codes', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'exit', '42']);
    expect(result.status).toBe(42);
  });
});
```

## Documentation Updates

### File: `scripts/README.md` (Create New)

```markdown
# Scripts Directory

## wsl-emulator.js

A Node.js-based WSL emulator for cross-platform testing of WSL functionality.

### Usage:
- List distributions: `node wsl-emulator.js -l -v`
- Execute command: `node wsl-emulator.js -e <command> [args...]`

### Purpose:
This emulator allows WSL-related tests to run on any platform where Node.js is available, including Linux CI environments where `wsl.exe` is not present.
```

### File: `.gitattributes` (Update)

Add the new JavaScript emulator:

```config
* text=auto eol=lf
*.sh text eol=lf linguist-executable=true
*.js text eol=lf linguist-executable=true
```

## Implementation Phases

### Phase 1: Create the Node.js Emulator

1. Create `scripts/wsl-emulator.js` with the implementation above
2. Make it executable: `chmod +x scripts/wsl-emulator.js` (on Unix-like systems)
3. Test it manually to ensure basic functionality

### Phase 2: Update Test Configuration

1. Update `tests/wsl.test.ts` to use the Node.js emulator
2. Update `tests/helpers/TestCLIServer.ts` to use the Node.js emulator
3. Update any other test files that reference the WSL shell configuration

### Phase 3: Verify All WSL Tests Pass

1. Run WSL tests: `npm test tests/wsl.test.ts`
2. Run async tests: `npm test tests/asyncOperations.test.ts`
3. Run integration tests: `npm test tests/integration/`

### Phase 4: Clean Up

1. Remove the old bash script `scripts/wsl.sh` after all tests pass
2. Update any documentation that references the old script

## Acceptance Criteria

### Functional Requirements

- [ ] WSL emulator correctly handles `-l -v` command for listing distributions
- [ ] WSL emulator correctly executes commands with `-e` flag
- [ ] Exit codes are properly propagated from executed commands
- [ ] Standard output and error streams are correctly captured
- [ ] The emulator works on both Windows and Linux platforms

### Technical Requirements

- [ ] Node.js script is executable and properly formatted
- [ ] No external dependencies beyond Node.js built-in modules
- [ ] Error handling for invalid arguments
- [ ] Proper process exit codes

### Testing Requirements

- [ ] All existing WSL tests pass with the new emulator
- [ ] Tests run successfully on both Windows and Linux environments
- [ ] Exit code 127 errors are resolved
- [ ] Async operation tests that use WSL pass

### Validation Steps

1. Run WSL-specific tests: `npm test tests/wsl.test.ts`
2. Run async tests: `npm test tests/asyncOperations.test.ts`
3. Run integration tests: `npm test tests/integration/`
4. Verify no exit code 127 errors in test output

## Risk Assessment

### Technical Risks

1. **Risk:** Command execution differences between platforms
   - **Mitigation:** Use Node.js `spawnSync` with `shell: true` for consistent behavior

2. **Risk:** Path handling differences between Windows and Linux
   - **Mitigation:** The emulator passes commands through to the system shell, maintaining platform-specific behavior

3. **Risk:** Environment variable differences
   - **Mitigation:** Set `WSL_DISTRO_NAME` to maintain WSL-like environment
