import path from 'path';
import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { MockCLIServer } from './helpers/MockCLIServer.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import { mockWindowsPaths } from './helpers/pathHelpers.js';
import { buildTestConfig } from './helpers/testUtils.js';

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
let config: any;

beforeAll(() => {
  tempDir = '/c/win-cli-test';
  config = buildTestConfig({
    security: {
      allowedPaths: [tempDir],
      blockedCommands: ['rm'],
      blockedArguments: ['--exec'],
      enableInjectionProtection: false
    }
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('validateCommand chained operations', () => {
  test('allows cd within allowed path', () => {
    const server = new MockCLIServer(config);
    const subDir = path.join(tempDir, 'sub');
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${subDir} && echo hi`, tempDir);
    }).not.toThrow();
  });

  test('rejects cd to disallowed path', () => {
    const server = new MockCLIServer(config);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
    }).toThrow();
  });

  test('rejects relative cd escaping allowed path', () => {
    const server = new MockCLIServer(config);
    const sub = path.join(tempDir, 'inner');
    expect(() => {
      (server as any).validateCommand('cmd', 'cd .. && dir', sub);
    }).toThrow();
  });

  test('rejects blocked commands and arguments in chain', () => {
    const server = new MockCLIServer(config);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && rm file.txt`, tempDir);
    }).toThrow(/blocked/i);

    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && echo hi --exec`, tempDir);
    }).toThrow(/blocked/i);
  });
});
