import { CLIServer } from '../src/index';
import { ServerConfig } from '../src/types/config';
import { DEFAULT_CONFIG } from '../src/utils/config';
import { McpError, ErrorCode, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path, { dirname } from 'path';
import os from 'os';
import { normalizeWindowsPath } from '../src/utils/validation';
import { fileURLToPath } from 'url';

// ESM compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl.sh');

describe('WSL Shell Execution via Emulator (Tests 1-4)', () => {
  let serverInstance: CLIServer;
  let testConfig: ServerConfig;

  beforeEach(() => {
    testConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    testConfig.shells.wsl = {
      enabled: true,
      command: 'bash', // Explicitly use bash to run the .sh script
      args: [wslEmulatorPath, '-e'], // Pass script path as first arg to bash
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    testConfig.shells.cmd.enabled = false;
    testConfig.shells.powershell.enabled = false;
    testConfig.shells.gitbash.enabled = false;
    testConfig.security.restrictWorkingDirectory = false;
    testConfig.security.enableInjectionProtection = true;
    testConfig.security.blockedArguments = testConfig.security.blockedArguments.filter(arg => arg !== '-e');
    serverInstance = new CLIServer(testConfig);
  });

  test('Test 1: Basic command execution (echo)', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'echo hello wsl via emulator' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello wsl via emulator');
    expect((result.metadata as any)?.exitCode).toBe(0);
  });

  test('Test 2: Command with a specific error exit code', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'exit 42' }
    }) as CallToolResult;
    expect(result.isError).toBe(true);
    expect((result.metadata as any)?.exitCode).toBe(42);
    expect(result.content[0].text).toContain('Command failed with exit code 42');
  });

  test('Test 3: Command producing stderr output', async () => {
    const commandThatGeneratesStderr = 'ls /nonexistent_directory_for_wsl_test_xyz';
    const failingResult = await serverInstance._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: commandThatGeneratesStderr }
    }) as CallToolResult;
    expect(failingResult.isError).toBe(true);
    expect((failingResult.metadata as any)?.exitCode).toBe(2);
    expect(failingResult.content[0].text).toMatch(/No such file or directory|cannot access/i);
    expect(failingResult.content[0].text).toContain('Error output:');
  });

  test('Test 4: Injection protection (semicolon)', async () => {
    try {
      await serverInstance._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'echo bad ; ls' }
      });
      throw new Error('Test failed: Command with semicolon should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      expect(e.message).toContain('Command contains blocked operator: ;');
    }
  });

  test('Test 4.1: uname -a execution', async () => {
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'uname -a' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    expect(result.content[0].text).not.toBe('');
    // Emulator specific output is the raw output of `uname -a`
    expect(result.content[0].text).toMatch(/Msys/i);
  });

  test('Test 4.2: Command with multiple arguments (ls -la /tmp)', async () => {
    // /tmp should generally exist in a Linux-like environment provided by wsl.sh
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'ls -la /tmp' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // Check for actual ls output patterns
    expect(result.content[0].text).toMatch(/total\s\d+/);
    expect(result.content[0].text).toContain('.'); // current directory
    expect(result.content[0].text).toContain('..'); // parent directory
  });

  test('Test 4.3: Command with non-existent path argument (ls /mnt/c)', async () => {
    // The wsl.sh emulator runs in `/app` and does not have `/mnt/c`. This command should fail.
    const result = await serverInstance._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'ls /mnt/c' }
    }) as CallToolResult;
    expect(result.isError).toBe(true); // Expect an error
    expect((result.metadata as any)?.exitCode).not.toBe(0); // Expect non-zero exit code
    // The error message from `ls` itself might be "No such file or directory"
    expect(result.content[0].text).toMatch(/No such file or directory|cannot access/i);
  });
});

describe('WSL Working Directory Validation (Test 5)', () => { // Removed .only
  let serverInstanceForCwdTest: CLIServer;
  let cwdTestConfig: ServerConfig;

  beforeEach(() => {
    cwdTestConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    cwdTestConfig.shells.wsl = {
      enabled: true,
      command: 'bash', // Explicitly use bash to run the .sh script
      args: [wslEmulatorPath, '-e'], // Pass script path as first arg to bash
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    cwdTestConfig.shells.cmd.enabled = false;
    cwdTestConfig.shells.powershell.enabled = false;
    cwdTestConfig.shells.gitbash.enabled = false;

    cwdTestConfig.security.restrictWorkingDirectory = true; // Enable CWD restriction
    cwdTestConfig.security.enableInjectionProtection = false; // Not the focus of these tests

    // Using simplified "tad" for "test_allowed_dir"
    // For WSL CWD tests, allowedPaths should also be in WSL format for consistent comparison
    // as normalizeWindowsPath now preserves /mnt/* paths.
    cwdTestConfig.security.allowedPaths = ['/mnt/c/tad']; // Changed from C:\\tad

    serverInstanceForCwdTest = new CLIServer(cwdTestConfig);
  });

  test('Test 5.1: Valid WSL working directory (/mnt/c/tad/sub)', async () => {
    const wslOriginalPath = '/mnt/c/tad/sub';
    // This path should be allowed by the config ['/mnt/c/tad']

    const result = await serverInstanceForCwdTest._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'wsl',
        command: 'pwd',
        workingDir: wslOriginalPath
      }
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // `pwd` in the emulator (wsl.sh) will output the CWD of the node process (e.g. /app)
    // not the conceptual wslOriginalPath.
    const firstContent = result.content[0];
    if (firstContent && firstContent.type === 'text') {
      expect(normalizeWindowsPath(firstContent.text.trim())).toBe(normalizeWindowsPath(process.cwd()));
    } else {
      throw new Error('Expected first content part to be text for pwd test.');
    }
    // Check that the metadata reflects the intended WSL working directory
    expect((result.metadata as any)?.workingDirectory).toBe(wslOriginalPath);
  });

  test('Test 5.1.1: Valid WSL working directory (/tmp)', async () => {
    // Reconfigure allowedPaths for this test to include a typical Linux path
    // that does not undergo mnt/c style normalization.
    serverInstanceForCwdTest = new CLIServer({
      ...cwdTestConfig,
      security: {
        ...cwdTestConfig.security,
        allowedPaths: ['/tmp'] // Allow /tmp directly
      }
    });

    const wslTmpPath = '/tmp';
    const result = await serverInstanceForCwdTest._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'wsl',
        command: 'ls', // Simple command
        workingDir: wslTmpPath
      }
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as any)?.exitCode).toBe(0);
    // `ls` in the emulator will output files in `process.cwd()`
    expect(result.content[0].text).toContain('src'); // Assuming 'src' is a directory in project root
    expect(result.content[0].text).not.toContain('Executed successfully'); // No longer part of eval output
    expect((result.metadata as any)?.workingDirectory).toBe(wslTmpPath);
  });


  test('Test 5.2: Invalid WSL working directory (not in allowedPaths - /mnt/d/forbidden)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // /mnt/d/forbidden_dir normalizes to D:\forbidden_dir which is not in C:\tad
    const wslInvalidPath = '/mnt/d/forbidden_dir';
    try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslInvalidPath
        }
      });
      throw new Error('Test failed: Command with invalid CWD should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      // Message now includes the originally requested path and the normalized path that failed validation.
      // The path `wslInvalidPath` (/mnt/d/forbidden_dir) is returned as is by normalizeWindowsPath due to recent changes.
      expect(e.message).toContain(`Working directory (${wslInvalidPath}) outside allowed paths`);
    }
  });

  test('Test 5.3: Invalid WSL working directory (valid prefix, not directory containment - /mnt/c/tad_plus_suffix)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // /mnt/c/tad_plus_suffix normalizes to C:\tad_plus_suffix, which is not a subdirectory of C:\tad
    const wslInvalidPathSuffix = '/mnt/c/tad_plus_suffix';
     try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslInvalidPathSuffix
        }
      });
      throw new Error('Test failed: Command with invalid CWD suffix should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      // The path `wslInvalidPathSuffix` is returned as is.
      expect(e.message).toContain(`Working directory (${wslInvalidPathSuffix}) outside allowed paths`);
    }
  });

  test('Test 5.4: Invalid WSL working directory (pure Linux path not allowed - /usr/local)', async () => {
    // serverInstanceForCwdTest is configured with allowedPaths = ['C:\\tad']
    // A pure Linux path like /usr/local will not be in C:\tad.
    const wslPureLinuxPath = '/usr/local';
     try {
      await serverInstanceForCwdTest._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'pwd',
          workingDir: wslPureLinuxPath
        }
      });
      throw new Error('Test failed: Command with pure Linux CWD not in allowedPaths should have been rejected');
    } catch (e: any) {
      expect(e).toBeInstanceOf(McpError);
      expect(e.code).toBe(ErrorCode.InvalidRequest);
      expect(e.message).toContain(`Working directory (${wslPureLinuxPath}) outside allowed paths`);
    }
  });
});
