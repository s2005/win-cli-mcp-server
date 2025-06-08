# Unit Test Task 6: Improve Existing Tests with Parameterized Testing

## Priority: MEDIUM - Implement Soon

## Description

Enhance existing tests by implementing parameterized testing patterns to improve coverage and reduce code duplication in test cases.

## Scope

- Convert repetitive test cases to parameterized tests using test.each()
- Improve error message testing with better assertions
- Add more comprehensive test cases for edge conditions
- Enhance path normalization and validation tests

## Files to Modify/Create

- Update existing test files: `configNormalization.test.ts`, `validation.test.ts`, `directoryValidator.test.ts`
- Update WSL-related test files in `tests/wsl/` directory

## Acceptance Criteria

1. Repetitive test cases are converted to parameterized tests
2. Test coverage is improved with additional edge cases
3. Error message assertions are more specific and helpful
4. Test code is more maintainable and readable
5. All existing functionality continues to work

## Detailed Implementation Instructions

### 1. Validation.test.ts Improvements

#### A. Convert Command Name Extraction Tests to Parameterized

Replace the existing `extractCommandName` tests with:

```typescript
describe('Command Name Extraction', () => {
  test.each([
    // [input, expected]
    ['cmd.exe', 'cmd'],
    ['C:\\Windows\\System32\\cmd.exe', 'cmd'],
    ['powershell.exe', 'powershell'],
    ['git.cmd', 'git'],
    ['program', 'program'],
    ['path/to/script.bat', 'script'],
    // Add new edge cases
    ['CMD.EXE', 'cmd'],
    ['PowerShell.Exe', 'powershell'],
    ['notepad', 'notepad'],
    ['./local/script.exe', 'script'],
    ['\\\\server\\share\\tool.exe', 'tool'],
    ['C:\\Program Files\\App\\app.cmd', 'app'],
    ['D:\\Tools\\my-tool.bat', 'my-tool']
  ])('extractCommandName(%s) should return %s', (input, expected) => {
    expect(extractCommandName(input)).toBe(expected);
  });
});
```

#### B. Convert Command Blocking Tests

```typescript
describe('Command Blocking', () => {
  const blockedCommands = ['rm', 'del', 'format'];

  test.each([
    // [command, isBlocked]
    ['rm', true],
    ['rm.exe', true],
    ['C:\\Windows\\System32\\rm.exe', true],
    ['RM.exe', true],
    ['DeL.exe', true],
    ['FORMAT.EXE', true],
    ['rm.cmd', true],
    ['del.bat', true],
    ['notepad.exe', false],
    ['format.com', false], // Only .exe, .cmd, .bat are blocked
    ['formatter.exe', false], // Different name
    ['delete.exe', false], // Not exact match
  ])('isCommandBlocked(%s) should return %s', (command, expected) => {
    expect(isCommandBlocked(command, blockedCommands)).toBe(expected);
  });
});
```

#### C. Enhanced Path Normalization Tests

```typescript
describe('Path Normalization', () => {
  // Basic path normalization tests
  test.each([
    // Windows paths
    ['C:/Users/test', 'C:\\Users\\test'],
    ['C:\\Users\\test', 'C:\\Users\\test'],
    ['c:/windows/system32', 'C:\\windows\\system32'],
    
    // Relative paths
    ['\\Users\\test', 'C:\\Users\\test'],
    ['foo\\bar', 'C:\\foo\\bar'],
    ['../relative/path', 'C:\\relative\\path'],
    
    // Git Bash style
    ['/c/Users/Projects', 'C:\\Users\\Projects'],
    ['/d/Projects', 'D:\\Projects'],
    ['/c/folder/../other', 'C:\\other'],
    
    // Drive-relative paths
    ['C:folder/sub', 'C:\\folder\\sub'],
    ['C:folder/../', 'C:\\'],
    ['D:../relative/path', 'D:\\relative\\path'],
    
    // UNC paths
    ['\\\\server\\share\\file', '\\\\server\\share\\file'],
    ['//server/share/folder', '\\\\server\\share\\folder'],
    
    // WSL paths (preserved)
    ['/mnt/c/foo/bar', '/mnt/c/foo/bar'],
    ['/mnt/d/', '/mnt/d/'],
    ['/home/user/documents', '/home/user/documents'],
    ['/usr/local/bin', '/usr/local/bin'],
    ['/', '/'],
    
    // Redundant separators
    ['C:\\\\Users\\\\test', 'C:\\Users\\test'],
    ['C:/Users//test', 'C:\\Users\\test'],
    ['C:\\temp\\\\\\\\subfolder', 'C:\\temp\\subfolder'],
    
    // Special cases
    ['c:no_slash_path', 'C:\\no_slash_path'],
    ['C:..\\another', 'C:\\another'],
    ['C:\\..\\another', 'C:\\another'],
    
    // Home directory expansion (requires implementation)
    // ['~', os.homedir()],
    // ['~/documents', path.join(os.homedir(), 'documents')],
  ])('normalizeWindowsPath(%s) should return %s', (input, expected) => {
    expect(normalizeWindowsPath(input)).toBe(expected);
  });

  // Add home directory expansion test (if implemented)
  test('should expand home directory', () => {
    const homedir = require('os').homedir();
    // This test assumes home directory expansion is implemented
    // If not implemented, this can be a TODO comment
    // expect(normalizeWindowsPath('~')).toBe(homedir);
    // expect(normalizeWindowsPath('~/test')).toBe(path.join(homedir, 'test'));
  });
});
```

#### D. Improve Error Assertions for Shell Operators

```typescript
describe('Shell Operator Validation', () => {
  const shellConfigs = {
    powershell: {
      enabled: true,
      command: 'powershell.exe',
      args: ['-Command'],
      blockedOperators: ['&', ';', '`']
    },
    cmd: {
      enabled: true,
      command: 'cmd.exe',
      args: ['/c'],
      blockedOperators: ['&', '|', ';']
    },
    custom: {
      enabled: true,
      command: 'custom.exe',
      args: [],
      blockedOperators: ['|']
    }
  };

  test.each([
    // [shell, command, blockedOperator, shouldThrow]
    ['powershell', 'Get-Process & Get-Service', '&', true],
    ['powershell', 'Get-Process; Start-Sleep', ';', true],
    ['powershell', 'echo `whoami`', '`', true],
    ['powershell', 'Get-Process | Select-Object', '|', false], // pipe not blocked
    ['cmd', 'echo hello & echo world', '&', true],
    ['cmd', 'dir | find "test"', '|', true],
    ['custom', 'cmd & echo test', '&', false], // only pipe blocked
    ['custom', 'cmd | echo test', '|', true],
  ])('%s: validateShellOperators(%s) should %s', 
    (shellName, command, operator, shouldThrow) => {
    const shellConfig = shellConfigs[shellName as keyof typeof shellConfigs];
    
    if (shouldThrow) {
      expect(() => validateShellOperators(command, shellConfig))
        .toThrow(expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining(`blocked operator: ${operator}`)
        }));
    } else {
      expect(() => validateShellOperators(command, shellConfig)).not.toThrow();
    }
  });
});
```

### 2. DirectoryValidator.test.ts Improvements

#### A. Parameterized Directory Validation Tests

```typescript
describe('Directory Validator', () => {
  const allowedPaths = ['C:\\Users\\test', 'D:\\Projects'];

  describe('validateDirectories', () => {
    test.each([
      // [directories, expectedValid, expectedInvalid]
      [['C:\\Users\\test\\docs', 'D:\\Projects\\web'], true, []],
      [['C:\\Windows\\System32', 'E:\\NotAllowed'], false, ['C:\\Windows\\System32', 'E:\\NotAllowed']],
      [['C:\\Users\\test\\documents', 'C:\\Program Files'], false, ['C:\\Program Files']],
      [['/c/Users/test/docs', '/d/Projects/web'], true, []],
      [['C:\\Users\\test', 'D:\\Projects', 'E:\\Invalid'], false, ['E:\\Invalid']],
      [[], true, []], // empty array
    ])('validateDirectories(%j) should return isValid=%s, invalidDirectories=%j', 
      (directories, expectedValid, expectedInvalid) => {
      const result = validateDirectories(directories, allowedPaths);
      expect(result.isValid).toBe(expectedValid);
      expect(result.invalidDirectories).toEqual(expectedInvalid);
    });
  });

  describe('validateDirectoriesAndThrow error messages', () => {
    test.each([
      // [invalidDirs, expectedMessageParts]
      [['C:\\Windows\\System32'], ['directory is outside', 'C:\\Windows\\System32']],
      [['E:\\Dir1', 'F:\\Dir2'], ['directories are outside', 'E:\\Dir1', 'F:\\Dir2']],
      [['C:\\Program Files'], ['directory is outside', 'C:\\Program Files', 'C:\\Users\\test', 'D:\\Projects']],
    ])('should throw with correct message for %j', (invalidDirs, expectedParts) => {
      expect(() => validateDirectoriesAndThrow(invalidDirs, allowedPaths))
        .toThrow(expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringMatching(new RegExp(expectedParts.join('.*'), 'i'))
        }));
    });
  });
});
```

### 3. ConfigNormalization.test.ts Improvements

#### A. Comprehensive Config Loading Tests

```typescript
describe('Config Normalization', () => {
  // Helper to create temp config
  const createTempConfig = (config: any): string => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-test-'));
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    return configPath;
  };

  test.each([
    // [configPaths, expectedNormalized]
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
      security: { allowedPaths: inputPaths }
    });
    
    const cfg = loadConfig(configPath);
    const normalized = cfg.security.allowedPaths;
    
    expectedPaths.forEach((expectedPath, index) => {
      if (expectedPath.startsWith('/mnt/') || expectedPath.startsWith('/home/')) {
        // WSL paths should be preserved
        expect(normalized[index]).toBe(expectedPath);
      } else {
        // Windows paths should be normalized
        expect(normalized[index]).toBe(path.normalize(expectedPath));
      }
    });
    
    // Cleanup
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('loadConfig merges with defaults correctly', () => {
    const partialConfig = {
      security: {
        maxCommandLength: 500,
        allowedPaths: ['C:\\Custom\\Path']
      }
    };
    
    const configPath = createTempConfig(partialConfig);
    const cfg = loadConfig(configPath);
    
    // Custom values should be used
    expect(cfg.security.maxCommandLength).toBe(500);
    expect(cfg.security.allowedPaths).toContain('c:\\custom\\path');
    
    // Default values should be filled in
    expect(cfg.security.blockedCommands).toEqual(DEFAULT_CONFIG.security.blockedCommands);
    expect(cfg.security.commandTimeout).toBe(DEFAULT_CONFIG.security.commandTimeout);
    expect(cfg.security.enableInjectionProtection).toBe(DEFAULT_CONFIG.security.enableInjectionProtection);
    
    // Cleanup
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });
});
```

### 4. WSL Validation Tests Enhancement

#### A. Update tests/wsl/validation.test.ts

```typescript
describe('isWslPathAllowed', () => {
  // Group related test cases
  const pathMatchingTests: Array<[string, string[], boolean, string]> = [
    // [testPath, allowedPaths, expected, description]
    ['/mnt/c/foo', ['/mnt/c/foo'], true, 'exact match'],
    ['/mnt/c/foo/bar', ['/mnt/c/foo'], true, 'subdirectory match'],
    ['/mnt/c/foo/bar', ['/mnt/c/foo/'], true, 'subdirectory with trailing slash on allowed'],
    ['/mnt/c/foo/bar/', ['/mnt/c/foo'], true, 'subdirectory with trailing slash on test'],
    ['/mnt/c/foo/bar/', ['/mnt/c/foo/'], true, 'trailing slashes on both'],
    ['/mnt/c', ['/mnt/c/foo'], false, 'parent of allowed path'],
    ['/mnt/c/foobar', ['/mnt/c/foo'], false, 'similar but not subdirectory'],
    ['/mnt/d/foo', ['/mnt/c/foo'], false, 'different drive'],
    ['/', ['/'], true, 'root exact match'],
    ['/foo', ['/'], true, 'any path when root allowed'],
    ['/mnt/c/deep/path', ['/'], true, 'deep path when root allowed'],
    ['/mnt/c/myapp/data', ['/home/user', '/mnt/c/myapp'], true, 'matches second allowed path'],
    ['/srv/data', ['/home/user', '/mnt/c/myapp'], false, 'not covered by any allowed path'],
    ['', ['/mnt/c/foo'], false, 'empty test path'],
    ['/mnt/c/foo', [], false, 'empty allowed paths'],
  ];

  test.each(pathMatchingTests)(
    '%s with allowed %j should return %s (%s)',
    (testPath, allowedPaths, expected, description) => {
      expect(isWslPathAllowed(testPath, allowedPaths)).toBe(expected);
    }
  );

  // Path normalization tests
  test.each([
    ['/mnt/c/foo/../bar', ['/mnt/c/bar'], true],
    ['/mnt/c/foo/./bar', ['/mnt/c/foo/bar'], true],
    ['/mnt/c/bar', ['/mnt/c/foo/../bar'], true],
    ['/mnt/c/foo/bar', ['/mnt/c/foo/./bar'], true],
  ])('should handle path normalization: %s with %j', (testPath, allowedPaths, expected) => {
    expect(isWslPathAllowed(testPath, allowedPaths)).toBe(expected);
  });
});
```

### 5. Additional Implementation Guidelines

#### A. Error Testing Pattern

For all error-throwing functions, use this consistent pattern:

```typescript
expect(() => functionThatThrows(params))
  .toThrow(expect.objectContaining({
    code: ErrorCode.InvalidRequest, // or appropriate error code
    message: expect.stringContaining('key part of error message')
  }));
```

#### B. Test Organization

1. Group related tests using `describe` blocks
2. Use descriptive test names that explain the scenario
3. Place test data at the beginning of describe blocks
4. Use helper functions to reduce duplication

#### C. Edge Cases to Add

1. **Path Tests**:
   - Empty strings
   - Very long paths (near OS limits)
   - Paths with special characters
   - Network paths (UNC)
   - Symbolic links (if supported)

2. **Command Tests**:
   - Commands with spaces
   - Commands with special characters
   - Very long commands
   - Unicode in commands

3. **Configuration Tests**:
   - Missing required fields
   - Invalid data types
   - Extreme values (negative numbers, huge arrays)

#### D. Performance Considerations

1. Use `beforeAll` and `afterAll` for expensive setup/teardown
2. Group file system operations to minimize I/O
3. Mock file system operations where possible

### 6. Testing Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **Single Assertion Principle**: One logical assertion per test
3. **Descriptive Names**: Test names should describe what is being tested and expected outcome
4. **DRY Principle**: Extract common test setup into helper functions
5. **Isolation**: Tests should not depend on execution order

## Dependencies

- **Requires**: Task 1 (ES Module fixes) and Task 2 (Test Helpers)
- **Independent of**: Tasks 3, 4, 5, 7, 8 (can be implemented in parallel)

## Notes

This task will significantly improve test maintainability and coverage without breaking existing functionality. The parameterized tests will make it easier to add new test cases in the future and reduce the overall lines of code while increasing coverage.
