import { CLIServer } from '../src/index';
import { normalizeWindowsPath } from '../src/utils/validation';
import type { ServerConfig } from '../src/types/config';

// Mock process.cwd, process.chdir, and console.error
const mockProcessCwd = jest.spyOn(process, 'cwd');
const mockProcessChdir = jest.spyOn(process, 'chdir').mockImplementation(() => true); // Prevent actual chdir
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console logs

describe('CLIServer CWD Initialization and Interaction', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd(); // Store original CWD to restore if needed, though mocks should prevent changes
    mockProcessCwd.mockClear();
    mockProcessChdir.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    // Restore original CWD if mock wasn't effective (should not be necessary with proper mocking)
    // process.chdir(originalCwd);
  });

  describe('Constructor / Startup Logic', () => {
    it('Case 1: restrictWorkingDirectory: true, launchDir NOT in allowedPaths', () => {
      mockProcessCwd.mockReturnValue('C:\\forbidden');
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: ['C:\\allowed1', 'D:\\another'],
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      const server = new CLIServer(config);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBeUndefined();
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: Server started in directory: C:\\forbidden."));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'."));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: The server's active working directory is currently NOT SET."));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining(`INFO: Configured allowed paths are: ${normalizeWindowsPath('C:\\allowed1')}, ${normalizeWindowsPath('D:\\another')}.`));
    });

    it('Case 2: restrictWorkingDirectory: true, launchDir IS in allowedPaths', () => {
      const launchDir = 'C:\\allowed1\\subdir';
      mockProcessCwd.mockReturnValue(launchDir);
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: ['C:\\allowed1', 'D:\\another'],
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      const server = new CLIServer(config);
      const expectedNormalizedPath = normalizeWindowsPath(launchDir);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBe(expectedNormalizedPath);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining(`INFO: Server's active working directory initialized to: ${expectedNormalizedPath}.`));
    });

    it('Case 3: restrictWorkingDirectory: false', () => {
      const launchDir = 'C:\\anywhere';
      mockProcessCwd.mockReturnValue(launchDir);
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: false,
          allowedPaths: ['C:\\allowed1'], // Should be ignored
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      const server = new CLIServer(config);
      const expectedNormalizedPath = normalizeWindowsPath(launchDir);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBe(expectedNormalizedPath);
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining(`INFO: Server's active working directory initialized to: ${expectedNormalizedPath}.`));
    });

    it('Case 4: restrictWorkingDirectory: true, allowedPaths is empty', () => {
      mockProcessCwd.mockReturnValue('C:\\somepath');
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [], // Empty
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      const server = new CLIServer(config);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBeUndefined(); // No path can be allowed
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: Server started in directory: C:\\somepath."));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'."));
      // Note: The message "Configured allowed paths are: ." might appear if allowedPaths is empty. This is acceptable.
    });

    it('Case 5: restrictWorkingDirectory: true, allowedPaths is undefined', () => {
      mockProcessCwd.mockReturnValue('C:\\somepath');
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          // allowedPaths is undefined
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      const server = new CLIServer(config);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBeUndefined(); // No path can be allowed
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: Server started in directory: C:\\somepath."));
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'."));
    });
  });

  describe('Full Interaction Flow Test', () => {
    it('should correctly handle CWD operations throughout server lifecycle', async () => {
      mockProcessCwd.mockReturnValue('C:\\forbidden'); // Initial CWD is not allowed
      const allowedDir = 'C:\\allowed';
      const normalizedAllowedDir = normalizeWindowsPath(allowedDir);
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [allowedDir],
          blockedCommands: [],
          blockedArguments: [],
          enableInjectionProtection: true,
          maxCommandLength: 1000,
          commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'], // Mock actual command execution if needed
          },
        },
      };

      const server = new CLIServer(config);

      // 1. Assert serverActiveCwd is undefined initially
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBeUndefined();

      // 2. Call get_current_directory
      let result = await server._executeTool({ name: 'get_current_directory', arguments: {} });
      expect(result.content?.[0].text).toBe("The server's active working directory is not currently set. Use 'set_current_directory' to set it.");

      // 3. Call execute_command without workingDir - should fail
      result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test' },
      });
      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain("Error: Server's active working directory is not set.");

      // 4. Call set_current_directory with an allowed path
      mockProcessChdir.mockClear(); // Clear before testing chdir call
      result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: allowedDir },
      });
      expect(result.isError).toBe(false);
      expect(result.content?.[0].text).toBe(`Server's active working directory changed to: ${normalizedAllowedDir}`);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBe(normalizedAllowedDir);
      expect(mockProcessChdir).toHaveBeenCalledWith(normalizedAllowedDir);

      // 5. Call get_current_directory again
      result = await server._executeTool({ name: 'get_current_directory', arguments: {} });
      expect(result.content?.[0].text).toBe(normalizedAllowedDir);

      // 6. Call execute_command without workingDir - should succeed now
      // Mocking spawn for this part to avoid actual execution and focus on CWD
      const mockSpawn = jest.fn().mockReturnValue({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => { if (event === 'close') cb(0); }), // Simulate successful close
        kill: jest.fn(),
      });
      const childProcess = await import('child_process');
      const originalSpawn = childProcess.spawn;
      (childProcess as any).spawn = mockSpawn;

      result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test_successful' },
      });
      expect(result.isError).toBe(false);
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'echo test_successful'],
        expect.objectContaining({ cwd: normalizedAllowedDir }) // Crucial check
      );

      // Restore spawn
      (childProcess as any).spawn = originalSpawn;

      // 7. Call set_current_directory with a forbidden path
      const forbiddenDir = 'C:\\other_forbidden';
      const normalizedForbiddenDir = normalizeWindowsPath(forbiddenDir);
      result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: forbiddenDir },
      });
      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain(`Failed to set current directory: Working directory (${normalizedForbiddenDir}) outside allowed paths`);
      // @ts-expect-error accessing private member for test
      expect(server.serverActiveCwd).toBe(normalizedAllowedDir); // Should not have changed

      // 8. Call execute_command with an explicit, allowed workingDir (different from serverActiveCwd)
      const explicitAllowedSubDir = normalizeWindowsPath('C:\\allowed\\explicit_subdir');
      // Ensure the explicit subdir is indeed considered allowed by the main path 'C:\\allowed'
      // Our isPathAllowed and validateWorkingDirectory should handle this if 'C:\\allowed' is a parent.

      mockProcessCwd.mockReturnValue(normalizedAllowedDir); // Ensure process.cwd() for the test is the serverActiveCwd

      const childProcessAgain = await import('child_process');
      const originalSpawnAgain = childProcessAgain.spawn;
      const mockSpawnAgain = jest.fn().mockReturnValue({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, cb) => { if (event === 'close') cb(0); }),
        kill: jest.fn(),
      });
      (childProcessAgain as any).spawn = mockSpawnAgain;

      result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test_explicit', workingDir: explicitAllowedSubDir },
      });
      expect(result.isError).toBe(false);
      expect(mockSpawnAgain).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'echo test_explicit'],
        expect.objectContaining({ cwd: explicitAllowedSubDir }) // Check explicit WD is used
      );
      (childProcessAgain as any).spawn = originalSpawnAgain; // Restore spawn
    });
  });

  describe('execute_command Tool (CWD Handling Focus)', () => {
    const allowedDir = 'C:\\allowed_exec';
    const normalizedAllowedDir = normalizeWindowsPath(allowedDir);
    const anotherAllowedDir = 'C:\\another_allowed_exec';
    const normalizedAnotherAllowedDir = normalizeWindowsPath(anotherAllowedDir);
    const forbiddenInitialDir = 'C:\\forbidden_exec_initial';

    let server: CLIServer;
    let mockSpawn: jest.SpyInstance;
    let originalSpawn: typeof import('child_process').spawn;

    beforeEach(async () => {
      mockProcessCwd.mockClear();
      mockProcessChdir.mockClear();
      mockConsoleError.mockClear();

      const childProcessModule = await import('child_process');
      originalSpawn = childProcessModule.spawn;
      mockSpawn = jest.spyOn(childProcessModule, 'spawn').mockImplementation((): any => {
        const process = new (require('events').EventEmitter)();
        process.stdout = new (require('events').EventEmitter)();
        process.stderr = new (require('events').EventEmitter)();
        setTimeout(() => process.emit('close', 0), 0); // Simulate success
        return process;
      });
    });

    afterEach(() => {
      mockSpawn.mockRestore();
    });

    test('should FAIL if serverActiveCwd is undefined and no workingDir is provided', async () => {
      mockProcessCwd.mockReturnValue(forbiddenInitialDir); // Ensures serverActiveCwd is undefined
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [normalizedAllowedDir], // Only one allowed path
          blockedCommands: [], blockedArguments: [], enableInjectionProtection: true, maxCommandLength: 1000, commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      server = new CLIServer(config);
      // @ts-expect-error
      expect(server.serverActiveCwd).toBeUndefined(); // Verify precondition

      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test' },
      });
      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain("Error: Server's active working directory is not set.");
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    test('should SUCCEED with provided workingDir even if serverActiveCwd is undefined', async () => {
      mockProcessCwd.mockReturnValue(forbiddenInitialDir); // Ensures serverActiveCwd is undefined
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [normalizedAllowedDir],
          blockedCommands: [], blockedArguments: [], enableInjectionProtection: true, maxCommandLength: 1000, commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      server = new CLIServer(config);
      // @ts-expect-error
      expect(server.serverActiveCwd).toBeUndefined(); // Verify precondition

      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test', workingDir: normalizedAllowedDir },
      });
      expect(result.isError).toBe(false);
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'echo test'],
        expect.objectContaining({ cwd: normalizedAllowedDir })
      );
    });

    test('should SUCCEED using serverActiveCwd if it is defined and no workingDir is provided', async () => {
      mockProcessCwd.mockReturnValue(normalizedAllowedDir); // Ensures serverActiveCwd is defined
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [normalizedAllowedDir, normalizedAnotherAllowedDir],
          blockedCommands: [], blockedArguments: [], enableInjectionProtection: true, maxCommandLength: 1000, commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      server = new CLIServer(config);
      // @ts-expect-error
      expect(server.serverActiveCwd).toBe(normalizedAllowedDir); // Verify precondition

      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test' },
      });
      expect(result.isError).toBe(false);
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'echo test'],
        expect.objectContaining({ cwd: normalizedAllowedDir })
      );
    });

    test('should SUCCEED with provided workingDir, overriding serverActiveCwd', async () => {
      mockProcessCwd.mockReturnValue(normalizedAllowedDir); // serverActiveCwd will be normalizedAllowedDir
      const config: ServerConfig = {
        security: {
          restrictWorkingDirectory: true,
          allowedPaths: [normalizedAllowedDir, normalizedAnotherAllowedDir],
          blockedCommands: [], blockedArguments: [], enableInjectionProtection: true, maxCommandLength: 1000, commandTimeout: 10,
        },
        shells: { cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] } },
      };
      server = new CLIServer(config);
      // @ts-expect-error
      expect(server.serverActiveCwd).toBe(normalizedAllowedDir); // Verify precondition

      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test', workingDir: normalizedAnotherAllowedDir },
      });
      expect(result.isError).toBe(false);
      expect(mockSpawn).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'echo test'],
        expect.objectContaining({ cwd: normalizedAnotherAllowedDir }) // Explicit workingDir used
      );
    });
  });
});
