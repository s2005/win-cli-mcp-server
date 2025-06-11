# Task: Update Shell-Specific Validation and Path Handling

## Overview and Problem Statement

With the new inheritance-based configuration, each shell can have its own path formats, security settings, and restrictions. The current validation logic assumes global settings apply to all shells. We need to update the validation system to use resolved shell-specific configurations and handle different path formats (Windows vs Unix) appropriately for each shell.

### Current Issues

- Validation uses global settings instead of shell-specific resolved settings
- Path validation doesn't account for different path formats per shell
- WSL path conversion happens in validation instead of configuration resolution
- No clear separation between Windows and Unix path validation

## Technical Implementation Details

### 1. Update Validation Context Structure

Create `src/utils/validationContext.ts`:

```typescript
import type { ResolvedShellConfig } from '../types/config.js';

/**
 * Validation context that includes resolved shell configuration
 */
export interface ValidationContext {
  shellName: string;
  shellConfig: ResolvedShellConfig;
  isWindowsShell: boolean;
  isUnixShell: boolean;
  isWslShell: boolean;
}

/**
 * Create validation context from resolved shell config
 */
export function createValidationContext(
  shellName: string,
  shellConfig: ResolvedShellConfig
): ValidationContext {
  const isWindowsShell = ['cmd', 'powershell'].includes(shellName);
  const isUnixShell = ['gitbash', 'wsl'].includes(shellName);
  const isWslShell = shellName === 'wsl';
  
  return {
    shellName,
    shellConfig,
    isWindowsShell,
    isUnixShell,
    isWslShell
  };
}

/**
 * Determine expected path format for shell
 */
export function getExpectedPathFormat(context: ValidationContext): 'windows' | 'unix' | 'mixed' {
  if (context.isWindowsShell) return 'windows';
  if (context.isWslShell) return 'unix';
  if (context.shellName === 'gitbash') return 'mixed'; // Git Bash accepts both
  return 'unix';
}
```

### 2. Update Command Validation

Update `src/utils/validation.ts` (key functions):

```typescript
import type { ValidationContext } from './validationContext.js';

/**
 * Validate shell operators using shell-specific configuration
 */
export function validateShellOperators(command: string, context: ValidationContext): void {
  const blockedOperators = context.shellConfig.restrictions.blockedOperators;
  
  if (!blockedOperators || blockedOperators.length === 0) {
    return;
  }

  for (const op of blockedOperators) {
    const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedOp);
    if (regex.test(command)) {
      throw new McpError(
        ErrorCode.InvalidRequest, 
        `Command contains blocked operator for ${context.shellName}: ${op}`
      );
    }
  }
}

/**
 * Check if command is blocked using shell-specific list
 */
export function isCommandBlocked(command: string, context: ValidationContext): boolean {
  const commandName = extractCommandName(command.toLowerCase());
  const blockedCommands = context.shellConfig.restrictions.blockedCommands;
  
  return blockedCommands.some(blocked => {
    // Handle complex commands like "rm -rf /"
    if (blocked.includes(' ')) {
      return command.toLowerCase().startsWith(blocked.toLowerCase());
    }
    
    // Standard command blocking
    return commandName === blocked.toLowerCase() ||
           commandName === `${blocked.toLowerCase()}.exe` ||
           commandName === `${blocked.toLowerCase()}.cmd` ||
           commandName === `${blocked.toLowerCase()}.bat`;
  });
}

/**
 * Check if arguments are blocked using shell-specific list
 */
export function isArgumentBlocked(args: string[], context: ValidationContext): boolean {
  const blockedArguments = context.shellConfig.restrictions.blockedArguments;
  
  return args.some(arg => 
    blockedArguments.some(blocked => 
      new RegExp(`^${blocked}$`, 'i').test(arg)
    )
  );
}

/**
 * Validate command length using shell-specific limit
 */
export function validateCommandLength(command: string, context: ValidationContext): void {
  const maxLength = context.shellConfig.security.maxCommandLength;
  
  if (command.length > maxLength) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Command exceeds maximum length of ${maxLength} for ${context.shellName}`
    );
  }
}
```

### 3. Update Path Validation

Create `src/utils/pathValidation.ts`:

```typescript
import path from 'path';
import type { ValidationContext } from './validationContext.js';
import { normalizeWindowsPath, isPathAllowed } from './validation.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Normalize path based on shell type
 */
export function normalizePathForShell(inputPath: string, context: ValidationContext): string {
  const pathFormat = getExpectedPathFormat(context);
  
  switch (pathFormat) {
    case 'windows':
      return normalizeWindowsPath(inputPath);
      
    case 'unix':
      // For pure Unix shells, ensure forward slashes
      return inputPath.replace(/\\/g, '/');
      
    case 'mixed':
      // Git Bash: Try to determine format and normalize accordingly
      if (inputPath.match(/^[A-Z]:\\/i) || inputPath.includes('\\')) {
        return normalizeWindowsPath(inputPath);
      }
      return inputPath.replace(/\\/g, '/');
      
    default:
      return inputPath;
  }
}

/**
 * Validate working directory for specific shell
 */
export function validateWorkingDirectory(
  dir: string,
  context: ValidationContext
): void {
  // Check if restrictions are enabled
  if (!context.shellConfig.security.restrictWorkingDirectory) {
    return;
  }
  
  const allowedPaths = context.shellConfig.paths.allowedPaths;
  if (allowedPaths.length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No allowed paths configured for ${context.shellName}`
    );
  }
  
  // Normalize the directory path for validation
  const normalizedDir = normalizePathForShell(dir, context);
  
  // Validate based on path format
  if (context.isWslShell) {
    validateWslPath(normalizedDir, allowedPaths, context);
  } else if (context.isWindowsShell) {
    validateWindowsPath(normalizedDir, allowedPaths, context);
  } else {
    // Git Bash or other mixed format shells
    validateMixedPath(normalizedDir, allowedPaths, context);
  }
}

/**
 * Validate WSL-specific paths
 */
function validateWslPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  // WSL paths must be absolute
  if (!dir.startsWith('/')) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'WSL working directory must be an absolute path (starting with /)'
    );
  }
  
  // Check against allowed paths
  const isAllowed = allowedPaths.some(allowed => {
    // Direct match or subdirectory
    return dir === allowed || 
           dir.startsWith(allowed.endsWith('/') ? allowed : allowed + '/');
  });
  
  if (!isAllowed) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `WSL working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Validate Windows-specific paths
 */
function validateWindowsPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  // Windows paths should be normalized already
  if (!path.win32.isAbsolute(dir)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Working directory must be an absolute path'
    );
  }
  
  if (!isPathAllowed(dir, allowedPaths)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Validate mixed format paths (Git Bash)
 */
function validateMixedPath(
  dir: string,
  allowedPaths: string[],
  context: ValidationContext
): void {
  // Git Bash can use both Windows and Unix paths
  const isWindowsFormat = /^[A-Z]:\\/i.test(dir) || dir.includes('\\');
  const isUnixFormat = dir.startsWith('/');
  
  if (!isWindowsFormat && !isUnixFormat) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Working directory must be an absolute path'
    );
  }
  
  // Check against allowed paths (which might be in either format)
  const isAllowed = allowedPaths.some(allowed => {
    if (isWindowsFormat && (allowed.includes('\\') || /^[A-Z]:/i.test(allowed))) {
      // Both are Windows format
      return isPathAllowed(dir, [allowed]);
    } else if (isUnixFormat && allowed.startsWith('/')) {
      // Both are Unix format
      return dir === allowed || 
             dir.startsWith(allowed.endsWith('/') ? allowed : allowed + '/');
    } else if (isWindowsFormat && allowed.startsWith('/')) {
      // Convert Git Bash Unix path to Windows for comparison
      const convertedAllowed = convertGitBashToWindows(allowed);
      return isPathAllowed(dir, [convertedAllowed]);
    } else if (isUnixFormat && (allowed.includes('\\') || /^[A-Z]:/i.test(allowed))) {
      // Convert Windows to Git Bash Unix path for comparison
      const convertedAllowed = convertWindowsToGitBash(allowed);
      return dir === convertedAllowed || 
             dir.startsWith(convertedAllowed.endsWith('/') ? convertedAllowed : convertedAllowed + '/');
    }
    return false;
  });
  
  if (!isAllowed) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Working directory must be within allowed paths: ${allowedPaths.join(', ')}`
    );
  }
}

/**
 * Convert Git Bash Unix-style path to Windows
 */
function convertGitBashToWindows(gitBashPath: string): string {
  // /c/Users/test -> C:\Users\test
  const match = gitBashPath.match(/^\/([a-z])\/(.*)$/i);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return gitBashPath;
}

/**
 * Convert Windows path to Git Bash Unix-style
 */
function convertWindowsToGitBash(windowsPath: string): string {
  // C:\Users\test -> /c/Users/test
  const match = windowsPath.match(/^([A-Z]):\\(.*)$/i);
  if (match) {
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/${drive}/${rest}`;
  }
  return windowsPath;
}
```

### 4. Update Main Validation Flow

Update `src/index.ts` validation sections:

```typescript
import { createValidationContext } from './utils/validationContext.js';
import { validateWorkingDirectory as validateWorkingDirectoryWithContext } from './utils/pathValidation.js';
import { getResolvedShellConfig } from './utils/config.js';

// In the execute_command handler:
const resolvedShellConfig = getResolvedShellConfig(this.config, shellKey);
if (!resolvedShellConfig) {
  throw new McpError(
    ErrorCode.InvalidRequest,
    `Shell '${shellKey}' is not configured or enabled`
  );
}

// Create validation context
const validationContext = createValidationContext(shellKey, resolvedShellConfig);

// Validate working directory with context
if (args.workingDir) {
  validateWorkingDirectoryWithContext(args.workingDir, validationContext);
} else {
  if (!this.serverActiveCwd) {
    return {
      content: [{
        type: "text",
        text: "Error: Server's active working directory is not set."
      }],
      isError: true,
      metadata: {}
    };
  }
  workingDir = this.serverActiveCwd;
}

// Validate command with context
this.validateCommand(validationContext, args.command, workingDir);

// In validateCommand method:
private validateCommand(
  context: ValidationContext,
  command: string,
  workingDir: string
): void {
  const steps = command.split(/\s*&&\s*/);
  let currentDir = workingDir;

  for (const step of steps) {
    const trimmed = step.trim();
    if (!trimmed) continue;

    this.validateSingleCommand(context, trimmed);

    // Handle directory changes
    const { command: executable, args } = parseCommand(trimmed);
    if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
      const target = normalizePathForShell(args[0], context);
      // ... rest of cd handling with context
    }
  }
}

private validateSingleCommand(context: ValidationContext, command: string): void {
  if (context.shellConfig.security.enableInjectionProtection) {
    validateShellOperators(command, context);
  }

  const { command: executable, args } = parseCommand(command);

  if (isCommandBlocked(executable, context)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Command is blocked: "${extractCommandName(executable)}"`
    );
  }

  if (isArgumentBlocked(args, context)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'One or more arguments are blocked. Check configuration for blocked patterns.'
    );
  }

  validateCommandLength(command, context);
}
```

## Working Examples

### Example 1: Windows Shell Path Validation

```typescript
// Configuration
const cmdConfig: ResolvedShellConfig = {
  enabled: true,
  executable: { command: 'cmd.exe', args: ['/c'] },
  security: { restrictWorkingDirectory: true, /* ... */ },
  paths: { allowedPaths: ['C:\\Users\\Test', 'D:\\Projects'] },
  // ... other fields
};

const context = createValidationContext('cmd', cmdConfig);

// Valid paths
validateWorkingDirectory('C:\\Users\\Test\\Documents', context); // OK
validateWorkingDirectory('D:\\Projects\\App', context); // OK

// Invalid paths
validateWorkingDirectory('/c/Users/Test', context); // Error: Wrong format
validateWorkingDirectory('E:\\Other', context); // Error: Not allowed
```

### Example 2: WSL Path Validation

```typescript
// Configuration  
const wslConfig: ResolvedShellConfig = {
  enabled: true,
  executable: { command: 'wsl.exe', args: ['-e'] },
  security: { restrictWorkingDirectory: true, /* ... */ },
  paths: { allowedPaths: ['/home/user', '/tmp', '/mnt/c/Projects'] },
  wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true },
  // ... other fields
};

const context = createValidationContext('wsl', wslConfig);

// Valid paths
validateWorkingDirectory('/home/user/work', context); // OK
validateWorkingDirectory('/tmp/build', context); // OK
validateWorkingDirectory('/mnt/c/Projects/app', context); // OK

// Invalid paths
validateWorkingDirectory('C:\\Projects', context); // Error: Windows format
validateWorkingDirectory('/usr/local', context); // Error: Not allowed
```

### Example 3: Git Bash Mixed Path Validation

```typescript
// Configuration
const gitBashConfig: ResolvedShellConfig = {
  enabled: true,
  executable: { command: 'bash.exe', args: ['-c'] },
  security: { restrictWorkingDirectory: true, /* ... */ },
  paths: { allowedPaths: ['C:\\Projects', '/c/Projects', '/home/user'] },
  // ... other fields
};

const context = createValidationContext('gitbash', gitBashConfig);

// Valid paths (both formats accepted)
validateWorkingDirectory('C:\\Projects\\app', context); // OK
validateWorkingDirectory('/c/Projects/app', context); // OK
validateWorkingDirectory('/home/user/work', context); // OK

// Automatic format detection and validation
validateWorkingDirectory('C:\\Projects\\test', context); // Detected as Windows
validateWorkingDirectory('/c/Projects/test', context); // Detected as Unix
```

## Unit Test Requirements

### 1. Create `tests/utils/validationContext.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { createValidationContext, getExpectedPathFormat } from '../../src/utils/validationContext';
import type { ResolvedShellConfig } from '../../src/types/config';

describe('Validation Context', () => {
  const mockResolvedConfig: ResolvedShellConfig = {
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['test'],
      blockedArguments: ['--test'],
      blockedOperators: ['&']
    },
    paths: {
      allowedPaths: ['/test'],
      initialDir: '/test'
    }
  };

  describe('createValidationContext', () => {
    test('identifies Windows shells correctly', () => {
      const cmdContext = createValidationContext('cmd', mockResolvedConfig);
      expect(cmdContext.isWindowsShell).toBe(true);
      expect(cmdContext.isUnixShell).toBe(false);
      expect(cmdContext.isWslShell).toBe(false);

      const psContext = createValidationContext('powershell', mockResolvedConfig);
      expect(psContext.isWindowsShell).toBe(true);
    });

    test('identifies Unix shells correctly', () => {
      const gitbashContext = createValidationContext('gitbash', mockResolvedConfig);
      expect(gitbashContext.isWindowsShell).toBe(false);
      expect(gitbashContext.isUnixShell).toBe(true);
      expect(gitbashContext.isWslShell).toBe(false);

      const wslContext = createValidationContext('wsl', mockResolvedConfig);
      expect(wslContext.isUnixShell).toBe(true);
      expect(wslContext.isWslShell).toBe(true);
    });

    test('includes shell configuration', () => {
      const context = createValidationContext('cmd', mockResolvedConfig);
      expect(context.shellConfig).toBe(mockResolvedConfig);
      expect(context.shellName).toBe('cmd');
    });
  });

  describe('getExpectedPathFormat', () => {
    test('returns correct format for each shell type', () => {
      expect(getExpectedPathFormat(createValidationContext('cmd', mockResolvedConfig))).toBe('windows');
      expect(getExpectedPathFormat(createValidationContext('powershell', mockResolvedConfig))).toBe('windows');
      expect(getExpectedPathFormat(createValidationContext('wsl', mockResolvedConfig))).toBe('unix');
      expect(getExpectedPathFormat(createValidationContext('gitbash', mockResolvedConfig))).toBe('mixed');
    });
  });
});
```

### 2. Create `tests/utils/pathValidation.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { 
  normalizePathForShell, 
  validateWorkingDirectory 
} from '../../src/utils/pathValidation';
import { createValidationContext } from '../../src/utils/validationContext';
import type { ResolvedShellConfig } from '../../src/types/config';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

describe('Path Validation', () => {
  const createMockConfig = (allowedPaths: string[]): ResolvedShellConfig => ({
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: [],
      blockedArguments: [],
      blockedOperators: []
    },
    paths: {
      allowedPaths,
      initialDir: undefined
    }
  });

  describe('normalizePathForShell', () => {
    test('normalizes paths for Windows shells', () => {
      const config = createMockConfig(['C:\\test']);
      const context = createValidationContext('cmd', config);
      
      expect(normalizePathForShell('C:/test/file', context)).toBe('C:\\test\\file');
      expect(normalizePathForShell('/c/test', context)).toBe('C:\\test');
      expect(normalizePathForShell('test\\dir', context)).toBe('C:\\test\\dir');
    });

    test('normalizes paths for Unix shells', () => {
      const config = createMockConfig(['/test']);
      const context = createValidationContext('wsl', config);
      
      expect(normalizePathForShell('/home/user', context)).toBe('/home/user');
      expect(normalizePathForShell('/home\\user', context)).toBe('/home/user');
      expect(normalizePathForShell('C:\\test', context)).toBe('C:/test');
    });

    test('handles mixed format for Git Bash', () => {
      const config = createMockConfig(['/c/test', 'C:\\test']);
      const context = createValidationContext('gitbash', config);
      
      // Windows format detected and normalized
      expect(normalizePathForShell('C:\\test\\file', context)).toBe('C:\\test\\file');
      // Unix format preserved
      expect(normalizePathForShell('/c/test/file', context)).toBe('/c/test/file');
    });
  });

  describe('validateWorkingDirectory', () => {
    test('validates Windows paths for Windows shells', () => {
      const config = createMockConfig(['C:\\Users', 'D:\\Projects']);
      const context = createValidationContext('cmd', config);
      
      // Valid paths
      expect(() => validateWorkingDirectory('C:\\Users\\Test', context)).not.toThrow();
      expect(() => validateWorkingDirectory('D:\\Projects\\App', context)).not.toThrow();
      
      // Invalid paths
      expect(() => validateWorkingDirectory('E:\\Other', context)).toThrow(McpError);
      expect(() => validateWorkingDirectory('/c/Users', context)).toThrow(McpError);
    });

    test('validates Unix paths for WSL', () => {
      const config = createMockConfig(['/home/user', '/tmp']);
      const context = createValidationContext('wsl', config);
      
      // Valid paths
      expect(() => validateWorkingDirectory('/home/user/work', context)).not.toThrow();
      expect(() => validateWorkingDirectory('/tmp/build', context)).not.toThrow();
      
      // Invalid paths
      expect(() => validateWorkingDirectory('/usr/local', context)).toThrow(McpError);
      expect(() => validateWorkingDirectory('relative/path', context)).toThrow(/must be an absolute path/);
    });

    test('validates both formats for Git Bash', () => {
      const config = createMockConfig(['C:\\Projects', '/c/Projects']);
      const context = createValidationContext('gitbash', config);
      
      // Both formats should work
      expect(() => validateWorkingDirectory('C:\\Projects\\app', context)).not.toThrow();
      expect(() => validateWorkingDirectory('/c/Projects/app', context)).not.toThrow();
      
      // Invalid paths
      expect(() => validateWorkingDirectory('D:\\Other', context)).toThrow(McpError);
      expect(() => validateWorkingDirectory('/d/Other', context)).toThrow(McpError);
    });

    test('skips validation when restrictions disabled', () => {
      const config = createMockConfig([]);
      config.security.restrictWorkingDirectory = false;
      const context = createValidationContext('cmd', config);
      
      // Should not throw even for paths outside allowed list
      expect(() => validateWorkingDirectory('E:\\Any\\Path', context)).not.toThrow();
    });

    test('handles empty allowed paths', () => {
      const config = createMockConfig([]);
      const context = createValidationContext('cmd', config);
      
      expect(() => validateWorkingDirectory('C:\\Any', context))
        .toThrow(/No allowed paths configured/);
    });
  });
});
```

### 3. Update Shell-Specific Validation Tests

Create `tests/validation/shellSpecific.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';
import { 
  validateShellOperators, 
  isCommandBlocked, 
  isArgumentBlocked,
  validateCommandLength 
} from '../../src/utils/validation';
import { createValidationContext } from '../../src/utils/validationContext';
import type { ResolvedShellConfig } from '../../src/types/config';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

describe('Shell-Specific Validation', () => {
  const createConfigWithRestrictions = (
    blockedCommands: string[],
    blockedArguments: string[],
    blockedOperators: string[],
    maxCommandLength: number = 2000
  ): ResolvedShellConfig => ({
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands,
      blockedArguments,
      blockedOperators
    },
    paths: { allowedPaths: [] }
  });

  describe('validateShellOperators', () => {
    test('blocks shell-specific operators', () => {
      const cmdConfig = createConfigWithRestrictions([], [], ['&', '|']);
      const cmdContext = createValidationContext('cmd', cmdConfig);
      
      const bashConfig = createConfigWithRestrictions([], [], ['&', '|', ';', '`', '$(']);
      const bashContext = createValidationContext('gitbash', bashConfig);
      
      // CMD blocks & and |
      expect(() => validateShellOperators('echo test & dir', cmdContext))
        .toThrow(/blocked operator.*cmd.*&/);
      expect(() => validateShellOperators('echo test ; ls', cmdContext))
        .not.toThrow(); // ; not blocked in CMD
      
      // Bash blocks additional operators
      expect(() => validateShellOperators('echo test ; ls', bashContext))
        .toThrow(/blocked operator.*gitbash.*;/);
      expect(() => validateShellOperators('echo $(whoami)', bashContext))
        .toThrow(/blocked operator.*gitbash.*\$\(/);
    });

    test('allows commands when operators not blocked', () => {
      const config = createConfigWithRestrictions([], [], []);
      const context = createValidationContext('cmd', config);
      
      expect(() => validateShellOperators('echo test & dir', context)).not.toThrow();
    });
  });

  describe('isCommandBlocked', () => {
    test('blocks shell-specific commands', () => {
      const cmdConfig = createConfigWithRestrictions(['del', 'rd', 'format'], [], []);
      const cmdContext = createValidationContext('cmd', cmdConfig);
      
      const bashConfig = createConfigWithRestrictions(['rm', 'chmod', 'chown'], [], []);
      const bashContext = createValidationContext('gitbash', bashConfig);
      
      // CMD-specific blocks
      expect(isCommandBlocked('del', cmdContext)).toBe(true);
      expect(isCommandBlocked('DEL.EXE', cmdContext)).toBe(true);
      expect(isCommandBlocked('rm', cmdContext)).toBe(false);
      
      // Bash-specific blocks
      expect(isCommandBlocked('rm', bashContext)).toBe(true);
      expect(isCommandBlocked('chmod', bashContext)).toBe(true);
      expect(isCommandBlocked('del', bashContext)).toBe(false);
    });

    test('blocks complex commands with arguments', () => {
      const config = createConfigWithRestrictions(['rm -rf /', 'dd if=/dev/zero'], [], []);
      const context = createValidationContext('wsl', config);
      
      expect(isCommandBlocked('rm -rf /', context)).toBe(true);
      expect(isCommandBlocked('dd if=/dev/zero of=/dev/sda', context)).toBe(true);
      expect(isCommandBlocked('rm -rf /tmp', context)).toBe(false); // Different command
    });
  });

  describe('isArgumentBlocked', () => {
    test('blocks shell-specific arguments', () => {
      const cmdConfig = createConfigWithRestrictions([], ['/f', '/s', '/q'], []);
      const cmdContext = createValidationContext('cmd', cmdConfig);
      
      const bashConfig = createConfigWithRestrictions([], ['--no-preserve-root', '--force'], []);
      const bashContext = createValidationContext('wsl', bashConfig);
      
      // CMD-specific blocks
      expect(isArgumentBlocked(['/f'], cmdContext)).toBe(true);
      expect(isArgumentBlocked(['--force'], cmdContext)).toBe(false);
      
      // Bash-specific blocks
      expect(isArgumentBlocked(['--no-preserve-root'], bashContext)).toBe(true);
      expect(isArgumentBlocked(['/f'], bashContext)).toBe(false);
    });
  });

  describe('validateCommandLength', () => {
    test('validates against shell-specific limits', () => {
      const shortLimitConfig = createConfigWithRestrictions([], [], [], 50);
      const shortContext = createValidationContext('cmd', shortLimitConfig);
      
      const longLimitConfig = createConfigWithRestrictions([], [], [], 5000);
      const longContext = createValidationContext('wsl', longLimitConfig);
      
      const shortCommand = 'echo test';
      const longCommand = 'x'.repeat(100);
      
      // Short limit
      expect(() => validateCommandLength(shortCommand, shortContext)).not.toThrow();
      expect(() => validateCommandLength(longCommand, shortContext))
        .toThrow(/exceeds maximum length of 50.*cmd/);
      
      // Long limit
      expect(() => validateCommandLength(longCommand, longContext)).not.toThrow();
    });
  });
});
```

## Documentation Updates

### 1. Create Validation Architecture Document

Create `docs/VALIDATION_ARCHITECTURE.md`:

```markdown
# Validation Architecture

## Overview

The validation system uses shell-specific configurations to validate commands, arguments, and paths based on the target shell's requirements and format expectations.

## Key Components

### Validation Context

The `ValidationContext` encapsulates:
- Shell name and type (Windows/Unix/WSL)
- Resolved shell configuration (after merging)
- Helper flags for shell categorization

### Path Validation

Path validation is shell-aware:
- **Windows Shells** (cmd, powershell): Expect Windows paths (C:\...)
- **WSL**: Expects Unix paths (/mnt/c/...)
- **Git Bash**: Accepts both formats (/c/... and C:\...)

### Command Validation

Commands are validated against shell-specific:
- Blocked commands list
- Blocked arguments list
- Blocked operators list
- Maximum command length

## Validation Flow

1. **Create Context**: Build validation context from resolved shell config
2. **Validate Path**: Check working directory format and allowed paths
3. **Validate Command**: Check operators, commands, arguments, and length
4. **Handle Chained Commands**: Process each step in && chains

## Path Format Examples

### Windows Shells

```shell
C:\Users\Test         ✓ Valid
D:\Projects\App       ✓ Valid
/c/Users/Test         ✗ Invalid format
```

### WSL

```shell
/home/user            ✓ Valid
/mnt/c/Projects       ✓ Valid
C:\Projects           ✗ Invalid format
```

### Git Bash

```shell
C:\Projects           ✓ Valid (Windows format)
/c/Projects           ✓ Valid (Unix format)
/home/user            ✓ Valid (Pure Unix)
```

## Error Messages

Error messages include the shell name for clarity:

- "Command contains blocked operator for cmd: &"
- "Working directory must be within allowed paths: /home/user, /tmp"
- "Command exceeds maximum length of 2000 for powershell"

### 2. Update README.md Validation Section

Add to README.md:

```markdown
## Shell-Specific Validation

Each shell can have its own validation rules:

### Path Formats

Different shells expect different path formats:
- **CMD/PowerShell**: Windows paths (`C:\Users\...`)
- **WSL**: Unix paths (`/home/user`, `/mnt/c/...`)
- **Git Bash**: Both formats (`C:\...` or `/c/...`)

### Blocked Commands

Configure shell-specific dangerous commands:
```json
{
  "shells": {
    "cmd": {
      "overrides": {
        "restrictions": {
          "blockedCommands": ["del", "format", "rd"]
        }
      }
    },
    "wsl": {
      "overrides": {
        "restrictions": {
          "blockedCommands": ["rm -rf /", "dd if=/dev/zero"]
        }
      }
    }
  }
}
```

### Security Settings

Override security settings per shell:

```json
{
  "shells": {
    "wsl": {
      "overrides": {
        "security": {
          "commandTimeout": 120,  // WSL commands may take longer
          "maxCommandLength": 5000  // Allow longer Unix command lines
        }
      }
    }
  }
}
```

## Implementation Phases

### Phase 1: Core Validation Updates

1. Create validation context structure
2. Implement shell-aware path normalization
3. Update validation functions to use context

### Phase 2: Path Validation

1. Implement format-specific path validation
2. Add Git Bash mixed format support
3. Handle path conversion for validation

### Phase 3: Integration

1. Update main server to use validation context
2. Ensure error messages include shell context

## Acceptance Criteria

### Functional Requirements

- [ ] Each shell validates paths according to its expected format
- [ ] Windows shells reject Unix-style paths
- [ ] WSL rejects Windows-style paths
- [ ] Git Bash accepts both path formats
- [ ] Shell-specific blocked commands/arguments/operators work correctly
- [ ] Command length limits are enforced per shell
- [ ] Error messages clearly indicate which shell and rule caused rejection

### Technical Requirements

- [ ] Validation context properly identifies shell types
- [ ] Path normalization handles all format conversions
- [ ] No hardcoded shell names in validation logic
- [ ] Validation functions are pure (no side effects)
- [ ] All validation errors include helpful context

### Testing Requirements

- [ ] Unit tests for each shell type's validation
- [ ] Tests for path format detection and normalization
- [ ] Tests for cross-format path validation (Git Bash)
- [ ] Tests for all blocked lists (commands, arguments, operators)
- [ ] Edge case tests (empty paths, malformed paths)
- [ ] Error message content validation

### Documentation Requirements

- [ ] Validation architecture documented
- [ ] Shell-specific validation rules documented
- [ ] Path format examples for each shell

## Risk Assessment

### Technical Risks

1. **Risk**: Path format detection may fail for edge cases
   - **Mitigation**: Comprehensive testing with unusual paths

2. **Risk**: Git Bash mixed format support adds complexity
   - **Mitigation**: Clear rules for format detection and conversion

3. **Risk**: Performance impact from context creation
   - **Mitigation**: Lightweight context objects, no heavy computation
