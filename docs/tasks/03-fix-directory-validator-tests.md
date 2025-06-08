# Task: Fix Directory Validator Error Message Test Expectations

## Overview and Problem Statement

The `directoryValidator.test.ts` tests are failing because the regular expressions used to validate error messages don't match the actual error message format produced by the `validateDirectoriesAndThrow` function. The actual error messages are more detailed and structured than what the tests expect.

**Current Issue:**

- Tests expect: `StringMatching /directory is outside.*C:\\Windows\\System32/i`
- Actual message: `"MCP error -32600: The following directory is outside allowed paths: C:\\Windows\\System32. Allowed paths are: C:\\Users\\test, D:\\Projects. Commands with restricted directory are not allowed to execute."`

The tests need to be updated to match the actual, more descriptive error message format.

## Technical Implementation Details

### File: `tests/directoryValidator.test.ts`

The test expectations need to be updated to match the actual error message format. The current tests use overly simple regex patterns that don't account for the full error message structure.

**Location:** Find the `validateDirectoriesAndThrow error messages` describe block

**Current test structure:**

```typescript
test.each([
  [
    ['C:\\Windows\\System32'],
    'directory is outside.*C:\\\\Windows\\\\System32'
  ],
  // ...
])('should throw with correct message for %j', (invalidDirs, expectedPattern) => {
  expect(() => validateDirectoriesAndThrow(invalidDirs, allowedPaths))
    .toThrow(expect.stringMatching(new RegExp(expectedPattern, 'i')));
});
```

**Updated test structure:**

```typescript
test.each([
  [
    ['C:\\Windows\\System32'],
    [
      'MCP error -32600',
      'The following directory is outside allowed paths:',
      'C:\\\\Windows\\\\System32',
      'Allowed paths are:',
      'C:\\\\Users\\\\test, D:\\\\Projects',
      'Commands with restricted directory are not allowed to execute'
    ]
  ],
  [
    ['E:\\Dir1', 'F:\\Dir2'],
    [
      'MCP error -32600',
      'The following directories are outside allowed paths:',
      'E:\\\\Dir1, F:\\\\Dir2',
      'Allowed paths are:',
      'C:\\\\Users\\\\test, D:\\\\Projects',
      'Commands with restricted directories are not allowed to execute'
    ]
  ],
  // ...
])('should throw with correct message for %j', (invalidDirs, expectedParts) => {
  expect(() => validateDirectoriesAndThrow(invalidDirs, allowedPaths))
    .toThrow(expect.objectContaining({
      code: ErrorCode.InvalidRequest,
      message: expect.stringMatching(new RegExp(expectedParts.join('.*'), 'i'))
    }));
});
```

## Working Examples

### Single Invalid Directory

```typescript
// Input
validateDirectoriesAndThrow(['C:\\Windows\\System32'], ['C:\\Users\\test', 'D:\\Projects']);

// Expected Error
McpError {
  code: -32600,
  message: "MCP error -32600: The following directory is outside allowed paths: C:\\Windows\\System32. Allowed paths are: C:\\Users\\test, D:\\Projects. Commands with restricted directory are not allowed to execute."
}
```

### Multiple Invalid Directories

```typescript
// Input
validateDirectoriesAndThrow(['E:\\Dir1', 'F:\\Dir2'], ['C:\\Users\\test', 'D:\\Projects']);

// Expected Error
McpError {
  code: -32600,
  message: "MCP error -32600: The following directories are outside allowed paths: E:\\Dir1, F:\\Dir2. Allowed paths are: C:\\Users\\test, D:\\Projects. Commands with restricted directories are not allowed to execute."
}
```

## Unit Test Requirements

### File: `tests/directoryValidator.test.ts` requirements

Update all test cases in the `validateDirectoriesAndThrow error messages` section:

```typescript
describe('validateDirectoriesAndThrow error messages', () => {
  test.each([
    [
      ['C:\\Windows\\System32'],
      [
        'MCP error -32600',
        'The following directory is outside allowed paths:',
        'C:\\\\Windows\\\\System32',
        'Allowed paths are:',
        'C:\\\\Users\\\\test, D:\\\\Projects',
        'Commands with restricted directory are not allowed to execute'
      ]
    ],
    [
      ['E:\\Dir1', 'F:\\Dir2'],
      [
        'MCP error -32600',
        'The following directories are outside allowed paths:',
        'E:\\\\Dir1, F:\\\\Dir2',
        'Allowed paths are:',
        'C:\\\\Users\\\\test, D:\\\\Projects',
        'Commands with restricted directories are not allowed to execute'
      ]
    ],
    [
      ['C:\\Program Files'],
      [
        'MCP error -32600',
        'The following directory is outside allowed paths:',
        'C:\\\\Program Files',
        'Allowed paths are:',
        'C:\\\\Users\\\\test, D:\\\\Projects',
        'Commands with restricted directory are not allowed to execute'
      ]
    ]
  ])('should throw with correct message for %j', (invalidDirs, expectedParts) => {
    expect(() => validateDirectoriesAndThrow(invalidDirs, allowedPaths))
      .toThrow(expect.objectContaining({
        code: ErrorCode.InvalidRequest,
        message: expect.stringMatching(new RegExp(expectedParts.join('.*'), 'i'))
      }));
  });
});
```

### Additional Test for Proper Error Structure

```typescript
test('error message has correct structure and includes all information', () => {
  const invalidDirs = ['C:\\Invalid\\Path'];
  const allowedPaths = ['C:\\Allowed\\Path1', 'D:\\Allowed\\Path2'];
  
  try {
    validateDirectoriesAndThrow(invalidDirs, allowedPaths);
    fail('Should have thrown an error');
  } catch (error) {
    expect(error).toBeInstanceOf(McpError);
    expect(error.code).toBe(ErrorCode.InvalidRequest);
    
    // Verify all parts of the message are present
    expect(error.message).toContain('MCP error -32600');
    expect(error.message).toContain('The following directory is outside allowed paths:');
    expect(error.message).toContain('C:\\Invalid\\Path');
    expect(error.message).toContain('Allowed paths are:');
    expect(error.message).toContain('C:\\Allowed\\Path1, D:\\Allowed\\Path2');
    expect(error.message).toContain('Commands with restricted directory are not allowed to execute');
  }
});
```

## Documentation Updates

### File: `src/utils/directoryValidator.ts` (Comments)

Ensure the function documentation matches the actual error message format:

```typescript
/**
 * Validates directories and throws an error if any are not allowed
 * @param directories List of directories to validate
 * @param allowedPaths List of allowed paths
 * @throws McpError with detailed message including:
 *   - Which directories are invalid
 *   - What the allowed paths are
 *   - Clear indication that commands cannot execute
 */
export function validateDirectoriesAndThrow(directories: string[], allowedPaths: string[]): void {
```

## Implementation Phases

### Phase 1: Update Test Expectations

1. Locate the failing tests in `tests/directoryValidator.test.ts`
2. Update the test structure to use arrays of expected message parts
3. Use `expect.objectContaining` to check both error code and message

### Phase 2: Verify Error Message Format

1. Run a single test to capture the exact error message format
2. Ensure the test expectations match the actual format exactly
3. Pay attention to singular vs plural forms ("directory" vs "directories")

### Phase 3: Run All Directory Validator Tests

1. Run the specific test file: `npm test tests/directoryValidator.test.ts`
2. Ensure all tests pass
3. Verify no regression in error handling

## Acceptance Criteria

### Functional Requirements

- [ ] All directory validator tests pass
- [ ] Error messages remain informative and include all necessary details
- [ ] Singular/plural grammar is correctly handled in error messages
- [ ] Error code remains consistent (-32600 / InvalidRequest)

### Technical Requirements

- [ ] Tests use proper Jest matchers for error validation
- [ ] Regular expressions correctly escape special characters
- [ ] Test structure is maintainable and clear

### Testing Requirements

- [ ] All three failing test cases pass
- [ ] Additional structure validation test passes
- [ ] No regression in other directory validator tests
- [ ] Error messages are properly validated for content

### Validation Steps

1. Run directory validator tests: `npm test tests/directoryValidator.test.ts`
2. Verify specific test output shows all tests passing
3. Run full test suite to ensure no regression: `npm test`

## Risk Assessment

### Technical Risks

1. **Risk:** Tests become too tightly coupled to exact message format
   - **Mitigation:** Use regex with `.*` to allow some flexibility in message structure

2. **Risk:** Future changes to error messages break tests
   - **Mitigation:** Document the expected error format clearly in the function

3. **Risk:** Different error messages for edge cases not covered
   - **Mitigation:** Add comprehensive test coverage for various scenarios
