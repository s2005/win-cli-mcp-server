import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { resolveWslAllowedPaths } from '../../src/utils/validation';
describe('resolveWslAllowedPaths', () => {
    let consoleWarnSpy;
    beforeEach(() => {
        // Mock console.warn
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });
    afterEach(() => {
        // Restore console.warn
        consoleWarnSpy.mockRestore();
    });
    const defaultConfig = {
        wslMountPoint: '/mnt/',
        inheritGlobalPaths: true,
    };
    it('should use global paths when inheritGlobalPaths is true and wslConfig.allowedPaths is empty', () => {
        const globalPaths = ['C:\\Users\\user', 'D:\\Data'];
        const wslConfig = { ...defaultConfig, command: 'wsl.exe', args: [], enabled: true, allowedPaths: [] };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/mnt/c/Users/user', '/mnt/d/Data']);
    });
    it('should use only wslConfig.allowedPaths when provided and inheritGlobalPaths is false', () => {
        const globalPaths = ['C:\\Users\\user'];
        const wslConfig = {
            ...defaultConfig,
            command: 'wsl.exe', args: [], enabled: true,
            allowedPaths: ['/custom/path1', '/mnt/d/project'],
            inheritGlobalPaths: false,
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/custom/path1', '/mnt/d/project']);
    });
    it('should merge global and wslConfig.allowedPaths when inheritGlobalPaths is true', () => {
        const globalPaths = ['C:\\Users\\user'];
        const wslConfig = {
            ...defaultConfig,
            command: 'wsl.exe', args: [], enabled: true,
            allowedPaths: ['/custom/path1'],
            inheritGlobalPaths: true,
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/custom/path1', '/mnt/c/Users/user']);
    });
    it('should ensure uniqueness of paths after conversion and merging', () => {
        const globalPaths = ['C:\\Users\\user', 'D:\\Data'];
        const wslConfig = {
            ...defaultConfig,
            command: 'wsl.exe', args: [], enabled: true,
            allowedPaths: ['/mnt/c/Users/user', '/new/path'], // Duplicate after global conversion
            inheritGlobalPaths: true,
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/mnt/c/Users/user', '/new/path', '/mnt/d/Data']);
        expect(resolved.length).toBe(3);
    });
    it('should skip global paths that fail conversion and log a warning', () => {
        const globalPaths = ['C:\\Users\\user', '\\\\Server\\Share\\Path', 'D:\\Data'];
        const wslConfig = { ...defaultConfig, command: 'wsl.exe', args: [], enabled: true, allowedPaths: [] };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/mnt/c/Users/user', '/mnt/d/Data']);
        expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        expect(consoleWarnSpy).toHaveBeenCalledWith('Skipping global path "\\\\Server\\Share\\Path" for WSL: UNC paths are not supported for WSL conversion.');
    });
    it('should handle empty global paths and empty wslConfig.allowedPaths', () => {
        const globalPaths = [];
        const wslConfig = { ...defaultConfig, command: 'wsl.exe', args: [], enabled: true, allowedPaths: [] };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual([]);
    });
    it('should handle undefined wslConfig.allowedPaths', () => {
        const globalPaths = ['C:\\Users\\user'];
        const wslConfig = { ...defaultConfig, command: 'wsl.exe', args: [], enabled: true, allowedPaths: undefined };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/mnt/c/Users/user']);
    });
    it('should use custom wslMountPoint from wslConfig', () => {
        const globalPaths = ['C:\\Data'];
        const wslConfig = {
            ...defaultConfig,
            command: 'wsl.exe', args: [], enabled: true,
            wslMountPoint: '/custom/mount/',
            allowedPaths: [],
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/custom/mount/c/Data']);
    });
    it('should default wslMountPoint to /mnt/ if not in wslConfig', () => {
        const globalPaths = ['C:\\Data'];
        // Create a shell config that is missing wslMountPoint
        const wslConfigNoMount = {
            enabled: true,
            command: 'wsl',
            args: [],
            inheritGlobalPaths: true,
            allowedPaths: []
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfigNoMount); // Cast for test
        expect(resolved).toEqual(['/mnt/c/Data']);
    });
    it('should handle inheritGlobalPaths being undefined (should default to true)', () => {
        const globalPaths = ['C:\\Users\\user'];
        const wslConfigUndefinedInherit = {
            enabled: true,
            command: 'wsl',
            args: [],
            wslMountPoint: '/mnt/',
            allowedPaths: ['/specific/wsl']
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfigUndefinedInherit);
        expect(resolved).toContain('/mnt/c/Users/user');
        expect(resolved).toContain('/specific/wsl');
    });
    it('should not add converted global paths if they are already listed in wslConfig.allowedPaths', () => {
        const globalPaths = ['C:\\Users\\user'];
        const wslConfig = {
            ...defaultConfig,
            command: 'wsl.exe', args: [], enabled: true,
            allowedPaths: ['/mnt/c/Users/user'], // This is what C:\Users\user converts to
            inheritGlobalPaths: true,
        };
        const resolved = resolveWslAllowedPaths(globalPaths, wslConfig);
        expect(resolved).toEqual(['/mnt/c/Users/user']);
        expect(resolved.length).toBe(1);
    });
});
