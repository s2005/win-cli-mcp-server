# Test Failure Analysis and Debugging Plan

This document outlines the plan to investigate and resolve the failing unit tests in the `win-cli-mcp-server` project.

## Summary of Failing Test Suites

1. `tests/validation.test.ts` (1 failure)
2. `tests/integration/endToEnd.test.ts` (1 failure)
3. `tests/integration/shellExecution.test.ts` (1 failure)
4. `tests/wsl.test.ts` (7 failures)
5. `tests/asyncOperations.test.ts` (3 failures)
6. `tests/directoryValidator.test.ts` (3 failures)

## Investigation and Debugging Steps

The failures will be addressed in the following order, as some issues might be root causes for others.

### Phase 1: Core Path and WSL Execution Issues

#### 1.1. `tests/validation.test.ts` - Path Normalization

    *   **Test:** `Path Normalization › normalizeWindowsPath(\Users\test) should return C:\Users\test`
    *   **Error:** Expected `"C:\\Users\\test"`, Received `"\\\\Users\\test"`
    *   **Action:**
        1.  Review the `normalizeWindowsPath` function (likely in `src/utils/pathNormalization.ts` or a similar utility file).
        2.  Identify why paths that appear to be relative to a drive root (e.g., `\Users\test`) are being prepended with `\\` instead of being resolved to a default drive (e.g., `C:`) or handled as an invalid path if that's the intended behavior for such inputs.
        3.  Modify the logic to correctly normalize these paths according to the expected behavior. This might involve checking if a path starts with a single backslash and then prepending the system drive (e.g., `C:`).
        4.  Run `npm test tests/validation.test.ts` to verify the fix.

#### 1.2. `tests/wsl.test.ts` - Basic WSL Command Execution (Exit Code 127)

    *   **Tests (Examples):**
        *   `Test 1: Basic command execution (echo)`
        *   `Test 4.1: uname -a execution`
    *   **Error:** Commands consistently return exit code 127 ("command not found") and `isError` is unexpectedly `true`.
    *   **Action:**
        1.  Examine the WSL command execution logic (likely in `src/utils/wslUtils.ts`, `src/services/wsl/wslShell.ts`, or the emulator script if one is used, as hinted by "emulator" in test descriptions).
        2.  Verify how `wsl.exe` (or the emulator) is invoked. Check the construction of the command string, paths, arguments, and environment variables.
        3.  Ensure that basic commands like `echo`, `uname` are correctly passed to and found by the WSL environment as invoked by the tests.
        4.  Log the exact command string being executed before it's passed to the shell.
        5.  If an emulator script (e.g., `wsl.sh`) is involved, inspect it for path issues, argument parsing errors, or incorrect command forwarding.
        6.  Run `npm test tests/wsl.test.ts` iteratively, focusing on getting a simple `echo "hello"` command to pass first.

### Phase 2: Integration and More Complex WSL Scenarios

#### 2.1. `tests/integration/endToEnd.test.ts` & `tests/integration/shellExecution.test.ts`

    *   **Tests:**
        *   `endToEnd.test.ts › should execute shell command with proper isolation`
        *   `shellExecution.test.ts › should execute when working directory allowed`
    *   **Error:** Exit code 127 for `pwd` command in `/tmp`.
    *   **Action:**
        1.  These failures are likely symptomatic of the issues in Phase 1.2. Once basic WSL commands execute correctly, re-run these tests.
        2.  If they still fail, specifically investigate the execution of the `pwd` command and the handling of the `/tmp` working directory within the WSL context of these integration tests.
        3.  Ensure `/tmp` is a valid and accessible path in the WSL distribution used for testing, and that the change of directory to `/tmp` is effective.
        4.  Run `npm test tests/integration/endToEnd.test.ts tests/integration/shellExecution.test.ts`.

#### 2.2. `tests/wsl.test.ts` - Remaining WSL Failures

    *   **Tests (Examples):**
        *   `Test 2: Command with a specific error exit code` (Expected 42, Received 127)
        *   `Test 3: Command producing stderr output` (Expected 2, Received 127)
        *   `Test 4.2: Command with multiple arguments (ls -la /tmp)`
        *   `Test 5.1 & 5.1.1: Valid WSL working directory`
    *   **Action:**
        1.  After addressing basic WSL execution (Phase 1.2), revisit these more specific WSL tests.
        2.  For exit code mismatches (e.g., Test 2, Test 3), ensure the test commands (e.g., `exit 42`, `ls /nonexistent`) are actually being executed by WSL and that the error propagation mechanism from WSL back to the test runner is correctly capturing the true exit codes. The current 127 suggests the intended command isn't even running.
        3.  For working directory tests (Test 5.x), verify how WSL paths are handled, translated, and set for commands like `pwd` and `ls`.
        4.  Run `npm test tests/wsl.test.ts` for these specific cases.

### Phase 3: Asynchronous Operations

#### 3.1. `tests/asyncOperations.test.ts`

    *   **Tests:**
        *   `should handle concurrent command executions`
        *   `should queue commands when limit reached`
        *   `should handle concurrent errors independently`
    *   **Error:** `isError` is unexpectedly `true` for commands that should succeed.
    *   **Action:**
        1.  These failures are highly dependent on the underlying command execution (especially WSL commands) working correctly.
        2.  Once WSL commands are stable (Phases 1 & 2), re-run these asynchronous operation tests.
        3.  If failures persist, debug the asynchronous execution logic (likely in `src/services/commandExecutor.ts` or a similar module managing command queues and concurrency).
        4.  Look for issues in promise handling, state management of concurrent commands, and error propagation in these asynchronous scenarios.
        5.  Run `npm test tests/asyncOperations.test.ts`.

### Phase 4: Error Message Validation

#### 4.1. `tests/directoryValidator.test.ts`

    *   **Tests (Examples):**
        *   `should throw with correct message for ["C:\\Windows\\System32"]`
        *   `should throw with correct message for ["E:\\Dir1","F:\\Dir2"]`
        *   `should throw with correct message for ["C:\\Program Files"]`
    *   **Error:** The actual error message string from `McpError` does not precisely match the `expect.stringMatching` regular expression.
    *   **Action:**
        1.  Review the `validateDirectoriesAndThrow` function in `src/utils/directoryValidator.ts`.
        2.  Compare the exact error message string generated by the function with the regular expression pattern used in the test assertions.
        3.  Adjust either the error message format in the `validateDirectoriesAndThrow` function or, more likely, update the regular expression in the test to accurately reflect the intended and actual error message structure. The current actual messages seem quite descriptive.
        4.  For example, the test for `["C:\\Windows\\System32"]` expects `StringMatching /directory is outside.*C:\Windows\System32/i`. The actual message is `"MCP error -32600: The following directory is outside allowed paths: C:\\Windows\\System32. Allowed paths are: C:\\Users\\test, D:\\Projects. Commands with restricted directory are not allowed to execute."`. The regex needs to be updated to match this more detailed format if this detail is desired.
        5.  Run `npm test tests/directoryValidator.test.ts`.

## General Notes

* Use `console.log` or a debugger extensively within the test files and source code to trace execution flow and inspect variable states.
* Run tests individually using `npm test <test_file_path>` or `jest <test_file_path>` to focus efforts on specific failing areas.
* The warning "A worker process has failed to exit gracefully..." suggests potential unhandled promises or open handles (like timers, file streams, or child processes) in some tests or in the server teardown logic. This should be investigated after the primary functional failures are resolved, possibly by running Jest with the `--detectOpenHandles` flag.

This plan provides a structured approach to systematically debug and fix the failing tests.
