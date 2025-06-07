import { CLIServer } from '../src/index';
import { ServerConfig } from '../src/types/config';
import { DEFAULT_CONFIG } from '../src/utils/config';
import { McpError, ErrorCode, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path, { dirname } from 'path';
import os from 'os';
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
      command: wslEmulatorPath,
      args: ['-e'],
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
});

describe('WSL Working Directory Validation (Test 5)', () => { // Removed .only
  let serverInstanceForCwdTest: CLIServer;
  let cwdTestConfig: ServerConfig;

  beforeEach(() => {
    cwdTestConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    cwdTestConfig.shells.wsl = {
      enabled: true,
      command: wslEmulatorPath,
      args: ['-e'],
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    cwdTestConfig.shells.cmd.enabled = false;
    cwdTestConfig.shells.powershell.enabled = false;
    cwdTestConfig.shells.gitbash.enabled = false;

    cwdTestConfig.security.restrictWorkingDirectory = true; // Enable CWD restriction
    cwdTestConfig.security.enableInjectionProtection = false; // Not the focus of these tests

    // Using simplified "tad" for "test_allowed_dir"
    // NEW: If /mnt/c/tad becomes C:\tad after normalization:
    cwdTestConfig.security.allowedPaths = ['C:\\tad'];

    serverInstanceForCwdTest = new CLIServer(cwdTestConfig);
  });

  test('Test 5.1: Valid WSL working directory', async () => { // Removed .only
    const wslOriginalPath = '/mnt/c/tad/sub'; // Simplified path
    // Expected path after normalization by normalizeWindowsPath, if /mnt/c/foo -> C:\foo
    const wslNormalizedPathForPwd = 'C:\\tad\\sub';

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

    const firstContent = result.content[0];
    if (firstContent && firstContent.type === 'text') {
      // Since wsl.sh (emulator) runs in process.cwd() (e.g. /app) for WSL tests
      // to avoid ENOENT from invalid CWD for spawn on Linux,
      // pwd will output that CWD, not the conceptual WSL path.
      expect(firstContent.text.trim()).toBe(process.cwd());
    } else {
      throw new Error('Expected first content part to be text for valid CWD test.');
    }
  });

  test('Test 5.2: Invalid WSL working directory (not in allowedPaths)', async () => {
    const wslInvalidPath = '/mnt/d/forbidden_dir'; // d: drive, not in allowed c:\tad
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
      expect(e.message).toContain(`Working directory (${wslInvalidPath}) outside allowed paths`);
    }
  });

  test('Test 5.3: Invalid WSL working directory (valid prefix, not directory containment)', async () => { // Removed .skip
    const wslInvalidPathSuffix = '/mnt/c/tad_plus_suffix'; // c:\tad_plus_suffix, not a subdir of c:\tad
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
      expect(e.message).toContain(`Working directory (${wslInvalidPathSuffix}) outside allowed paths`);
    }
  });
});
