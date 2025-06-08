# Task: Fix Path Normalization for Single Backslash Paths

## Overview and Problem Statement

The `normalizeWindowsPath` function in `src/utils/validation.ts` is incorrectly handling paths that start with a single backslash (e.g., `\Users\test`). These paths should be treated as relative to the system drive root and normalized to include the drive letter (e.g., `C:\Users\test`), but currently they're being converted to UNC-style paths with double backslashes (e.g., `\\Users\test`).

**Current Behavior:**

- Input: `\Users\test`
- Output: `\\Users\test`
- Expected: `C:\Users\test`

This causes the test `Path Normalization › normalizeWindowsPath(\Users\test) should return C:\Users\test` to fail.

## Technical Implementation Details

### File: `src/utils/validation.ts`

The `normalizeWindowsPath` function needs to be updated to handle paths starting with a single backslash. These should be treated as paths relative to the system drive root (typically `C:`).

**Location:** Find the `normalizeWindowsPath` function (approximately lines 200-300)

**Current logic flow:**

1. Handles Git Bash paths (`/c/foo`)
2. Handles WSL paths (`/mnt/...`, `/home/...`)
3. Handles Windows paths
4. Currently treats `\Users\test` as a UNC path

**Required changes:**
Add logic to detect and handle single-backslash paths before the UNC path handling:

```typescript
// After Git Bash and WSL path handling, before UNC path handling
else if (tempPath.startsWith('\\') && !tempPath.startsWith('\\\\')) {
  // Single backslash - treat as relative to system drive root
  // Remove the leading backslash and prepend C:
  tempPath = 'C:' + tempPath;
}
```

## Working Examples

### Before Fix

```typescript
normalizeWindowsPath('\\Users\\test') // Returns: "\\\\Users\\test" (incorrect)
normalizeWindowsPath('\\Windows\\System32') // Returns: "\\\\Windows\\System32" (incorrect)
```

### After Fix

```typescript
normalizeWindowsPath('\\Users\\test') // Returns: "C:\\Users\\test" (correct)
normalizeWindowsPath('\\Windows\\System32') // Returns: "C:\\Windows\\System32" (correct)
normalizeWindowsPath('\\\\server\\share') // Still returns: "\\\\server\\share" (UNC path unchanged)
```

## Unit Test Requirements

### File: `tests/validation.test.ts`

The existing test case should pass after the fix:

```typescript
test.each([
  ['\\Users\\test', 'C:\\Users\\test'],
  // ... other test cases
])('normalizeWindowsPath(%s) should return %s', (input, expected) => {
  expect(normalizeWindowsPath(input)).toBe(expected);
});
```

### Additional Test Cases to Verify

Add these test cases to ensure the fix works correctly:

```typescript
// Single backslash paths (should get C: prefix)
['\\Program Files\\App', 'C:\\Program Files\\App'],
['\\Windows', 'C:\\Windows'],
['\\', 'C:\\'],

// Ensure UNC paths still work (double backslash)
['\\\\server\\share', '\\\\server\\share'],
['\\\\192.168.1.1\\folder', '\\\\192.168.1.1\\folder'],
```

## Documentation Updates

### File: `src/utils/validation.ts` (inline comments)

Update the function documentation to clarify the handling of single-backslash paths:

```typescript
/**
 * Normalizes Windows paths to a consistent format
 * - Git Bash paths (/c/foo) → C:\foo
 * - WSL paths (/mnt/..., /home/...) → preserved with forward slashes
 * - Single backslash paths (\Users) → C:\Users (relative to system drive)
 * - UNC paths (\\server\share) → preserved
 * - Relative paths → resolved relative to C:\
 */
export function normalizeWindowsPath(inputPath: string): string {
```

## Implementation Phases

### Phase 1: Update Path Normalization Logic

1. Locate the `normalizeWindowsPath` function in `src/utils/validation.ts`
2. Add the single-backslash detection logic after WSL path handling
3. Ensure the logic distinguishes between single backslash (`\Users`) and double backslash (`\\server`) paths

### Phase 2: Verify Existing Tests

1. Run the specific failing test: `npm test tests/validation.test.ts -- --testNamePattern="normalizeWindowsPath.*Users.*test"`
2. Ensure the test now passes

### Phase 3: Add Additional Test Coverage

1. Add the additional test cases listed above to `tests/validation.test.ts`
2. Run all validation tests: `npm test tests/validation.test.ts`

## Acceptance Criteria

### Functional Requirements

- [ ] Single backslash paths (e.g., `\Users\test`) are normalized to include the system drive letter (e.g., `C:\Users\test`)
- [ ] UNC paths (e.g., `\\server\share`) remain unchanged
- [ ] All existing path normalization behaviors remain intact
- [ ] The failing test `normalizeWindowsPath(\Users\test) should return C:\Users\test` passes

### Technical Requirements

- [ ] No type errors introduced
- [ ] Function maintains backward compatibility
- [ ] Clear distinction between single and double backslash paths in the code logic

### Testing Requirements

- [ ] The specific failing test case passes
- [ ] All existing tests in `tests/validation.test.ts` continue to pass
- [ ] Additional test cases for edge cases pass
- [ ] No regression in other test suites

### Validation Steps

1. Run the specific test: `npm test tests/validation.test.ts -- --testNamePattern="normalizeWindowsPath.*Users.*test"`
2. Run all validation tests: `npm test tests/validation.test.ts`
3. Run the full test suite: `npm test`

## Risk Assessment

### Technical Risks

1. **Risk:** Breaking existing path normalization logic
   - **Mitigation:** Comprehensive test coverage ensures all path types are handled correctly

2. **Risk:** Incorrect assumption about system drive being `C:`
   - **Mitigation:** This matches the existing behavior for other relative paths in the function

3. **Risk:** Edge cases with paths starting with `\` but containing special characters
   - **Mitigation:** The fix specifically checks for single backslash at the start, minimizing edge case impact
