import { describe, it, expect, jest } from '@jest/globals'; // Added jest for console.warn spy
// Import the function to be tested and other necessary functions/types
import { validateWslWorkingDirectory } from '../../src/utils/validation';
// No jest.mock calls are needed here as we are testing the integrated behavior.
describe('validateWslWorkingDirectory (with real resolveWslAllowedPaths)', () => {
    const baseWslConfig = {
        enabled: true,
        command: 'wsl.exe',
        args: [],
        wslMountPoint: '/mnt/',
        inheritGlobalPaths: true, // Default to true for many tests
        // allowedPaths: [], // Default to empty, will be overridden by tests
    };
    it('should not throw for a valid directory when global paths are inherited', () => {
        const globalAllowedPaths = ["C:\\projects"];
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: [], // No WSL-specific paths for this case
            inheritGlobalPaths: true,
            wslMountPoint: '/mnt/'
        };
        expect(() => validateWslWorkingDirectory('/mnt/c/projects/myproject', wslConfig, globalAllowedPaths)).not.toThrow();
    });
    it('should not throw for a valid directory with WSL-specific allowed paths and no global inheritance', () => {
        const globalAllowedPaths = []; // No global paths
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: ["/home/user/work"],
            inheritGlobalPaths: false
        };
        expect(() => validateWslWorkingDirectory('/home/user/work/task1', wslConfig, globalAllowedPaths)).not.toThrow();
    });
    it('should throw an error for an invalid directory against combined allowed paths', () => {
        const globalAllowedPaths = ["C:\\projects"];
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: ["/home/user"],
            inheritGlobalPaths: true,
            wslMountPoint: '/mnt/'
        };
        // Expected resolved paths: /mnt/c/projects, /home/user
        expect(() => validateWslWorkingDirectory('/mnt/d/other', wslConfig, globalAllowedPaths))
            .toThrowError(/WSL working directory '\/mnt\/d\/other' must be within allowed paths: \/home\/user, \/mnt\/c\/projects/i);
        // Note: Order might vary depending on implementation of resolveWslAllowedPaths (Set vs Array), so regex is flexible.
        // For more robust check, verify both paths are in the message if order is not guaranteed.
    });
    it('should throw an error if no allowed paths are configured (effectively empty resolved list)', () => {
        const globalAllowedPaths = [];
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: [],
            inheritGlobalPaths: false
        };
        expect(() => validateWslWorkingDirectory('/mnt/c/somepath', wslConfig, globalAllowedPaths))
            .toThrowError(/No allowed paths configured for WSL shell. Cannot set working directory./i);
    });
    it('should throw an error if the directory is not an absolute POSIX path', () => {
        const globalAllowedPaths = ["C:\\projects"]; // These don't matter as much as the path format itself
        const wslConfig = {
            ...baseWslConfig,
            inheritGlobalPaths: true
        };
        expect(() => validateWslWorkingDirectory('relative/path', wslConfig, globalAllowedPaths))
            .toThrowError(/WSL working directory must be an absolute path/i);
    });
    it('should throw an error if the directory is a Windows-style path (not absolute POSIX)', () => {
        const globalAllowedPaths = ["C:\\projects"];
        const wslConfig = {
            ...baseWslConfig,
            inheritGlobalPaths: true
        };
        expect(() => validateWslWorkingDirectory('C:\\Windows\\Path', wslConfig, globalAllowedPaths))
            .toThrowError(/WSL working directory must be an absolute path/i);
    });
    it('should allow valid path when a global UNC path (which is ignored) is present', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { }); // Suppress warnings for this test
        const globalAllowedPaths = ["\\\\server\\share", "C:\\correct"];
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: [],
            inheritGlobalPaths: true,
            wslMountPoint: '/mnt/'
        };
        // This path should be valid because C:\correct -> /mnt/c/correct
        expect(() => validateWslWorkingDirectory('/mnt/c/correct/subfolder', wslConfig, globalAllowedPaths)).not.toThrow();
        // This path should be invalid, and the error message should only reflect valid resolved paths
        expect(() => validateWslWorkingDirectory('/mnt/c/wrong', wslConfig, globalAllowedPaths))
            .toThrowError(/WSL working directory '\/mnt\/c\/wrong' must be within allowed paths: \/mnt\/c\/correct/i);
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping global path \"\\\\server\\share\" for WSL: UNC paths are not supported"));
        consoleWarnSpy.mockRestore();
    });
    it('should handle custom wslMountPoint correctly in path resolution', () => {
        const globalAllowedPaths = ["D:\\DataWorks"];
        const wslConfig = {
            ...baseWslConfig,
            allowedPaths: ["/user/specific"],
            inheritGlobalPaths: true,
            wslMountPoint: "/wsl/" // Custom mount point
        };
        // Valid paths based on custom mount point and WSL-specific paths
        expect(() => validateWslWorkingDirectory('/wsl/d/DataWorks/project1', wslConfig, globalAllowedPaths)).not.toThrow();
        expect(() => validateWslWorkingDirectory('/user/specific/myfiles', wslConfig, globalAllowedPaths)).not.toThrow();
        // Invalid path
        expect(() => validateWslWorkingDirectory('/mnt/d/DataWorks/project1', wslConfig, globalAllowedPaths))
            .toThrowError(/WSL working directory '\/mnt\/d\/DataWorks\/project1' must be within allowed paths: \/user\/specific, \/wsl\/d\/DataWorks/i);
    });
});
