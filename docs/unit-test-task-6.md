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

## Implementation Details

- Use Jest's `test.each()` for data-driven testing
- Implement better error assertion patterns with `expect.objectContaining()`
- Add home directory expansion tests
- Enhance Windows path normalization test cases

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

```typescript
test('should provide helpful error messages for common issues', () => {
  expect(() => validateWorkingDirectory('E:\\NotAllowed', allowedPaths))
    .toThrow(expect.objectContaining({
      message: expect.stringContaining('allowed paths'),
      code: ErrorCode.InvalidRequest
    }));
});
```

## Dependencies

- **Requires**: Task 1 (ES Module fixes) and Task 2 (Test Helpers)
- **Independent of**: Tasks 3, 4, 5, 7, 8 (can be implemented in parallel)

## Notes

This task will significantly improve test maintainability and coverage without breaking existing functionality.
