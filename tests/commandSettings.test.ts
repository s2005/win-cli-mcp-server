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
let baseConfig: any;

beforeAll(() => {
  tempDir = '/c/win-cli-test';
  baseConfig = {
    security: {
      ...DEFAULT_CONFIG.security,
      allowedPaths: [tempDir],
      blockedCommands: ['rm'],
      blockedArguments: ['--exec']
    },
    shells: DEFAULT_CONFIG.shells
  };
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('validateCommand with different settings', () => {
  test('blocks dangerous operators when injection protection enabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, enableInjectionProtection: true } };
    const server = new CLIServer(config);
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && echo hi & echo there`, tempDir);
    }).toThrow(/blocked operators/i);
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('allows command chaining when injection protection disabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, enableInjectionProtection: false } };
    const server = new CLIServer(config);
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', `cd ${tempDir} && echo hi`, tempDir);
    }).not.toThrow();
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('allows changing directory outside allowed paths when restriction disabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, restrictWorkingDirectory: false } };
    const server = new CLIServer(config);
    const origAbs = path.isAbsolute;
    const origRes = path.resolve;
    (path as any).isAbsolute = (p: string) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
    (path as any).resolve = (...segments: string[]) => path.win32.resolve(...segments);
    expect(() => {
      (server as any).validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
    }).not.toThrow();
    (path as any).isAbsolute = origAbs;
    (path as any).resolve = origRes;
  });

  test('rejects changing directory outside allowed paths when restriction enabled', () => {
    const config = { ...baseConfig, security: { ...baseConfig.security, restrictWorkingDirectory: true } };
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
});
