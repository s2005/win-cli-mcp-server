# Implementation Plan: Optional `initialDir` Configuration

## 1. Objective

Introduce an optional `initialDir` setting within the `security` section of `config.json`. This setting will allow users to specify a preferred starting directory for the server. If provided and valid, the server will attempt to change its current working directory (CWD) to this path at startup. This `initialDir` will also be implicitly added to `allowedPaths` if `restrictWorkingDirectory` is enabled.

## 2. Detailed File Modifications

### 2.1. `src/types/config.ts`

**Modify `SecurityConfig` interface:**
Add `initialDir` as an optional string property.

```typescript
export interface SecurityConfig {
  maxCommandLength: number;
  blockedCommands: string[];
  blockedArguments: string[];
  allowedPaths: string[];
  restrictWorkingDirectory: boolean;
  commandTimeout: number;
  enableInjectionProtection: boolean;
  initialDir?: string; // New property
}
```

### 2.2. `src/utils/config.ts`

**Update `DEFAULT_CONFIG`:**
Add `initialDir: undefined` to the `security` object.

```typescript
export const DEFAULT_CONFIG: ServerConfig = {
  security: {
    // ... other security properties
    initialDir: undefined, // New property
    allowedPaths: [
      os.homedir(),
      process.cwd()
    ],
    restrictWorkingDirectory: true,
    // ... other security properties
  },
  // ... shells config
};
```

**Modify `loadConfig` function:**
After merging user config with defaults (`mergedConfig = mergeConfigs(...)`) and before `validateConfig(mergedConfig)`:

1. **Check and Validate `initialDir`**:

    ```typescript
    if (mergedConfig.security.initialDir && typeof mergedConfig.security.initialDir === 'string') {
      let normalizedInitialDir = normalizeWindowsPath(mergedConfig.security.initialDir);

      if (fs.existsSync(normalizedInitialDir) && fs.statSync(normalizedInitialDir).isDirectory()) {
        mergedConfig.security.initialDir = normalizedInitialDir; // Store normalized path

        if (mergedConfig.security.restrictWorkingDirectory) {
          // Add to allowedPaths if not already present
          if (!mergedConfig.security.allowedPaths.includes(normalizedInitialDir)) {
            mergedConfig.security.allowedPaths.push(normalizedInitialDir);
          }
          // Re-normalize allowedPaths to handle the new addition and deduplicate
          mergedConfig.security.allowedPaths = normalizeAllowedPaths(mergedConfig.security.allowedPaths);
        }
      } else {
        console.warn(`WARN: Configured initialDir '${mergedConfig.security.initialDir}' does not exist or is not a directory. Falling back to default CWD behavior.`);
        mergedConfig.security.initialDir = undefined; // Invalidate if path is bad
      }
    } else if (mergedConfig.security.initialDir) {
        // Handle cases where initialDir might be present but not a string (e.g. null from JSON)
        console.warn(`WARN: Configured initialDir is not a valid string. Falling back to default CWD behavior.`);
        mergedConfig.security.initialDir = undefined;
    }
    ```

**Note on `mergeConfigs`:** The existing spread syntax for `userConfig.security` should correctly overlay `initialDir` if present in the user's config file.

### 2.3. `src/index.ts` (`CLIServer` constructor)

Modify the CWD initialization logic:

```typescript
// Inside CLIServer constructor, after this.config is set and this.allowedPaths/this.blockedCommands are initialized

let candidateCwd: string | undefined = undefined;
let chdirFailed = false;
const startupMessages: string[] = [];

// 1. Attempt to use configured initialDir
if (this.config.security.initialDir && typeof this.config.security.initialDir === 'string') {
    try {
        // initialDir should already be normalized and validated for existence by loadConfig
        process.chdir(this.config.security.initialDir);
        candidateCwd = this.config.security.initialDir; // It's already normalized
        startupMessages.push(`INFO: Successfully changed current working directory to configured initialDir: ${candidateCwd}`);
    } catch (err) {
        startupMessages.push(`ERROR: Failed to change directory to configured initialDir '${this.config.security.initialDir}': ${(err as Error).message}. Falling back to process CWD.`);
        chdirFailed = true;
        // Fall through to use process.cwd()
    }
}

// 2. Fallback to process.cwd() if initialDir not set or chdir failed
if (!candidateCwd || chdirFailed) {
    candidateCwd = normalizeWindowsPath(process.cwd());
    if (chdirFailed) { // Only log if we are here due to a chdir failure
        startupMessages.push(`INFO: Current working directory remains: ${candidateCwd}`);
    }
}

// 3. Determine serverActiveCwd based on candidateCwd and restrictions
const restrictCwd = this.config.security.restrictWorkingDirectory;
// Ensure allowedPaths from config are normalized for comparison
const normalizedAllowedPathsFromConfig = this.config.security.allowedPaths.map(p => normalizeWindowsPath(p));

if (restrictCwd && normalizedAllowedPathsFromConfig.length > 0) {
    const isCandidateCwdAllowed = isPathAllowed(candidateCwd, normalizedAllowedPathsFromConfig);
    if (!isCandidateCwdAllowed) {
        this.serverActiveCwd = undefined;
        startupMessages.push(`INFO: Server's effective starting directory: ${candidateCwd}`);
        startupMessages.push("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.");
        startupMessages.push("INFO: The server's active working directory is currently NOT SET.");
        startupMessages.push("INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.");
        startupMessages.push(`INFO: Configured allowed paths are: ${normalizedAllowedPathsFromConfig.join(', ')}`);
    } else {
        this.serverActiveCwd = candidateCwd;
        startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
    }
} else {
    this.serverActiveCwd = candidateCwd;
    startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
}

// Log all startup messages
startupMessages.forEach(msg => console.error(msg));

// this.setupHandlers(); // Should be called after all initialization
```

## 3. Unit Test Considerations

### 3.1. `src/utils/config.test.ts`

**New tests for `loadConfig`:**

- Scenario: `initialDir` provided, valid, `restrictWorkingDirectory: true`.
  - Assert: `initialDir` is correctly normalized in the returned config.
  - Assert: Normalized `initialDir` is present in `mergedConfig.security.allowedPaths`.
  - Assert: `allowedPaths` are correctly deduplicated and normalized.
- Scenario: `initialDir` provided, valid, `restrictWorkingDirectory: false`.
  - Assert: `initialDir` is correctly normalized in the returned config.
  - Assert: `allowedPaths` are not modified *unless* `initialDir` was already part of them or default paths.
- Scenario: `initialDir` provided, but path is invalid (does not exist or not a directory).
  - Mock `fs.existsSync` and/or `fs.statSync` to simulate invalid path.
  - Assert: `mergedConfig.security.initialDir` is `undefined`.
  - Assert: `console.warn` was called with the appropriate message (mock `console.warn`).
- Scenario: `initialDir` is not provided in user config.
  - Assert: `mergedConfig.security.initialDir` is `undefined` (from `DEFAULT_CONFIG`).
- Scenario: `initialDir` is provided as non-string (e.g., `null`).
  - Assert: `mergedConfig.security.initialDir` is `undefined`.
  - Assert: `console.warn` was called.

### 3.2. `src/index.test.ts` (or `CLIServer.test.ts`)

**Modify/Add tests for `CLIServer` constructor:**
(Requires mocking `process.chdir`, `process.cwd`, `fs.existsSync`, `fs.statSync`, `console.error`, `console.warn`)

- Scenario: `config.security.initialDir` is set and valid, `process.chdir` succeeds.
  - Assert: `process.chdir` was called with the normalized `initialDir`.
  - Assert: `this.serverActiveCwd` is set to `initialDir` (if allowed or no restrictions).
  - Assert: Correct informational log messages are printed.
- Scenario: `config.security.initialDir` is set and valid, but `process.chdir` fails.
  - Mock `process.chdir` to throw an error.
  - Assert: Server falls back to using `process.cwd()` logic.
  - Assert: `this.serverActiveCwd` is determined based on `process.cwd()` and restrictions.
  - Assert: Error message regarding `chdir` failure is logged.
- Scenario: `config.security.initialDir` is not set.
  - Assert: Server uses `process.cwd()` logic for `serverActiveCwd` (existing test cases should cover this, but verify context).
- Scenario: `config.security.initialDir` is set, `restrictWorkingDirectory: true`, `initialDir` is valid and was successfully added to `allowedPaths` by `loadConfig`.
  - Assert: `this.serverActiveCwd` is set to `initialDir`.
- Scenario: `config.security.initialDir` is set, `restrictWorkingDirectory: true`, but `initialDir` is *not* in `allowedPaths` (e.g., `loadConfig` somehow failed to add it, or path became invalid post-loadConfig - less likely but good for robustness).
  - Assert: `this.serverActiveCwd` is `undefined` (due to restriction check failing).
  - Assert: Appropriate warning/info logs are printed.

## 4. Logging

- Ensure `CLIServer` constructor logs:
  - Successful change to `initialDir`.
  - Failure to change to `initialDir` and fallback reason.
  - The final `serverActiveCwd` and how it was determined (especially if `undefined` due to restrictions).
- Ensure `loadConfig` logs a warning if a provided `initialDir` is invalid (non-existent, not a directory, or not a string).

## 5. Acceptance Criteria

1. **Configuration Parsing:**
   - The server correctly reads the `initialDir` string from `config.json` if provided.
   - If `initialDir` is not a string or is missing, the server defaults to `undefined` for this setting and logs a warning if an invalid type was provided.
2. **Path Validation (`loadConfig`):**
   - If `initialDir` is provided, its existence as a directory is validated.
   - If invalid (non-existent or not a directory), `initialDir` is treated as `undefined` for server logic, and a warning is logged.
   - If valid and `restrictWorkingDirectory` is `true`, the normalized `initialDir` is added to the `allowedPaths` array (and the array is re-normalized/deduplicated).
3. **Server Startup Behavior (`CLIServer` constructor):**
   - If `initialDir` is configured and valid:
     - `process.chdir()` is called with the normalized `initialDir`.
     - If `chdir` succeeds, `serverActiveCwd` is set to this `initialDir` (provided it also passes `allowedPaths` check if restrictions are on).
     - Appropriate INFO/ERROR messages are logged regarding the `chdir` attempt and outcome.
   - If `initialDir` is not configured, invalid, or `chdir` fails:
     - The server falls back to using `process.cwd()` as the basis for determining `serverActiveCwd`.
     - The existing logic for `serverActiveCwd` (uninitialized if restricted and `process.cwd()` is not allowed) applies.
4. **Logging:**
   - All specified INFO, WARN, and ERROR messages related to `initialDir` processing in `loadConfig` and `CLIServer` constructor are correctly logged to `console.error` or `console.warn` as appropriate.
5. **Functionality with `initialDir`:**
   - When `serverActiveCwd` is successfully set via `initialDir`:
     - `get_current_directory` tool returns the `initialDir`.
     - `execute_command` without an explicit `workingDir` uses `initialDir`.
   - When `initialDir` leads to `serverActiveCwd` being `undefined` (e.g., `initialDir` itself is not in `allowedPaths` when restrictions are on):
     - Behavior matches the "Explicit CWD Initialization Plan" (user prompted to set CWD).
6. **No Regressions:**
   - Existing server functionalities (command execution with explicit `workingDir`, CWD restrictions when `initialDir` is not used, other tools) remain unaffected and operate as expected.
7. **Unit Tests:**
   - All new and modified unit tests outlined in section "3. Unit Test Considerations" pass successfully.
   - The command `npm run test` (or equivalent test execution command for the project) completes without any new errors or failures introduced by these changes.
8. **Documentation:**
   - (Out of scope for this specific implementation task, but for completeness) README and relevant tool descriptions should be updated to reflect the new `initialDir` option and its behavior.

This plan covers the necessary code changes, unit test adjustments, logging considerations, and acceptance criteria for implementing the `initialDir` feature.
