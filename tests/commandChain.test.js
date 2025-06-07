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
let tempDir;
let config;
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
        path.isAbsolute = (p) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
        path.resolve = (...segments) => path.win32.resolve(...segments);
        expect(() => {
            server.validateCommand('cmd', `cd ${subDir} && echo hi`, tempDir);
        }).not.toThrow();
        path.isAbsolute = origAbs;
        path.resolve = origRes;
    });
    test('rejects cd to disallowed path', () => {
        const server = new CLIServer(config);
        const origAbs = path.isAbsolute;
        const origRes = path.resolve;
        path.isAbsolute = (p) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
        path.resolve = (...segments) => path.win32.resolve(...segments);
        expect(() => {
            server.validateCommand('cmd', 'cd C:\\Windows && echo hi', tempDir);
        }).toThrow();
        path.isAbsolute = origAbs;
        path.resolve = origRes;
    });
    test('rejects relative cd escaping allowed path', () => {
        const server = new CLIServer(config);
        const sub = path.join(tempDir, 'inner');
        const origAbs = path.isAbsolute;
        const origRes = path.resolve;
        path.isAbsolute = (p) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
        path.resolve = (...segments) => path.win32.resolve(...segments);
        expect(() => {
            server.validateCommand('cmd', 'cd .. && dir', sub);
        }).toThrow();
        path.isAbsolute = origAbs;
        path.resolve = origRes;
    });
    test('rejects blocked commands and arguments in chain', () => {
        const server = new CLIServer(config);
        const origAbs = path.isAbsolute;
        const origRes = path.resolve;
        path.isAbsolute = (p) => /^([a-zA-Z]:\\|\\\\)/.test(p) || origAbs(p);
        path.resolve = (...segments) => path.win32.resolve(...segments);
        expect(() => {
            server.validateCommand('cmd', `cd ${tempDir} && rm file.txt`, tempDir);
        }).toThrow(/blocked/i);
        expect(() => {
            server.validateCommand('cmd', `cd ${tempDir} && echo hi --exec`, tempDir);
        }).toThrow(/blocked/i);
        path.isAbsolute = origAbs;
        path.resolve = origRes;
    });
});
