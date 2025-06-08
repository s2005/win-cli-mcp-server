import path from 'path';
import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { MockCLIServer } from './helpers/MockCLIServer.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import { mockWindowsPaths } from './helpers/pathHelpers.js';
import { buildTestConfig } from './helpers/testUtils.js';
import { testPaths } from './fixtures/testData.js';

mockWindowsPaths();

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => {
      return {
        setRequestHandler: jest.fn(),
        connect: jest.fn()
      };
    })
  };
});

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: jest.fn()
  };
});

let tempDir: string;
let baseConfig: any;

beforeAll(() => {
  tempDir = testPaths.tempDir;
  baseConfig = buildTestConfig({
    security: {
      allowedPaths: [tempDir],
      blockedCommands: ['rm'],
      blockedArguments: ['--exec']
    }
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('validateCommand with different settings', () => {
  test('blocks dangerous operators when injection protection enabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, enableInjectionProtection: true } };
    const server = new MockCLIServer(config);
    expect(() => {
      const cmdConfig = (server as any).config.shells.cmd;
      (server as any).validateCommand(cmdConfig, `cd ${tempDir} && echo hi & echo there`, tempDir);
    }).toThrow("MCP error -32600: Command contains blocked operator: &");
  });

  test('allows command chaining when injection protection disabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, enableInjectionProtection: false } };
    const server = new MockCLIServer(config);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && echo hi`, tempDir);
    }).not.toThrow();
  });

  test('allows changing directory outside allowed paths when restriction disabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, restrictWorkingDirectory: false } };
    const server = new MockCLIServer(config);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
    }).not.toThrow();
  });

  test('rejects changing directory outside allowed paths when restriction enabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, restrictWorkingDirectory: true } };
    const server = new MockCLIServer(config);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
    }).toThrow();
  });
});
