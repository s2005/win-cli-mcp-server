import { CLIServer } from '../src/index';
import { McpError, ErrorCode, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig, ShellConfig } from '../src/types/config';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Helper to create a default minimal config
const createTestConfig = (allowedPaths: string[], restrictWorkingDirectory: boolean): ServerConfig => ({
  security: {
    allowedPaths,
    restrictWorkingDirectory,
    blockedCommands: [],
    blockedArguments: [],
    enableInjectionProtection: true,
    maxCommandLength: 1000,
    commandTimeout: 60, // 60 seconds
  },
  shells: {
    cmd: { enabled: true, command: 'cmd.exe', args: ['/C'], blockedOperators: ['&&', '||', ';', '&', '|', '>', '<'] },
    powershell: { enabled: true, command: 'powershell.exe', args: ['-Command'], blockedOperators: [';', '&', '|'] },
    gitbash: { enabled: false, command: 'bash.exe', args: ['-c'], blockedOperators: [] } as ShellConfig,
    wsl: { enabled: false, command: 'wsl.exe', args: [], wslDistributionName: 'Ubuntu', blockedOperators: [] } as ShellConfig,
  }
});

describe('CLIServer - get_current_directory tool', () => {
  let cwdSpy: jest.SpiedFunction<typeof process.cwd>; 

  beforeEach(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(''); 
  });

  afterEach(() => {
    cwdSpy.mockRestore(); 
  });

  // Test Scenario 1: Restrictions Enabled, Path Allowed
  it('should return the current directory when restrictions are enabled and path is allowed', async () => {
    const allowedPath = 'C:\\allowed\\path';
    cwdSpy.mockReturnValue(allowedPath);

    const config = createTestConfig([allowedPath], true);
    const serverInstance = new CLIServer(config);
    
    const handler = (serverInstance as any).callToolHandler_ForTestsOnly;
    expect(handler).toBeDefined(); 

    const request = {
      type: 'call_tool', 
      id: 'test-1',
      params: {
        name: 'get_current_directory',
        arguments: {},
      },
    } as const;

    const result = await handler(request);

    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: 'text', text: allowedPath }]);
  });

  // Test Scenario 2: Restrictions Enabled, Path Not Allowed
  it('should throw InvalidRequest when restrictions are enabled and path is not allowed', async () => { 
    const notAllowedPath = 'C:\\not\\allowed\\path';
    cwdSpy.mockReturnValue(notAllowedPath);

    const config = createTestConfig(['C:\\some\\other\\path'], true);
    const serverInstance = new CLIServer(config);

    const handler = (serverInstance as any).callToolHandler_ForTestsOnly;
    expect(handler).toBeDefined();

    const request = {
      type: 'call_tool',
      id: 'test-2',
      params: {
        name: 'get_current_directory',
        arguments: {},
      },
    } as const;

    try {
      await handler(request);
      expect(true).toBe(false); 
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      if (error instanceof McpError) { 
        expect(error.code).toBe(ErrorCode.InvalidRequest); 
        expect(error.message).toBe("MCP error -32600: Current directory is not in the list of allowed directories."); // Updated expected message
      }
    }
  });

  // Test Scenario 3: Restrictions Disabled, Path Not Allowed
  it('should return the current directory when restrictions are disabled, even if path is not in allowedPaths', async () => {
    const notAllowedPath = 'C:\\not\\allowed\\path';
    cwdSpy.mockReturnValue(notAllowedPath);

    const config = createTestConfig(['C:\\some\\other\\path'], false); 
    const serverInstance = new CLIServer(config);

    const handler = (serverInstance as any).callToolHandler_ForTestsOnly;
    expect(handler).toBeDefined();

    const request = {
      type: 'call_tool',
      id: 'test-3',
      params: {
        name: 'get_current_directory',
        arguments: {},
      },
    } as const;

    const result = await handler(request);

    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: 'text', text: notAllowedPath }]);
  });

    // Test Scenario 4: Restrictions Disabled, Path Allowed
    it('should return the current directory when restrictions are disabled and path is in allowedPaths', async () => {
      const allowedPath = 'C:\\allowed\\path';
      cwdSpy.mockReturnValue(allowedPath);
  
      const config = createTestConfig([allowedPath], false); 
      const serverInstance = new CLIServer(config);
  
      const handler = (serverInstance as any).callToolHandler_ForTestsOnly;
      expect(handler).toBeDefined();
  
      const request = {
        type: 'call_tool',
        id: 'test-4',
        params: {
          name: 'get_current_directory',
          arguments: {},
        },
      } as const;
  
      const result = await handler(request);
  
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: 'text', text: allowedPath }]);
    });
});
