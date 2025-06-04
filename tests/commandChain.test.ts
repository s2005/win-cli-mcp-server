import path from 'path';
import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';

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
  config = {
    security: {
      ...DEFAULT_CONFIG.security,
      allowedPaths: [tempDir],
      blockedCommands: ['rm'],
      blockedArguments: ['--exec'],
      enableInjectionProtection: false
    },
    shells: DEFAULT_CONFIG.shells
  };
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('validateCommand chained operations', () => {
  test('allows cd within allowed path', () => {
    const server = new CLIServer(config);
    const subDir = path.join(tempDir, 'sub');
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${subDir} && echo hi`, tempDir);
    }).not.toThrow();
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('rejects cd to disallowed path', () => {
    const server = new CLIServer(config);
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
    }).toThrow();
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('rejects relative cd escaping allowed path', () => {
    const server = new CLIServer(config);
    const sub = path.join(tempDir, 'inner');
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd .. && dir', sub);
    }).toThrow();
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('rejects blocked commands and arguments in chain', () => {
    const server = new CLIServer(config);
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && rm file.txt`, tempDir);
    }).toThrow(/blocked/i);

    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && echo hi --exec`, tempDir);
    }).toThrow(/blocked/i);
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });
});
