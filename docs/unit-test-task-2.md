# Unit Test Task 2: Create Test Helpers and Utilities

## Priority: HIGH - Fix Immediately

## Description

Create reusable test utilities to reduce duplication across test files, particularly for path mocking and common test setup patterns.

## Scope

- Create path mocking helpers to eliminate repetitive mocking code
- Build common test utilities for configuration and data setup  
- Establish standardized test patterns and helpers

## Files to Modify/Create

- `tests/helpers/pathHelpers.ts` (new file)
- `tests/helpers/testUtils.ts` (new file)
- Update existing test files to use new helpers

## Acceptance Criteria

1. Path mocking is centralized in reusable helper functions
2. Common test setup patterns are extracted into utilities
3. Existing tests are updated to use new helpers
4. Test code duplication is significantly reduced
5. Helper functions are well-documented and typed

## Implementation Details

Create reusable test utilities to reduce duplication:

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

- Create mockWindowsPaths() function for consistent path mocking
- Build configuration builders for different test scenarios
- Extract common beforeEach/afterEach patterns into reusable functions
- Ensure helpers work across different test environments

## Dependencies

- **Requires**: Task 1 (ES Module fixes) must be completed first
- **Blocks**: Tasks 3, 4, 5, 6 (other test improvements will benefit from these helpers)

## Notes

This task will significantly improve maintainability and reduce technical debt in the test suite.
