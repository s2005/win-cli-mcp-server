# Implementation Plan: Explicit CWD Initialization

## 1. Overview

This document outlines the plan to implement a more explicit Current Working Directory (CWD) initialization mechanism for the `win-cli-mcp-server`.

**Current Problem:**
When the server starts, it implicitly uses `process.cwd()` (the directory it was launched from) as its default CWD. If `security.restrictWorkingDirectory` is `true` and `security.allowedPaths` are defined, and this launch directory is not within the `allowedPaths`, commands executed without an explicit `workingDir` can fail, or the server's behavior might be confusing.

**Proposed Solution:**
The server will maintain an internal state for its "active working directory" (`serverActiveCwd`).

- If the server starts under restrictions (`restrictWorkingDirectory: true`, `allowedPaths` are set) and its launch directory (`process.cwd()`) is NOT compliant with `allowedPaths`, then `serverActiveCwd` will remain uninitialized (`undefined`).
- In this state, any `execute_command` call that *omits* the `workingDir` parameter will be rejected, prompting the user to first set a valid CWD using the `set_current_directory` tool.
- If the launch directory IS compliant, or if restrictions are not active, `serverActiveCwd` will be initialized to the (normalized) `process.cwd()` as before.

This approach makes the server's CWD state explicit and guides the user to establish a compliant CWD when necessary.

## 2. Core Logic Changes

### 2.1. `CLIServer` Class Modifications

**New Private Member:**

```typescript
private serverActiveCwd: string | undefined;
```

**Constructor (`constructor`) Changes:**

1. Retrieve `process.cwd()` (e.g., `const launchDir = process.cwd();`).
2. Normalize it using `normalizeWindowsPath` (e.g., `const normalizedLaunchDir = normalizeWindowsPath(launchDir);`).
3. Implement conditional logic:

    ```typescript
    const restrictCwd = this.config.security.restrictWorkingDirectory;
    const allowedPathsDefined = this.config.security.allowedPaths && this.config.security.allowedPaths.length > 0;

    if (restrictCwd && allowedPathsDefined) {
      const isLaunchDirAllowed = isPathAllowed(normalizedLaunchDir, this.config.security.allowedPaths);
      if (!isLaunchDirAllowed) {
        this.serverActiveCwd = undefined;
        // Log specific informational message (see Section 3)
      } else {
        this.serverActiveCwd = normalizedLaunchDir;
        // Log informational message about CWD initialization (see Section 3)
      }
    } else {
      this.serverActiveCwd = normalizedLaunchDir;
      // Log informational message about CWD initialization (see Section 3)
    }
    ```

**`_executeTool` method (for `execute_command` tool):**

- When `workingDir` parameter is **NOT** provided in the command arguments:
    1. Check `this.serverActiveCwd`.
    2. If `this.serverActiveCwd` is `undefined`:
        - Reject the command.
        - Return an error `CallToolResult` with a message like: `"Error: Server's active working directory is not set. Please use the 'set_current_directory' tool to establish a valid working directory before running commands without an explicit 'workingDir'."`
    3. If `this.serverActiveCwd` is defined:
        - Use `this.serverActiveCwd` as the CWD for command execution.
- When `workingDir` parameter **IS** provided:
  - Behavior remains largely the same: use the provided `workingDir`, validate it against `allowedPaths` if `restrictWorkingDirectory` is `true`. (Ensure this validation uses `this.config.security.allowedPaths`).

**`_executeTool` method (for `set_current_directory` tool):**

1. Get the `path` argument.
2. Normalize it: `const newNormalizedDir = normalizeWindowsPath(args.path);`
3. If `this.config.security.restrictWorkingDirectory` is `true`:
    - Validate `newNormalizedDir` against `this.config.security.allowedPaths` using `isPathAllowed` (or `validateWorkingDirectory` which throws).
    - If invalid, reject the request and return an appropriate error `CallToolResult`.
4. If valid (or if restrictions are not active):
    - Update `this.serverActiveCwd = newNormalizedDir;`
    - Call `process.chdir(newNormalizedDir);` to change the underlying Node.js process CWD.
    - Return a success `CallToolResult` indicating the new CWD.

**`_executeTool` method (for `get_current_directory` tool):**

1. If `this.serverActiveCwd` is `undefined`:
    - Return a `CallToolResult` with text like: `"The server's active working directory is not currently set. Use 'set_current_directory' to set it."`
2. Else:
    - Return a `CallToolResult` with `this.serverActiveCwd`.

## 3. Startup Logging

Update startup log messages to reflect the CWD initialization state:

- **If `serverActiveCwd` is set to `undefined` (due to non-compliant launch CWD under restrictions):**

    ```log
    INFO: Server started in directory: [original process.cwd()].
    INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.
    INFO: The server's active working directory is currently NOT SET.
    INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.
    INFO: Configured allowed paths are: [list of normalized allowedPaths from config].
    ```

- **If `serverActiveCwd` is initialized (either restrictions are off, or launch CWD is compliant):**

    ```log
    INFO: Server's active working directory initialized to: [this.serverActiveCwd].
    ```

## 4. Unit Test Modifications and Additions

### 4.1. Existing Tests to Modify

- **`execute_command` tests:**
  - Scenarios where `workingDir` is not provided will need to be tested against different initial states of `serverActiveCwd`.
  - Test setups might need to call `set_current_directory` to establish a `serverActiveCwd` before testing commands that rely on it.
- **`get_current_directory` tests:**
  - Update to assert the new message when `serverActiveCwd` is `undefined`.
- **`set_current_directory` tests:**
  - Ensure tests confirm that `serverActiveCwd` is updated correctly.
  - Verify that `process.chdir()` is called (mocking `process.chdir` might be necessary).
- **Server Startup/Configuration Tests:**
  - Test the initialization logic of `serverActiveCwd` under various configurations:
    - `restrictWorkingDirectory: true`, `allowedPaths` defined, `process.cwd()` (mocked) NOT in `allowedPaths`.
    - `restrictWorkingDirectory: true`, `allowedPaths` defined, `process.cwd()` (mocked) IS in `allowedPaths`.
    - `restrictWorkingDirectory: false`.
    - `allowedPaths` is empty or undefined.
  - Verify the correct startup log messages are emitted for each case.

### 4.2. New Unit Tests to Add

- **`CLIServer` Constructor / Startup Logic:**
  - Dedicated tests for each branch of the `serverActiveCwd` initialization logic described above, mocking `process.cwd()`, `config` values, and checking `this.serverActiveCwd` and logged messages.
- **`execute_command` Tool (Focus on CWD handling):**
  - Given: Server started such that `serverActiveCwd` is `undefined`.
    - When: `execute_command` is called *without* `workingDir`.
    - Then: Command is rejected with the specific "not set" error message.
    - When: `execute_command` is called *with* a valid `workingDir` (that is in `allowedPaths` if restrictions are on).
    - Then: Command executes successfully using the provided `workingDir`.
  - Given: Server started such that `serverActiveCwd` is defined (e.g., compliant launch dir or after `set_current_directory`).
    - When: `execute_command` is called *without* `workingDir`.
    - Then: Command executes successfully using `serverActiveCwd`.
- **`get_current_directory` Tool:**
  - Given: Server started such that `serverActiveCwd` is `undefined`.
    - When: `get_current_directory` is called.
    - Then: Returns the "not set" message.
- **Full Interaction Flow (Consider for integration-style tests if feasible):**
    1. Setup: Server config with `restrictWorkingDirectory: true`, `allowedPaths` defined, mock `process.cwd()` to be outside `allowedPaths`.
    2. Action: Server starts.
    3. Assert: `serverActiveCwd` is `undefined`, correct log message.
    4. Action: Call `get_current_directory` tool.
    5. Assert: Returns "not set" message.
    6. Action: Call `execute_command` tool *without* `workingDir`.
    7. Assert: Command rejected with "not set" error.
    8. Action: Call `set_current_directory` tool with a path that IS in `allowedPaths`.
    9. Assert: Success, `serverActiveCwd` is updated, `process.chdir` was called.
    10. Action: Call `get_current_directory` tool.
    11. Assert: Returns the new CWD.
    12. Action: Call `execute_command` tool *without* `workingDir`.
    13. Assert: Command executes successfully using the new `serverActiveCwd`.

## 5. Impact on `config.json`

- No changes to the structure or fields of `config.json` are required for this feature. The new behavior is driven by existing configuration fields (`security.restrictWorkingDirectory`, `security.allowedPaths`).

## 6. Documentation Updates

- **README.md:**
  - Explain the new CWD initialization logic.
  - Clarify the concept of the server's "active working directory" (`serverActiveCwd`).
  - Detail the requirement to use `set_current_directory` if the server starts in a non-compliant CWD (when restrictions are active) before running commands that omit `workingDir`.
- **Tool Descriptions (in-code or generated):**
  - `execute_command`: Mention the dependency on a set `serverActiveCwd` if `workingDir` is omitted.
  - `get_current_directory`: Describe the "not set" state.
  - `set_current_directory`: Emphasize its role in establishing/changing `serverActiveCwd`.

This plan should provide a solid foundation for implementing the explicit CWD initialization feature.
