# Task: Fix WSL Path Validation and Command Execution

## Overview and Problem Statement

WSL-related tests are failing because the server is not properly handling WSL-style paths (e.g., `/mnt/c/...`, `/tmp`, `/home/user`) when validating working directories. The current implementation tries to normalize WSL paths as Windows paths, which causes validation failures.

**Current Issues:**

1. WSL paths are being incorrectly normalized by `normalizeWindowsPath`
2. Working directory validation fails for valid WSL paths
3. The server doesn't distinguish between Windows and WSL contexts for path validation

**Root Cause:** The `normalizeWindowsPath` function is converting WSL paths like `/mnt/c/tad` to Windows format, but the tests expect these paths to remain in WSL format for proper validation.

## Technical Implementation Details

### File: `src/index.ts`

Update the command execution logic to handle WSL paths differently:

**Location:** In the `_executeTool` method, around the `execute_command` case where working directory validation occurs

**Current problematic flow:**

1. `workingDir` is always normalized using `normalizeWindowsPath`
2. This breaks WSL paths that should remain in Linux format

**Required changes:**

```typescript
case "execute_command": {
  // ... existing code ...

  // Determine working directory
  let workingDir: string;
  if (args.workingDir) {
    // For WSL shell, preserve the original path format
    if (shellKey === 'wsl') {
      workingDir = args.workingDir; // Keep WSL paths as-is
    } else {
      workingDir = normalizeWindowsPath(args.workingDir);
    }
  } else {
    // ... existing code for handling undefined workingDir ...
  }

  // ... rest of the code ...
}
```

### File: `src/utils/validation.ts`

Add a new function to validate WSL-specific paths:

```typescript
/**
 * Validates if a WSL path is allowed based on the configured allowed paths
 * Handles both WSL-native paths (/home/user) and mounted Windows paths (/mnt/c/...)
 */
export function isWslPathAllowed(wslPath: string, allowedPaths: string[]): boolean {
  // For WSL paths, we need to check against both:
  // 1. The path as-is (for native Linux paths in allowedPaths)
  // 2. Converted Windows paths (for /mnt/X/... paths)
  
  // Direct check for native Linux paths
  for (const allowedPath of allowedPaths) {
    if (allowedPath.startsWith('/')) {
      // This is a Linux-style allowed path
      if (wslPath === allowedPath || wslPath.startsWith(allowedPath + '/')) {
        return true;
      }
    }
  }
  
  // For /mnt/X/... paths, check against Windows allowed paths
  const mountMatch = wslPath.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (mountMatch) {
    const driveLetter = mountMatch[1].toUpperCase();
    const pathPart = mountMatch[2] || '';
    const windowsEquivalent = `${driveLetter}:${pathPart.replace(/\//g, '\\')}`;
    
    return isPathAllowed(windowsEquivalent, allowedPaths);
  }
  
  return false;
}

/**
 * Validates WSL working directory
 */
export function validateWslWorkingDirectory(dir: string, allowedPaths: string[]): void {
  if (!dir.startsWith('/')) {
    throw new Error('WSL working directory must be an absolute path (starting with /)');
  }
  
  if (!isWslPathAllowed(dir, allowedPaths)) {
    const allowedPathsStr = allowedPaths.join(', ');
    throw new Error(
      `WSL working directory must be within allowed paths: ${allowedPathsStr}`
    );
  }
}
```

### File: `src/index.ts` (Update validation logic)

Update the working directory validation to use WSL-specific validation for WSL shell:

```typescript
// In the execute_command case, after determining workingDir:

if (this.config.security.restrictWorkingDirectory) {
  try {
    if (shellKey === 'wsl') {
      // Use WSL-specific validation
      validateWslWorkingDirectory(workingDir, Array.from(this.allowedPaths));
    } else {
      // Use Windows validation for other shells
      validateWorkingDirectory(workingDir, Array.from(this.allowedPaths));
    }
  } catch (error: any) {
    let originalWorkingDir = args.workingDir ? args.workingDir : process.cwd();
    const detailMessage = error && typeof error.message === 'string' ? error.message : String(error);
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Working directory (${originalWorkingDir}) outside allowed paths. Original error: ${detailMessage}. Use validate_directories tool to validate directories before execution.`
    );
  }
}
```

## Working Examples

### WSL Path Validation

```typescript
// Allowed paths configuration
allowedPaths = ['/mnt/c/tad', '/tmp', 'C:\\Users\\test'];

// Valid WSL paths
isWslPathAllowed('/mnt/c/tad/subdirectory', allowedPaths) // true (under /mnt/c/tad)
isWslPathAllowed('/tmp/workdir', allowedPaths) // true (under /tmp)
isWslPathAllowed('/mnt/c/Users/test/project', allowedPaths) // true (maps to C:\Users\test)

// Invalid WSL paths
isWslPathAllowed('/mnt/d/forbidden', allowedPaths) // false
isWslPathAllowed('/usr/local', allowedPaths) // false
```

### Command Execution with WSL Paths

```typescript
// This should work with proper validation
await server._executeTool({
  name: 'execute_command',
  arguments: {
    shell: 'wsl',
    command: 'pwd',
    workingDir: '/mnt/c/tad/sub'
  }
});
```

## Unit Test Requirements

### File: `tests/validation.test.ts`

Add tests for the new WSL path validation functions:

```typescript
describe('WSL Path Validation', () => {
  const allowedPaths = ['/mnt/c/allowed', '/tmp', 'C:\\Windows\\allowed'];

  test.each([
    ['/mnt/c/allowed/subdir', true],
    ['/tmp/workdir', true],
    ['/mnt/c/Windows/allowed/test', true], // Maps to C:\Windows\allowed
    ['/mnt/d/forbidden', false],
    ['/usr/local', false],
    ['/home/user', false],
  ])('isWslPathAllowed(%s) should return %s', (path, expected) => {
    expect(isWslPathAllowed(path, allowedPaths)).toBe(expected);
  });

  test('validateWslWorkingDirectory throws for invalid paths', () => {
    expect(() => validateWslWorkingDirectory('/mnt/d/invalid', allowedPaths))
      .toThrow('WSL working directory must be within allowed paths');
    
    expect(() => validateWslWorkingDirectory('relative/path', allowedPaths))
      .toThrow('WSL working directory must be an absolute path');
  });
});
```

### Update WSL Test Configuration

In `tests/wsl.test.ts`, ensure the test configuration includes appropriate allowed paths:

```typescript
// For Test 5.1
cwdTestConfig.security.allowedPaths = ['/mnt/c/tad']; // Already correct

// For Test 5.1.1
serverInstanceForCwdTest = new CLIServer({
  ...cwdTestConfig,
  security: {
    ...cwdTestConfig.security,
    allowedPaths: ['/tmp'] // Already correct
  }
});
```

## Documentation Updates

### File: `src/utils/validation.ts` (Function Documentation)

Add comprehensive documentation for the new functions:

```typescript
/**
 * Validates WSL paths against allowed paths
 * 
 * Handles two types of paths:
 * 1. Native Linux paths (e.g., /tmp, /home/user) - checked directly against allowed paths
 * 2. Mounted Windows paths (e.g., /mnt/c/...) - converted to Windows format and checked
 * 
 * @param wslPath - The WSL path to validate
 * @param allowedPaths - Array of allowed paths (can be Windows or Linux format)
 * @returns true if the path is allowed
 */
```

## Implementation Phases

### Phase 1: Implement WSL Path Validation Functions

1. Add `isWslPathAllowed` function to `src/utils/validation.ts`
2. Add `validateWslWorkingDirectory` function
3. Export both functions from the module

### Phase 2: Update Command Execution Logic

1. Modify the `execute_command` case in `src/index.ts`
2. Add conditional logic to preserve WSL paths
3. Use WSL-specific validation for WSL shell

### Phase 3: Add Unit Tests

1. Add comprehensive tests for WSL path validation
2. Ensure existing WSL tests configuration is correct
3. Verify all WSL working directory tests pass

### Phase 4: Integration Testing

1. Run all WSL tests: `npm test tests/wsl.test.ts`
2. Run integration tests: `npm test tests/integration/`
3. Ensure no regression in non-WSL shells

## Acceptance Criteria

### Functional Requirements

- [ ] WSL paths remain in Linux format during validation
- [ ] Native Linux paths (e.g., `/tmp`) are validated correctly
- [ ] Mounted paths (e.g., `/mnt/c/...`) are validated against Windows allowed paths
- [ ] Non-absolute WSL paths are rejected with clear error
- [ ] All WSL working directory tests pass

### Technical Requirements

- [ ] Clear separation between Windows and WSL path validation
- [ ] No modification to existing Windows path validation logic
- [ ] Type-safe implementation with proper error handling
- [ ] Backward compatibility maintained for non-WSL shells

### Testing Requirements

- [ ] All WSL tests in `tests/wsl.test.ts` pass
- [ ] New unit tests for WSL path validation pass
- [ ] Integration tests pass
- [ ] No regression in Windows shell tests

### Validation Steps

1. Run WSL tests: `npm test tests/wsl.test.ts`
2. Run validation tests: `npm test tests/validation.test.ts`
3. Run full test suite: `npm test`
4. Verify no exit code 127 errors remain

## Risk Assessment

### Technical Risks

1. **Risk:** Breaking existing Windows path validation
   - **Mitigation:** Changes are isolated to WSL-specific code paths

2. **Risk:** Incorrect path conversion between WSL and Windows formats
   - **Mitigation:** Comprehensive test coverage for various path formats

3. **Risk:** Performance impact from additional validation logic
   - **Mitigation:** Simple string operations with early returns for efficiency
