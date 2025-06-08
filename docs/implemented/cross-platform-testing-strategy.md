# Proposed Cross-Platform Testing Strategy for CLI Server

## 1. Introduction

This document outlines a proposed strategy for comprehensively testing the CLI server's shell execution capabilities across different operating systems (Windows, Linux) and environments (local development, CI/GitHub Actions).

The primary goal is to ensure robust and reliable shell command execution while minimizing dependencies on specific local user configurations and providing clear feedback when tests are skipped due to environmental limitations.

## 2. Core Principles

- **Maximize Native OS Coverage:** Test supported shells (e.g., `cmd.exe`, `powershell` on Windows; `bash`, `sh` on Linux) directly on their native operating systems.
- **Strategic Emulation/Mocking:** Use emulators or mocks (like the Node.js-based `wsl-emulator.js`) for:
  - Testing server logic for shells not available on the current test platform (e.g., WSL-specific parsing logic when running tests on Linux).
  - Unit-testing command construction and output parsing without needing full shell execution.
- **Clear Test Scopes:** Distinguish between:
  - **Unit Tests:** Focus on the server's internal logic, configuration parsing, command construction, and error handling using emulators where appropriate.
  - **Integration Tests:** Focus on end-to-end interaction with actual shells and system environments.
- **Graceful Skipping:** Tests requiring specific shells or tools not present in the current environment should be skipped gracefully with informative messages, rather than failing.
- **Minimize External Dependencies:** Reduce reliance on non-standard tools (e.g., assuming Git Bash is always installed and in `PATH` on Windows for tests).

## 3. Proposed Testing Strategy

### 3.1. Windows Environment

- **`cmd.exe` & `powershell.exe`:**
  - **Method:** Direct execution. These are native to Windows.
  - **Focus:** Command formation, argument escaping, output parsing (stdout, stderr), exit code handling, working directory validation, security (injection protection).
  - **Tests:** Integration tests verifying successful execution, error conditions, and edge cases.

- **Git Bash (if official support is desired):**
  - **Method:** Conditionally test if `bash.exe` (typically from Git for Windows) is found (e.g., check common install paths, `PATH`).
    - If found: Run integration tests similar to `cmd.exe`/`powershell.exe`, paying attention to path conversions (e.g., `/c/foo` vs `C:\foo`) if the server handles these.
    - If not found: Gracefully skip Git Bash-specific integration tests.
  - **Focus:** Similar to other shells, plus any Git Bash-specific behaviors the server needs to support.
  - **Note:** Avoid making Git Bash a hard requirement for all tests to run on Windows. The Node.js WSL emulator handles `bash` script execution for WSL emulation tests independently.

- **Windows Subsystem for Linux (WSL):**
  - **A. WSL Command Emulation (Unit/Logic Tests - Platform Agnostic):**
    - **Method:** Utilize the `scripts/wsl-emulator.js` (Node.js script).
    - **Focus:** Test the server's ability to:
      - Parse mock output from `wsl.exe -l -v` (provided by the emulator).
      - Correctly determine if WSL is "enabled" based on emulated output.
      - Construct commands for `wsl.exe -e ...`.
      - Handle responses from the emulated environment.
    - **Environment:** Runs on any OS where Node.js is present (Windows, Linux CI).

  - **B. Real `wsl.exe` Interaction (Integration Tests - Windows Only):**
    - **Method:** Conditionally run tests if a functional `wsl.exe` and at least one WSL distribution are detected on the Windows test machine.
    - **Detection:** A helper function (e.g., `isWslTrulyAvailable()`) would attempt to run a benign command like `wsl.exe --status` or `wsl.exe -l -v`.
    - **Configuration:** If available, tests configure the server to use the actual `wsl.exe`.
    - **Focus:** End-to-end command execution via `wsl.exe`, path mapping, working directory behavior within the WSL environment, error propagation from WSL.
    - **Skipping:** If `wsl.exe` is not functional, these specific integration tests are skipped.

### 3.2. Linux Environment (e.g., GitHub Actions Container)

- **Native Linux Shells (`bash`, `sh`, `zsh`, etc.):**
  - **Method:** Direct execution.
  - **Focus:** Command formation, output parsing, exit codes, working directories, security.

- **Windows-specific Shells (`cmd.exe`, `powershell.exe`):**
  - **Method:** These shells are not available.
  - **Server Logic Tests:** Tests verifying that the server *recognizes* these shell configurations (e.g., in `config.shells.cmd`) and can *attempt* to build commands for them can still run. The actual execution part would be mocked or expected to fail in a controlled manner (or these specific execution tests skipped via `process.platform !== 'win32'`).
  - **Integration Tests:** Full integration tests for `cmd.exe`/`powershell.exe` execution must be skipped on Linux.

- **WSL:**
  - **WSL Command Emulation:** The `scripts/wsl-emulator.js` tests (as described in 3.1.A) will run successfully on Linux, verifying the server's WSL-related logic against the emulator.
  - **Real `wsl.exe` Interaction:** Tests requiring actual `wsl.exe` (as in 3.1.B) must be skipped on Linux.

- **Git Bash (as a concept):**
  - On Linux, if a shell configuration is named 'gitbash', it would typically just resolve to `/bin/bash` or another standard Linux bash. Tests should reflect this behavior rather than expecting Windows-specific Git Bash path translations.

## 4. Test Structure & Implementation Recommendations

- **Helper Functions for Conditional Tests:**

  ```typescript
  // In a test utility file
  import { execSync, spawnSync } from 'child_process';
  import os from 'os';

  export function isWindows(): boolean { return os.platform() === 'win32'; }
  export function isLinux(): boolean { return os.platform() === 'linux'; }

  export function isWslTrulyAvailable(): boolean {
    if (!isWindows()) return false;
    try {
      const result = spawnSync('wsl.exe', ['-l', '-v'], { timeout: 2000, encoding: 'utf8' });
      return result.status === 0 && result.stdout.includes('VERSION'); // Check for valid output
    } catch (e) { return false; }
  }

  export function isShellAvailable(command: string): boolean {
    try {
      // For Windows, use 'where' and for Linux 'command -v' or 'which'
      const checkCmd = isWindows() ? 'where' : 'command -v';
      execSync(`${checkCmd} ${command}`, { stdio: 'ignore' });
      return true;
    } catch (e) { return false; }
  }
  ```

- **Test File Organization:**
  - `wsl.test.ts`: Focus on WSL emulation logic using `wsl-emulator.js`. These are largely platform-agnostic.
  - **Example Configuration in `tests/wsl.test.ts`:**

    ```typescript
    import path from 'path';
    import { ServerConfig } from '../src/serverConfig'; // Adjust import path as needed
    import { DEFAULT_CONFIG } from '../src/defaultConfig'; // Adjust import path

    const wslEmulatorPath = path.resolve(__dirname, '../../scripts/wsl-emulator.js'); // Path to the Node.js emulator
    let testConfig: ServerConfig;

    beforeEach(() => {
      testConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      if (testConfig.shells.wsl) { // Ensure wsl shell config exists
          testConfig.shells.wsl = {
              enabled: true,
              command: 'node', // Use Node.js to run the emulator
              args: [wslEmulatorPath, '-e'], // Pass emulator script and '-e' flag
              validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
              blockedOperators: ['&', '|', ';', '`']
          };
      } else {
          // Handle case where wsl config might not be in DEFAULT_CONFIG
          testConfig.shells.wsl = {
              enabled: true,
              command: 'node',
              args: [wslEmulatorPath, '-e'],
              validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
              blockedOperators: ['&', '|', ';', '`'],
              // Potentially other ShellConfig properties if required by type
          };
      }
      
      // Disable other shells for focused WSL emulation testing
      if (testConfig.shells.cmd) testConfig.shells.cmd.enabled = false; else testConfig.shells.cmd = { enabled: false, command: '', args:[] };
      if (testConfig.shells.powershell) testConfig.shells.powershell.enabled = false; else testConfig.shells.powershell = { enabled: false, command: '', args:[] };
      if (testConfig.shells.gitbash) testConfig.shells.gitbash.enabled = false; else testConfig.shells.gitbash = { enabled: false, command: '', args:[] };
    });

    // ... rest of the tests using this testConfig ...
    ```

  - `wsl.integration.test.ts` (New): Contains tests that interact with a *real* `wsl.exe`. These would use `describe.skipIf(!isWslTrulyAvailable())`.
  - `shellExecution.test.ts`: Can be parameterized or split to cover:
    - Native Windows shells (run/skip based on `isWindows()`).
    - Native Linux shells (run/skip based on `isLinux()`).
    - Git Bash (run/skip based on `isWindows() && isShellAvailable('bash.exe')`).
  - `config.test.ts`: Test server behavior with various shell configurations, ensuring it correctly identifies and prepares commands even if the shell isn't executable in the current environment (mocking the execution part).

- **VS Code Tasks (`tasks.json`):**
  - Revert Windows tasks to use `cmd.exe` as the default shell, as the Node.js emulator removes the Git Bash dependency for core WSL emulation tests.

- **GitHub Actions Workflow (`.github/workflows/ci.yml`):**
  - **Windows Runner:** Should have `wsl.exe` enabled/installed by default for GitHub-hosted runners if real WSL integration tests are to run. Tests for `cmd.exe`, `powershell.exe` will run. Git Bash tests will run if Git is installed (common).
  - **Linux Runner:** Standard Linux shells will run. WSL emulator tests will run. Real WSL tests and Windows-native shell execution tests will be skipped.

## 5. Action Plan Summary

1. **Review & Finalize `wsl-emulator.js`:** Ensure it robustly covers the necessary `wsl.exe` arguments for emulation (`-l -v`, `-e`).
2. **Refactor `tests/wsl.test.ts`:** Ensure it exclusively uses `wsl-emulator.js` and tests the server's logic against this emulator.
3. **Create `tests/wsl.integration.test.ts`:** Implement tests that interact with a real `wsl.exe`, using `isWslTrulyAvailable()` for conditional execution.
4. **Update `tests/shellExecution.test.ts` (and potentially others):**
   - Implement conditional skipping for tests based on `process.platform` and shell availability (e.g., `isShellAvailable('cmd.exe')`, `isShellAvailable('powershell.exe')`).
   - Parameterize tests to run against different shell configurations where applicable.
5. **Update `tasks.json`:** Revert Windows-specific tasks to use `cmd.exe` as the shell, as the primary reason for using Git Bash (for `wsl.sh`) is removed by `wsl-emulator.js`.
6. **Verify GitHub Actions:** Ensure the CI pipeline correctly executes and skips tests on both Windows and Linux runners according to this strategy.
7. **Documentation:** Update any relevant developer documentation regarding testing procedures.
8. **Cleanup:** Remove `scripts/wsl.sh` once `wsl-emulator.js` is fully integrated and tested.
9. **(Optional but Recommended)** Add/Verify `.gitattributes` to enforce LF line endings for script files (`.js`, `.sh` if any remain) to prevent cross-platform issues.

This strategy aims to provide a balanced approach, ensuring high confidence in the server's shell execution capabilities across platforms while maintaining a manageable and understandable test suite.
