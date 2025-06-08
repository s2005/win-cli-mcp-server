import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { ServerConfig } from '../src/types/config.js';
import { CLIServer } from '../src/index'; // Import CLIServer
import { normalizeWindowsPath } from '../src/utils/validation'; // Import normalizeWindowsPath
import { createSerializableConfig } from '../src/utils/configUtils.js';

// Mock process.cwd, process.chdir, and console.error for CWD tests
// Ensure these mocks are set up before CLIServer is instantiated in tests
const mockProcessCwd = jest.spyOn(process, 'cwd');
const mockProcessChdir = jest.spyOn(process, 'chdir').mockImplementation(() => true); // Prevent actual chdir
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console logs for cleaner test output

// Mock the Server class from MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => {
      return {
        setRequestHandler: jest.fn(),
        start: jest.fn()
      };
    })
  };
});

// Mock the StdioServerTransport
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: jest.fn()
  };
});

// Sample base config for CLIServer instantiation in CWD tests
const baseTestConfig: ServerConfig = {
  security: {
    maxCommandLength: 1000,
    blockedCommands: [],
    blockedArguments: [],
    allowedPaths: ['C:\\allowed'], // Default allowed path for tests
    restrictWorkingDirectory: true,
    commandTimeout: 30,
    enableInjectionProtection: true
  },
  shells: {
    cmd: { enabled: true, command: 'cmd.exe', args: ['/c'] }
  }
};


describe('Configuration and CWD Tools', () => {

  describe('get_config tool', () => {
    // Sample test config for get_config specific tests
    const getConfigSpecificTestConfig: ServerConfig = {
      security: {
      maxCommandLength: 1000,
      blockedCommands: ['rm', 'del'],
      blockedArguments: ['--exec'],
      allowedPaths: ['/test/path'],
      restrictWorkingDirectory: true,
      commandTimeout: 30,
      enableInjectionProtection: true
    },
    shells: {
      powershell: {
        enabled: true,
        command: 'powershell.exe',
        args: ['-Command'],
        blockedOperators: ['&', '|']
      },
      cmd: {
        enabled: true,
        command: 'cmd.exe',
        args: ['/c'],
        blockedOperators: ['&', '|']
      },
      gitbash: {
        enabled: false,
        command: 'bash.exe',
        args: ['-c'],
        blockedOperators: ['&', '|']
      }
    }
  };

  test('createSerializableConfig returns structured configuration', () => {
    // Call the utility function directly with our test config for get_config
    const safeConfig = createSerializableConfig(getConfigSpecificTestConfig);
    
    // Verify the structure and content of the safe config
    expect(safeConfig).toBeDefined();
    expect(safeConfig.security).toBeDefined();
    expect(safeConfig.shells).toBeDefined();
    
    // Check security settings
    expect(safeConfig.security.maxCommandLength).toBe(getConfigSpecificTestConfig.security.maxCommandLength);
    expect(safeConfig.security.blockedCommands).toEqual(getConfigSpecificTestConfig.security.blockedCommands);
    expect(safeConfig.security.blockedArguments).toEqual(getConfigSpecificTestConfig.security.blockedArguments);
    expect(safeConfig.security.allowedPaths).toEqual(getConfigSpecificTestConfig.security.allowedPaths);
    expect(safeConfig.security.restrictWorkingDirectory).toBe(getConfigSpecificTestConfig.security.restrictWorkingDirectory);
    expect(safeConfig.security.commandTimeout).toBe(getConfigSpecificTestConfig.security.commandTimeout);
    expect(safeConfig.security.enableInjectionProtection).toBe(getConfigSpecificTestConfig.security.enableInjectionProtection);
    
    // Check shells configuration
    expect(safeConfig.shells.powershell.enabled).toBe(getConfigSpecificTestConfig.shells.powershell.enabled);
    expect(safeConfig.shells.powershell.command).toBe(getConfigSpecificTestConfig.shells.powershell.command);
    expect(safeConfig.shells.powershell.args).toEqual(getConfigSpecificTestConfig.shells.powershell.args);
    expect(safeConfig.shells.powershell.blockedOperators).toEqual(getConfigSpecificTestConfig.shells.powershell.blockedOperators);
    
    expect(safeConfig.shells.cmd.enabled).toBe(getConfigSpecificTestConfig.shells.cmd.enabled);
    expect(safeConfig.shells.gitbash.enabled).toBe(getConfigSpecificTestConfig.shells.gitbash.enabled);
    
    // Verify that function properties are not included in the serializable config
    expect(safeConfig.shells.powershell.validatePath).toBeUndefined();
    expect(safeConfig.shells.cmd.validatePath).toBeUndefined();
    expect(safeConfig.shells.gitbash.validatePath).toBeUndefined();

  });

  test('createSerializableConfig returns consistent config structure', () => {
    // Call the utility function directly with our test config for get_config
    const safeConfig = createSerializableConfig(getConfigSpecificTestConfig);
    
    // Verify the structure matches what we expect both tools to return
    expect(safeConfig).toHaveProperty('security');
    expect(safeConfig).toHaveProperty('shells');
    
    // Verify security properties
    expect(safeConfig.security).toHaveProperty('maxCommandLength');
    expect(safeConfig.security).toHaveProperty('blockedCommands');
    expect(safeConfig.security).toHaveProperty('blockedArguments');
    expect(safeConfig.security).toHaveProperty('allowedPaths');
    expect(safeConfig.security).toHaveProperty('restrictWorkingDirectory');
    expect(safeConfig.security).toHaveProperty('commandTimeout');
    expect(safeConfig.security).toHaveProperty('enableInjectionProtection');
    
    // Verify shells structure
    Object.keys(getConfigSpecificTestConfig.shells).forEach(shellName => {
      expect(safeConfig.shells).toHaveProperty(shellName);
      expect(safeConfig.shells[shellName]).toHaveProperty('enabled');
      expect(safeConfig.shells[shellName]).toHaveProperty('command');
      expect(safeConfig.shells[shellName]).toHaveProperty('args');
      expect(safeConfig.shells[shellName]).toHaveProperty('blockedOperators');
    });

  });
  
  test('get_config tool response format', () => {
    // Call the utility function directly with our test config for get_config
    const safeConfig = createSerializableConfig(getConfigSpecificTestConfig);
    
    // Format it as the tool would
    const formattedResponse = {
      content: [{
        type: "text",
        text: JSON.stringify(safeConfig, null, 2)
      }],
      isError: false,
      metadata: {}
    };
    
    // Verify the response structure matches what we expect
    expect(formattedResponse).toHaveProperty('content');
    expect(formattedResponse).toHaveProperty('isError');
    expect(formattedResponse).toHaveProperty('metadata');
    expect(formattedResponse.isError).toBe(false);
    expect(formattedResponse.content).toBeInstanceOf(Array);
    expect(formattedResponse.content[0]).toHaveProperty('type', 'text');
    expect(formattedResponse.content[0]).toHaveProperty('text');
    
    // Parse the JSON string in the response
    const parsedConfig = JSON.parse(formattedResponse.content[0].text);
    
    // Verify it contains the expected structure
    expect(parsedConfig).toHaveProperty('security');
    expect(parsedConfig).toHaveProperty('shells');
    
    // Verify the content matches what we expect
    expect(parsedConfig).toEqual(safeConfig);
  });
});

  describe('get_current_directory tool', () => {
    beforeEach(() => {
      mockProcessCwd.mockClear();
      mockConsoleError.mockClear(); // Clear console mock for each test if needed
    });

    test('should return serverActiveCwd if set', async () => {
      const launchDir = 'C:\\allowed\\start';
      mockProcessCwd.mockReturnValue(launchDir); // serverActiveCwd will be this
      const server = new CLIServer({ ...baseTestConfig, security: { ...baseTestConfig.security, allowedPaths: ['C:\\allowed'] } });

      const result = await server._executeTool({ name: 'get_current_directory', arguments: {} });
      expect(result.isError).toBe(false);
      expect(result.content?.[0].text).toBe(normalizeWindowsPath(launchDir));
    });

    test('should return "not set" message if serverActiveCwd is undefined', async () => {
      mockProcessCwd.mockReturnValue('C:\\forbidden'); // This will make serverActiveCwd undefined
      const server = new CLIServer({
        ...baseTestConfig,
        security: { ...baseTestConfig.security, restrictWorkingDirectory: true, allowedPaths: ['C:\\allowedOnly'] }
      });
      // @ts-expect-error check private member
      expect(server.serverActiveCwd).toBeUndefined(); // Pre-condition check

      const result = await server._executeTool({ name: 'get_current_directory', arguments: {} });
      expect(result.isError).toBe(false); // Informational, not an error
      expect(result.content?.[0].text).toBe("The server's active working directory is not currently set. Use 'set_current_directory' to set it.");
    });
  });

  describe('set_current_directory tool', () => {
    let server: CLIServer;
    const allowedDir = 'C:\\allowed';
    const normalizedAllowedDir = normalizeWindowsPath(allowedDir);

    beforeEach(() => {
      mockProcessCwd.mockReturnValue('C:\\initial_dir'); // Default for tests where launch dir isn't the focus
      mockProcessChdir.mockClear();
      mockConsoleError.mockClear();
      server = new CLIServer({
        ...baseTestConfig,
        security: { ...baseTestConfig.security, restrictWorkingDirectory: true, allowedPaths: [allowedDir] }
      });
      // Ensure serverActiveCwd is initially something (or undefined if initial_dir is forbidden)
      // For these tests, let's assume initial_dir is allowed to simplify focus on set_current_directory
      mockProcessCwd.mockReturnValue(allowedDir + "\\initial_subdir");
      server = new CLIServer({
        ...baseTestConfig,
        security: { ...baseTestConfig.security, restrictWorkingDirectory: true, allowedPaths: [allowedDir] }
      });
       // @ts-expect-error set for test
      server.serverActiveCwd = normalizeWindowsPath(allowedDir + "\\initial_subdir");

    });

    test('should update serverActiveCwd and call process.chdir for an allowed path', async () => {
      const newPath = 'C:\\allowed\\newpath';
      const normalizedNewPath = normalizeWindowsPath(newPath);
      // @ts-expect-error private member
      const oldCwd = server.serverActiveCwd;

      const result = await server._executeTool({ name: 'set_current_directory', arguments: { path: newPath } });

      expect(result.isError).toBe(false);
      expect(result.content?.[0].text).toBe(`Server's active working directory changed to: ${normalizedNewPath}`);
      // @ts-expect-error private member
      expect(server.serverActiveCwd).toBe(normalizedNewPath);
      expect(mockProcessChdir).toHaveBeenCalledWith(normalizedNewPath);
      expect(result.metadata?.previousActiveDirectory).toBe(oldCwd);
      expect(result.metadata?.newActiveDirectory).toBe(normalizedNewPath);
    });

    test('should fail if path is not in allowedPaths when restrictions are on', async () => {
      const forbiddenPath = 'C:\\forbidden_path';
      const normalizedForbiddenPath = normalizeWindowsPath(forbiddenPath);
      // @ts-expect-error private member
      const originalServerCwd = server.serverActiveCwd;
      mockProcessChdir.mockClear();

      const result = await server._executeTool({ name: 'set_current_directory', arguments: { path: forbiddenPath } });

      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain(`Failed to set current directory: Working directory (${normalizedForbiddenPath}) outside allowed paths`);
      // @ts-expect-error private member
      expect(server.serverActiveCwd).toBe(originalServerCwd); // Should not change
      expect(mockProcessChdir).not.toHaveBeenCalled();
      expect(result.metadata?.requestedDirectory).toBe(forbiddenPath);
      expect(result.metadata?.activeDirectoryBeforeAttempt).toBe(originalServerCwd);
    });

    test('should fail if process.chdir throws an error', async () => {
      const newPath = 'C:\\allowed\\nonexistent_or_error'; // Path is allowed by config
      const normalizedNewPath = normalizeWindowsPath(newPath);
      // @ts-expect-error private member
      const originalServerCwd = server.serverActiveCwd;

      mockProcessChdir.mockImplementationOnce(() => { throw new Error("Simulated chdir error"); });

      const result = await server._executeTool({ name: 'set_current_directory', arguments: { path: newPath } });

      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain('Failed to set current directory: Simulated chdir error');
      // @ts-expect-error private member
      expect(server.serverActiveCwd).toBe(originalServerCwd); // Should not change
      expect(mockProcessChdir).toHaveBeenCalledWith(normalizedNewPath); // Attempted chdir
      expect(result.metadata?.requestedDirectory).toBe(newPath);
      expect(result.metadata?.activeDirectoryBeforeAttempt).toBe(originalServerCwd);
    });

    test('should allow setting directory if restrictWorkingDirectory is false, even if not in allowedPaths', async () => {
      const anyPath = 'C:\\any_path_works';
      const normalizedAnyPath = normalizeWindowsPath(anyPath);
      mockProcessCwd.mockReturnValue('C:\\initial_allowed'); // ensure initial CWD is fine

      server = new CLIServer({
        ...baseTestConfig,
        security: { ...baseTestConfig.security, restrictWorkingDirectory: false, allowedPaths: ['C:\\specific_allowed'] } // restrictions off
      });
       // @ts-expect-error set for test
      server.serverActiveCwd = normalizeWindowsPath('C:\\initial_allowed'); // Set initial active CWD

      mockProcessChdir.mockClear();
      // @ts-expect-error private member
      const oldCwd = server.serverActiveCwd;


      const result = await server._executeTool({ name: 'set_current_directory', arguments: { path: anyPath } });

      expect(result.isError).toBe(false);
      expect(result.content?.[0].text).toBe(`Server's active working directory changed to: ${normalizedAnyPath}`);
      // @ts-expect-error private member
      expect(server.serverActiveCwd).toBe(normalizedAnyPath);
      expect(mockProcessChdir).toHaveBeenCalledWith(normalizedAnyPath);
      expect(result.metadata?.previousActiveDirectory).toBe(oldCwd);
      expect(result.metadata?.newActiveDirectory).toBe(normalizedAnyPath);
    });
  });
});
