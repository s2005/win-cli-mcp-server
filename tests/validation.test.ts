import { describe, expect, test, jest } from '@jest/globals';
import {
  extractCommandName,
  isCommandBlocked,
  isArgumentBlocked,
  parseCommand,
  isPathAllowed,
  validateWorkingDirectory,
  normalizeWindowsPath,
  normalizeAllowedPaths,
  validateShellOperators
} from '../src/utils/validation.js';
import type { ShellConfig } from '../src/types/config.js';

// Mock child_process exec
jest.mock('child_process', () => ({
  exec: jest.fn((cmd: string, callback: (error: Error | null, result: { stdout: string } | null) => void) => {
    if (cmd === 'where "cmd.exe"') {
      callback(null, { stdout: 'C:\\Windows\\System32\\cmd.exe\n' });
    } else if (cmd === 'where "notfound"') {
      callback(new Error('Command not found'), null);
    }
  })
}));

describe('Command Name Extraction', () => {
  test('extractCommandName handles various formats', () => {
    expect(extractCommandName('cmd.exe')).toBe('cmd');
    expect(extractCommandName('C:\\Windows\\System32\\cmd.exe')).toBe('cmd');
    expect(extractCommandName('powershell.exe')).toBe('powershell');
    expect(extractCommandName('git.cmd')).toBe('git');
    expect(extractCommandName('program')).toBe('program');
    expect(extractCommandName('path/to/script.bat')).toBe('script');
  });

  test('extractCommandName is case insensitive', () => {
    expect(extractCommandName('CMD.EXE')).toBe('cmd');
    expect(extractCommandName('PowerShell.Exe')).toBe('powershell');
  });
});

describe('Command Blocking', () => {
  const blockedCommands = ['rm', 'del', 'format'];

  test('isCommandBlocked identifies blocked commands', () => {
    expect(isCommandBlocked('rm', blockedCommands)).toBe(true);
    expect(isCommandBlocked('rm.exe', blockedCommands)).toBe(true);
    expect(isCommandBlocked('C:\\Windows\\System32\\rm.exe', blockedCommands)).toBe(true);
    expect(isCommandBlocked('notepad.exe', blockedCommands)).toBe(false);
  });

  test('isCommandBlocked is case insensitive', () => {
    expect(isCommandBlocked('RM.exe', blockedCommands)).toBe(true);
    expect(isCommandBlocked('DeL.exe', blockedCommands)).toBe(true);
    expect(isCommandBlocked('FORMAT.EXE', blockedCommands)).toBe(true);
  });

  test('isCommandBlocked handles different extensions', () => {
    expect(isCommandBlocked('rm.cmd', blockedCommands)).toBe(true);
    expect(isCommandBlocked('del.bat', blockedCommands)).toBe(true);
    expect(isCommandBlocked('format.com', blockedCommands)).toBe(false); // Should only match .exe, .cmd, .bat
  });
});

describe('Argument Blocking', () => {
  const blockedArgs = ['--system', '-rf', '--exec'];

  test('isArgumentBlocked identifies blocked arguments', () => {
    expect(isArgumentBlocked(['--help', '--system'], blockedArgs)).toBe(true);
    expect(isArgumentBlocked(['-rf'], blockedArgs)).toBe(true);
    expect(isArgumentBlocked(['--safe', '--normal'], blockedArgs)).toBe(false);
  });

  test('isArgumentBlocked is case insensitive for security', () => {
    expect(isArgumentBlocked(['--SYSTEM'], blockedArgs)).toBe(true);
    expect(isArgumentBlocked(['-RF'], blockedArgs)).toBe(true);
    expect(isArgumentBlocked(['--SyStEm'], blockedArgs)).toBe(true);
  });

  test('isArgumentBlocked handles multiple arguments', () => {
    expect(isArgumentBlocked(['--safe', '--exec', '--other'], blockedArgs)).toBe(true);
    expect(isArgumentBlocked(['arg1', 'arg2', '--help'], blockedArgs)).toBe(false);
  });
});

describe('Command Parsing', () => {
  test('parseCommand handles basic commands', () => {
    expect(parseCommand('dir')).toEqual({ command: 'dir', args: [] });
    expect(parseCommand('echo hello')).toEqual({ command: 'echo', args: ['hello'] });
  });

  test('parseCommand handles quoted arguments', () => {
    expect(parseCommand('echo "hello world"')).toEqual({ 
      command: 'echo', 
      args: ['hello world']
    });
    expect(parseCommand('echo "first" "second"')).toEqual({
      command: 'echo',
      args: ['first', 'second']
    });
  });

  test('parseCommand handles paths with spaces', () => {
    expect(parseCommand('C:\\Program Files\\Git\\bin\\git.exe status')).toEqual({
      command: 'C:\\Program Files\\Git\\bin\\git.exe',
      args: ['status']
    });
  });

  test('parseCommand handles empty input', () => {
    expect(parseCommand('')).toEqual({ command: '', args: [] });
    expect(parseCommand('  ')).toEqual({ command: '', args: [] });
  });

  test('parseCommand handles mixed quotes', () => {
    expect(parseCommand('git commit -m "first commit" --author="John Doe"')).toEqual({
      command: 'git',
      args: ['commit', '-m', 'first commit', '--author=John Doe']
    });
  });
});

describe('Path Normalization', () => {
  test('normalizeWindowsPath handles various formats', () => {
    expect(normalizeWindowsPath('C:/Users/test')).toBe('C:\\Users\\test');
    expect(normalizeWindowsPath("\\Users\test")).toBe("C:\\Users\test"); // Now expecting C: drive prepended
    expect(normalizeWindowsPath('D:\\Projects')).toBe('D:\\Projects');
    expect(normalizeWindowsPath('/c/Users/Projects')).toBe('C:\\Users\\Projects'); // Git Bash style
  });

  test('normalizeWindowsPath preserves valid WSL paths', () => {
    expect(normalizeWindowsPath('/mnt/c/foo/bar')).toBe('/mnt/c/foo/bar');
    expect(normalizeWindowsPath('/mnt/d/')).toBe('/mnt/d/');
    expect(normalizeWindowsPath('/mnt/z/some/path/')).toBe('/mnt/z/some/path/');
    expect(normalizeWindowsPath('/home/user/documents')).toBe('/home/user/documents');
    expect(normalizeWindowsPath('/usr/local/bin')).toBe('/usr/local/bin');
    expect(normalizeWindowsPath('/')).toBe('/');
    // Test with trailing slash that should be preserved if it's part of WSL-like path
    expect(normalizeWindowsPath('/mnt/c/directory/')).toBe('/mnt/c/directory/');
    // Test with mixed case drive letter for WSL paths
    expect(normalizeWindowsPath('/mnt/C/mixedCase')).toBe('/mnt/C/mixedCase');
  });

  // Regression checks for Windows paths
  test('normalizeWindowsPath correctly normalizes various Windows paths (Regression)', () => {
    expect(normalizeWindowsPath('C:\\Users\\test')).toBe('C:\\Users\\test'); // Already correct
    expect(normalizeWindowsPath('c:/windows/system32')).toBe('C:\\windows\\system32'); // Mixed slash, lowercase drive
    expect(normalizeWindowsPath('\\\\server\\share\\file')).toBe('\\\\server\\share\\file'); // UNC path
    expect(normalizeWindowsPath('C:\\temp\\\\subfolder')).toBe('C:\\temp\\subfolder'); // Redundant backslashes
    expect(normalizeWindowsPath('C:/temp//subfolder')).toBe('C:\\temp\\subfolder'); // Redundant forward slashes
    expect(normalizeWindowsPath('c:no_slash_path')).toBe('C:\\no_slash_path'); // Drive letter without slash
    expect(normalizeWindowsPath('D:../relative/path')).toBe('D:\\relative\\path'); // Drive relative with ..
    // Path.win32.normalize behavior for .. at root of a drive:
    expect(normalizeWindowsPath('C:..\\another')).toBe('C:\\another'); // Resolves C:.. to C:\
    expect(normalizeWindowsPath('C:\\..\\another')).toBe('C:\\another'); // Resolves C:\.. to C:\
    // Relative paths are made absolute with C:\ by default if no drive letter context
    // This depends on how the original function was structured; current one prepends C:\ if no drive letter.
    // If input is `../relative/path`, it becomes `C:\relative\path` due to `currentPath = C:\\${currentPath}` logic.
    // This specific behavior for relative paths without drive needs to be confirmed against original intent if it was different.
    // Current code structure implies that paths like "foo/bar" become "C:\foo\bar"
    expect(normalizeWindowsPath('foo\\bar')).toBe('C:\\foo\\bar');
    expect(normalizeWindowsPath('../relative/path')).toBe('C:\\relative\\path');
  });

  test('normalizeWindowsPath removes redundant separators', () => {
    expect(normalizeWindowsPath('C:\\\\Users\\\\test')).toBe('C:\\Users\\test');
    expect(normalizeWindowsPath('C:/Users//test')).toBe('C:\\Users\\test');
  });
  test('normalizeWindowsPath resolves relative segments', () => {
    expect(normalizeWindowsPath('C:/folder/../other')).toBe('C:\\other');
    expect(normalizeWindowsPath('C:/folder/../')).toBe('C:\\');
  });
  test('normalizeWindowsPath resolves git bash style relative segments', () => {
    expect(normalizeWindowsPath('/c/folder/../other')).toBe('C:\\other');
    expect(normalizeWindowsPath('/c/folder/../')).toBe('C:\\');
  });
  test('normalizeWindowsPath handles drive-relative paths', () => {
    expect(normalizeWindowsPath('C:folder/sub')).toBe('C:\\folder\\sub');
    expect(normalizeWindowsPath('C:folder/../')).toBe('C:\\');
  });
});

describe('Allowed Paths Normalization', () => {
  test('removes duplicates and normalizes paths', () => {
    const paths = ['C:/Test', 'c:\\test', '/c/Test', 'C:\\test\\'];
    expect(normalizeAllowedPaths(paths)).toEqual(['c:\\test']);
  });
  test('removes nested subpaths', () => {
    const paths = ['/d/mcp', '/d/mcp/my'];
    expect(normalizeAllowedPaths(paths)).toEqual(['d:\\mcp']);
  });
  test('keeps multiple top-level paths', () => {
    const paths = ['/c/Users', '/d/Projects'];
    expect(normalizeAllowedPaths(paths)).toEqual(['c:\\users', 'd:\\projects']);
  });
});

describe('Path Validation', () => {
  // allowed paths in normalized format
  const allowedPaths = [
    'C:\\Users\\test',
    'D:\\Projects',
    'C:\\Users\\Projects\\'
  ];

  test('isPathAllowed validates paths correctly', () => {
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test\\docs'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\code'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('E:\\NotAllowed'), allowedPaths)).toBe(false);
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects'), allowedPaths)).toBe(true);
  });
  
  test('isPathAllowed handles trailing slashes correctly', () => {
    // Test when allowedPath has trailing slash and input doesn't
    // 'C:\Users\Projects\' is in allowedPaths with trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects'), allowedPaths)).toBe(true);
    
    // Test when allowedPath doesn't have trailing slash and input does
    // 'D:\Projects' is in allowedPaths without trailing slash
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/d/Projects/'), allowedPaths)).toBe(true);
    
    // Test when user path has trailing slash and allowed path doesn't
    // 'C:\Users\test' is in allowedPaths without trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test\\'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/test/'), allowedPaths)).toBe(true);
    
    // Test with subdirectories when allowedPath has trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects\\subdir'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects/subdir'), allowedPaths)).toBe(true);
    
    // Test with subdirectories when allowedPath doesn't have trailing slash
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\subdir'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/d/Projects/subdir'), allowedPaths)).toBe(true);
  });

  test('isPathAllowed is case insensitive', () => {
    expect(isPathAllowed(normalizeWindowsPath('c:\\users\\TEST\\docs'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('D:\\PROJECTS\\code'), allowedPaths)).toBe(true);
  });

  test('isPathAllowed supports UNC paths', () => {
    const uncAllowed = normalizeAllowedPaths(['\\\\server\\share']);
    expect(isPathAllowed(normalizeWindowsPath('\\\\server\\share\\folder'), uncAllowed)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('\\\\server\\other'), uncAllowed)).toBe(false);
  });

  test('validateWorkingDirectory throws for invalid paths', () => {
    expect(() => validateWorkingDirectory(normalizeWindowsPath('relative/path'), allowedPaths))
      .toThrow('Working directory must be within allowed paths');
    expect(() => validateWorkingDirectory(normalizeWindowsPath('E:\\NotAllowed'), allowedPaths))
      .toThrow('Working directory must be within allowed paths');
  });
});

describe('Shell Operator Validation', () => {
  const powershellConfig: ShellConfig = {
    enabled: true,
    command: 'powershell.exe',
    args: ['-Command'],
    blockedOperators: ['&', ';', '`']
  };

  test('validateShellOperators blocks dangerous operators', () => {
    expect(() => validateShellOperators('Get-Process & Get-Service', powershellConfig))
      .toThrow();
    expect(() => validateShellOperators('Get-Process; Start-Sleep', powershellConfig))
      .toThrow();
  });

  test('validateShellOperators allows safe operators when configured', () => {
    expect(() => validateShellOperators('Get-Process | Select-Object Name', powershellConfig))
      .not.toThrow();
    expect(() => validateShellOperators('$var = Get-Process', powershellConfig))
      .not.toThrow();
  });

  test('validateShellOperators respects shell config', () => {
    const customConfig: ShellConfig = {
      enabled: true,
      command: 'custom.exe',
      args: [],
      blockedOperators: ['|'] // Block only pipe operator
    };

    expect(() => validateShellOperators('cmd & echo test', customConfig))
      .not.toThrow();
    expect(() => validateShellOperators('cmd | echo test', customConfig))
      .toThrow();
  });
});
