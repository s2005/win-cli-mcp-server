# Windows CLI MCP Server - Unit Test Improvements

## Executive Summary

After reviewing the unit tests in the Windows CLI MCP Server project, I've identified several areas for improvement to enhance test coverage, reliability, and maintainability. The current test suite has good coverage for core functionality but lacks consistency and has some technical debt issues.

## Current State Analysis

### Strengths

1. **Good Core Coverage**: The test suite covers essential validation functions, path normalization, and configuration handling
2. **WSL Support Testing**: Comprehensive tests for WSL-specific functionality
3. **Security Testing**: Tests for command blocking, argument validation, and path restrictions
4. **Mock Implementation**: Proper mocking of MCP SDK dependencies

### Weaknesses

1. **ES Module Issues**: Tests importing from `src/index.js` fail due to ES module compilation problems
2. **Inconsistent Mocking**: Path module mocking is repetitive and error-prone
3. **Limited Integration Tests**: Most tests are unit-level, missing end-to-end scenarios
4. **Missing Error Cases**: Insufficient testing of error conditions and edge cases
5. **Test Organization**: Some test files are very large and could be split
6. **Coverage Gaps**: No tests for async operations, timeouts, or process management

## Proposed Improvements

### 1. Fix ES Module Compilation Issues

**Problem**: Tests that import `CLIServer` from `src/index.js` fail with 193-second timeouts.

**Solution**:

```typescript
// tests/helpers/MockCLIServer.ts
import { ServerConfig } from '../../src/types/config.js';
import { validateCommand, validateWorkingDirectory } from '../../src/utils/validation.js';

export class MockCLIServer {
  constructor(public config: ServerConfig) {}
  
  validateCommand(shellKey: string, command: string, workingDir: string): void {
    // Implementation without ES module dependencies
  }
}
```

### 2. Create Test Helpers and Utilities

**Create reusable test utilities to reduce duplication:**

```typescript
// tests/helpers/pathHelpers.ts
export function mockWindowsPaths() {
  const origAbs = path.isAbsolute;
  const origRes = path.resolve;
  
  beforeEach(() => {
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
  });
  
  afterEach(() => {
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });
}
```

### 3. Add Missing Test Categories

#### A. Process Management Tests

```typescript
// tests/processManagement.test.ts
describe('Process Management', () => {
  test('should terminate process on timeout', async () => {
    // Test command timeout functionality
  });
  
  test('should handle process spawn errors gracefully', async () => {
    // Test error handling when shell cannot be spawned
  });
  
  test('should properly clean up child processes', async () => {
    // Test cleanup on server shutdown
  });
});
```

#### B. Async Operation Tests

```typescript
// tests/asyncOperations.test.ts
describe('Async Command Execution', () => {
  test('should handle concurrent command executions', async () => {
    // Test multiple simultaneous commands
  });
  
  test('should queue commands when limit reached', async () => {
    // Test command queueing behavior
  });
});
```

#### C. Error Boundary Tests

```typescript
// tests/errorHandling.test.ts
describe('Error Handling', () => {
  test('should handle malformed JSON-RPC requests', async () => {
    // Test invalid request handling
  });
  
  test('should recover from shell crashes', async () => {
    // Test resilience to shell process crashes
  });
});
```

### 4. Improve Existing Tests

#### A. Parameterized Tests for Better Coverage

```typescript
describe('Path Normalization', () => {
  test.each([
    ['C:/Users/test', 'C:\\Users\\test'],
    ['\\Users\\test', 'C:\\Users\\test'],
    ['/mnt/c/foo', '/mnt/c/foo'],
    ['//server/share', '\\\\server\\share'],
    ['C:folder', 'C:\\folder'],
    ['~/test', 'C:\\Users\\currentuser\\test'] // Add home directory expansion
  ])('normalizeWindowsPath(%s) should return %s', (input, expected) => {
    expect(normalizeWindowsPath(input)).toBe(expected);
  });
});
```

#### B. Better Error Message Testing

```typescript
test('should provide helpful error messages for common issues', () => {
  expect(() => validateWorkingDirectory('E:\\NotAllowed', allowedPaths))
    .toThrow(expect.objectContaining({
      message: expect.stringContaining('allowed paths'),
      code: ErrorCode.InvalidRequest
    }));
});
```

### 5. Add Integration Tests

```typescript
// tests/integration/endToEnd.test.ts
describe('End-to-End Scenarios', () => {
  test('should execute PowerShell script with proper isolation', async () => {
    const server = new TestCLIServer(testConfig);
    const result = await server.executeCommand({
      shell: 'powershell',
      command: 'Get-ChildItem | Select-Object -First 5',
      workingDir: 'D:\\mcp'
    });
    
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Mode');
    expect(result.workingDirectory).toBe('D:\\mcp');
  });
});
```

### 6. Performance Tests

```typescript
// tests/performance.test.ts
describe('Performance', () => {
  test('should handle large command outputs efficiently', async () => {
    const largeOutput = 'x'.repeat(1024 * 1024); // 1MB
    const startTime = Date.now();
    
    // Test command that generates large output
    const result = await executeCommand('echo ' + largeOutput);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
});
```

### 7. Test Data Fixtures

Create standardized test data:

```typescript
// tests/fixtures/configs.ts
export const secureConfig: ServerConfig = {
  security: {
    maxCommandLength: 1000,
    blockedCommands: ['rm', 'del', 'format'],
    blockedArguments: ['--system', '-rf'],
    allowedPaths: ['C:\\safe\\path'],
    restrictWorkingDirectory: true,
    commandTimeout: 30,
    enableInjectionProtection: true
  },
  shells: {
    powershell: {
      enabled: true,
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command'],
      blockedOperators: ['&', ';', '`']
    }
  }
};

export const permissiveConfig: ServerConfig = {
  // Config with relaxed security for testing
};
```

### 8. Test Documentation

Add JSDoc comments to complex tests:

```typescript
/**
 * Tests the behavior of path validation when WSL paths are mixed with Windows paths.
 * This ensures that the security model correctly handles cross-platform scenarios.
 * 
 * @see https://github.com/SimonB97/win-cli-mcp-server/issues/XXX
 */
test('should validate mixed WSL and Windows paths correctly', () => {
  // Test implementation
});
```

### 9. Snapshot Testing for Complex Outputs

```typescript
test('should generate correct tool description', () => {
  const description = buildToolDescription(['powershell', 'cmd', 'wsl']);
  expect(description).toMatchSnapshot();
});
```

### 10. Test Organization Improvements

Split large test files into focused modules:

```shell
tests/
├── unit/
│   ├── validation/
│   │   ├── commandValidation.test.ts
│   │   ├── pathValidation.test.ts
│   │   └── argumentValidation.test.ts
│   ├── config/
│   │   ├── loading.test.ts
│   │   └── serialization.test.ts
│   └── wsl/
│       ├── pathConversion.test.ts
│       └── execution.test.ts
├── integration/
│   ├── shellExecution.test.ts
│   └── mcpProtocol.test.ts
├── fixtures/
│   ├── configs.ts
│   └── testData.ts
└── helpers/
    ├── MockCLIServer.ts
    └── testUtils.ts
```

## Implementation Priority

1. **High Priority** (Fix immediately):
   - ES module compilation issues
   - Create MockCLIServer helper
   - Fix failing tests

2. **Medium Priority** (Implement soon):
   - Add process management tests
   - Create test helpers
   - Add error handling tests

3. **Low Priority** (Nice to have):
   - Snapshot testing
   - Performance tests
   - Test reorganization

## Testing Best Practices to Adopt

1. **AAA Pattern**: Arrange, Act, Assert structure for all tests
2. **Single Responsibility**: Each test should verify one behavior
3. **Descriptive Names**: Use `should` or `when` patterns for test names
4. **No Magic Values**: Use named constants for test data
5. **Isolated Tests**: No test should depend on another test's execution
6. **Fast Execution**: Mock external dependencies to keep tests fast
7. **Deterministic**: Tests should produce same results every run

## Code Coverage Goals

Current coverage appears incomplete. Target metrics:

- **Statements**: >90%
- **Branches**: >85%
- **Functions**: >90%
- **Lines**: >90%

Focus on critical paths:

- Security validation functions: 100%
- Path normalization: 100%
- Command execution: >95%
- Configuration loading: >90%

## Example Implementation

Here's a complete example of an improved test file:

```typescript
// tests/unit/validation/commandValidation.test.ts
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { validateShellOperators, parseCommand, isCommandBlocked } from '../../../src/utils/validation.js';
import { ShellConfig } from '../../../src/types/config.js';
import { secureShellConfig, blockedCommands } from '../../fixtures/configs.js';

describe('Command Validation', () => {
  describe('validateShellOperators', () => {
    let shellConfig: ShellConfig;

    beforeEach(() => {
      shellConfig = { ...secureShellConfig };
    });

    describe('when shell operators are blocked', () => {
      test.each([
        ['command with ampersand', 'echo hello & echo world', '&'],
        ['command with semicolon', 'echo hello; echo world', ';'],
        ['command with pipe', 'echo hello | grep world', '|'],
        ['command with backtick', 'echo `whoami`', '`'],
      ])('should reject %s', (scenario, command, operator) => {
        shellConfig.blockedOperators = [operator];
        
        expect(() => validateShellOperators(command, shellConfig))
          .toThrow(expect.objectContaining({
            message: expect.stringContaining(`blocked operator: ${operator}`),
            code: ErrorCode.InvalidRequest
          }));
      });
    });

    describe('when shell operators are allowed', () => {
      test('should allow commands without blocked operators', () => {
        shellConfig.blockedOperators = ['&'];
        
        expect(() => validateShellOperators('echo hello | grep world', shellConfig))
          .not.toThrow();
      });
    });
  });
});
```

## Conclusion

These improvements will significantly enhance the test suite's reliability, maintainability, and coverage. The focus should be on fixing immediate issues (ES modules) first, then gradually implementing the other improvements following the priority order.
