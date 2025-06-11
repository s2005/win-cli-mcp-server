# Task: Update Main Server Implementation

## Overview and Problem Statement

The main `CLIServer` class and its tool execution logic need to be updated to work with the new inheritance-based configuration structure. Currently, the server directly accesses flat configuration properties and doesn't use resolved shell configurations. We need to update the server to properly resolve configurations for each shell and use validation contexts throughout.

### Current Issues

- Server stores flat lists of allowed paths and blocked commands
- Tool execution directly accesses `config.security` and `config.shells`
- No resolution of shell-specific configurations before execution
- Validation doesn't use shell-specific contexts
- Configuration serialization exposes internal structure

## Technical Implementation Details

### 1. Update CLIServer Class Structure

Update `src/index.ts` - CLIServer class:

```typescript
import type { ServerConfig, ResolvedShellConfig } from './types/config.js';
import { getResolvedShellConfig } from './utils/config.js';
import { createValidationContext, ValidationContext } from './utils/validationContext.js';
import { 
  validateWorkingDirectory as validateWorkingDirectoryWithContext,
  normalizePathForShell 
} from './utils/pathValidation.js';

export class CLIServer {
  private server: Server;
  private config: ServerConfig;
  private serverActiveCwd: string | undefined;
  // Cache resolved configurations for performance
  private resolvedConfigs: Map<string, ResolvedShellConfig> = new Map();
  
  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server({
      name: "windows-cli-server",
      version: packageJson.version,
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });

    // Pre-resolve enabled shell configurations
    this.initializeShellConfigs();
    
    // Initialize server working directory
    this.initializeWorkingDirectory();
    
    this.setupHandlers();
  }

  private initializeShellConfigs(): void {
    for (const [shellName, shellConfig] of Object.entries(this.config.shells)) {
      if (shellConfig?.enabled) {
        const resolved = getResolvedShellConfig(this.config, shellName as keyof ServerConfig['shells']);
        if (resolved) {
          this.resolvedConfigs.set(shellName, resolved);
        }
      }
    }
  }

  private initializeWorkingDirectory(): void {
    let candidateCwd: string | undefined = undefined;
    let chdirFailed = false;
    const startupMessages: string[] = [];

    // Try initial directory if configured
    if (this.config.global.paths.initialDir && typeof this.config.global.paths.initialDir === 'string') {
      try {
        process.chdir(this.config.global.paths.initialDir);
        candidateCwd = this.config.global.paths.initialDir;
        startupMessages.push(`INFO: Successfully changed current working directory to configured initialDir: ${candidateCwd}`);
      } catch (err: any) {
        startupMessages.push(`ERROR: Failed to change directory to configured initialDir '${this.config.global.paths.initialDir}': ${err?.message}. Falling back to process CWD.`);
        chdirFailed = true;
      }
    }

    // Fallback to process.cwd()
    if (!candidateCwd || chdirFailed) {
      candidateCwd = normalizeWindowsPath(process.cwd());
      if (chdirFailed) {
        startupMessages.push(`INFO: Current working directory remains: ${candidateCwd}`);
      }
    }

    // Check if CWD is allowed based on global config
    const restrictCwd = this.config.global.security.restrictWorkingDirectory;
    const globalAllowedPaths = this.config.global.paths.allowedPaths;

    if (restrictCwd && globalAllowedPaths.length > 0) {
      const isCandidateCwdAllowed = isPathAllowed(candidateCwd!, globalAllowedPaths);
      if (!isCandidateCwdAllowed) {
        this.serverActiveCwd = undefined;
        startupMessages.push(`INFO: Server's effective starting directory: ${candidateCwd}`);
        startupMessages.push("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.");
        startupMessages.push("INFO: The server's active working directory is currently NOT SET.");
        startupMessages.push("INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.");
        startupMessages.push(`INFO: Configured allowed paths are: ${globalAllowedPaths.join(', ')}`);
      } else {
        this.serverActiveCwd = candidateCwd;
        startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
      }
    } else {
      this.serverActiveCwd = candidateCwd;
      startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
    }

    startupMessages.forEach(msg => console.error(msg));
  }

  private getShellConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  private getEnabledShells(): string[] {
    return Array.from(this.resolvedConfigs.keys());
  }
}
```

### 2. Update Command Validation Methods

Update validation methods in `src/index.ts`:

```typescript
private validateCommand(
  context: ValidationContext,
  command: string,
  workingDir: string
): void {
  const steps = command.split(/\s*&&\s*/);
  let currentDir = normalizePathForShell(workingDir, context);

  for (const step of steps) {
    const trimmed = step.trim();
    if (!trimmed) continue;

    this.validateSingleCommand(context, trimmed);

    // Handle directory changes
    const { command: executable, args } = parseCommand(trimmed);
    if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
      // Normalize the target path for the shell type
      let target = normalizePathForShell(args[0], context);
      
      // If relative, resolve against current directory
      if (!path.isAbsolute(target) && !target.startsWith('/')) {
        if (context.isWindowsShell) {
          target = path.win32.resolve(currentDir, target);
        } else {
          target = path.posix.resolve(currentDir, target);
        }
      }
      
      // Validate the new directory
      validateWorkingDirectoryWithContext(target, context);
      currentDir = target;
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
      `Command is blocked for ${context.shellName}: "${extractCommandName(executable)}"`
    );
  }

  if (isArgumentBlocked(args, context)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `One or more arguments are blocked for ${context.shellName}. Check configuration for blocked patterns.`
    );
  }

  validateCommandLength(command, context);
}
```

### 3. Update Execute Command Tool Handler

Update the execute_command handler in `src/index.ts`:

```typescript
case "execute_command": {
  // Parse and validate shell argument
  const enabledShells = this.getEnabledShells();
  if (enabledShells.length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'No shells are enabled in the configuration'
    );
  }

  const args = z.object({
    shell: z.enum(enabledShells as [string, ...string[]]),
    command: z.string(),
    workingDir: z.string().optional()
  }).parse(toolParams.arguments);

  // Get resolved shell configuration
  const shellConfig = this.getShellConfig(args.shell);
  if (!shellConfig) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Shell '${args.shell}' is not configured or enabled`
    );
  }

  // Create validation context
  const context = createValidationContext(args.shell, shellConfig);

  // Determine working directory
  let workingDir: string;
  if (args.workingDir) {
    // Normalize for the shell type
    workingDir = normalizePathForShell(args.workingDir, context);
    
    // Validate if restrictions are enabled
    if (shellConfig.security.restrictWorkingDirectory) {
      try {
        validateWorkingDirectoryWithContext(workingDir, context);
      } catch (error: any) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Working directory validation failed: ${error.message}`
        );
      }
    }
  } else {
    // Use server's active directory
    if (!this.serverActiveCwd) {
      return {
        content: [{
          type: "text",
          text: "Error: Server's active working directory is not set. Please use the 'set_current_directory' tool to establish a valid working directory before running commands without an explicit 'workingDir'."
        }],
        isError: true,
        metadata: {}
      };
    }
    workingDir = this.serverActiveCwd;
    
    // Validate active directory for this shell
    if (shellConfig.security.restrictWorkingDirectory) {
      try {
        validateWorkingDirectoryWithContext(workingDir, context);
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error: Current directory '${workingDir}' is not allowed for shell '${args.shell}'. ${error.message}`
          }],
          isError: true,
          metadata: {}
        };
      }
    }
  }

  // Validate command
  this.validateCommand(context, args.command, workingDir);

  // Execute command with proper timeout from shell config
  return this.executeShellCommand(args.shell, shellConfig, args.command, workingDir);
}

private async executeShellCommand(
  shellName: string,
  shellConfig: ResolvedShellConfig,
  command: string,
  workingDir: string
): Promise<CallToolResult> {
  return new Promise((resolve, reject) => {
    let shellProcess: ReturnType<typeof spawn>;
    let spawnArgs: string[];

    // Special handling for WSL to parse command properly
    if (shellName === 'wsl') {
      const parsedCommand = parseCommand(command);
      spawnArgs = [...shellConfig.executable.args, parsedCommand.command, ...parsedCommand.args];
    } else {
      spawnArgs = [...shellConfig.executable.args, command];
    }

    try {
      shellProcess = spawn(
        shellConfig.executable.command,
        spawnArgs,
        { 
          cwd: workingDir, 
          stdio: ['pipe', 'pipe', 'pipe'],
          // Add environment variables if needed
          env: { ...process.env }
        }
      );
    } catch (err) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to start ${shellName} process: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let output = '';
    let error = '';

    shellProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    shellProcess.stderr?.on('data', (data) => {
      error += data.toString();
    });

    shellProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      let resultMessage = '';
      if (code === 0) {
        resultMessage = output || 'Command completed successfully (no output)';
      } else {
        resultMessage = `Command failed with exit code ${code}\n`;
        if (error) {
          resultMessage += `Error output:\n${error}\n`;
        }
        if (output) {
          resultMessage += `Standard output:\n${output}`;
        }
      }

      resolve({
        content: [{
          type: "text",
          text: resultMessage
        }],
        isError: code !== 0,
        metadata: {
          exitCode: code ?? -1,
          shell: shellName,
          workingDirectory: workingDir
        }
      });
    });

    shellProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(new McpError(
        ErrorCode.InternalError,
        `${shellName} process error: ${err.message}`
      ));
    });

    // Use shell-specific timeout
    const timeout = setTimeout(() => {
      shellProcess.kill();
      reject(new McpError(
        ErrorCode.InternalError,
        `Command execution timed out after ${shellConfig.security.commandTimeout} seconds in ${shellName}`
      ));
    }, shellConfig.security.commandTimeout * 1000);
  });
}
```

### 4. Update Configuration Serialization

Update `src/utils/configUtils.ts`:

```typescript
import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

/**
 * Create a safe, serializable version of the configuration for external use
 */
export function createSerializableConfig(config: ServerConfig): any {
  const serializable: any = {
    global: {
      security: {
        maxCommandLength: config.global.security.maxCommandLength,
        commandTimeout: config.global.security.commandTimeout,
        enableInjectionProtection: config.global.security.enableInjectionProtection,
        restrictWorkingDirectory: config.global.security.restrictWorkingDirectory
      },
      restrictions: {
        blockedCommands: [...config.global.restrictions.blockedCommands],
        blockedArguments: [...config.global.restrictions.blockedArguments],
        blockedOperators: [...config.global.restrictions.blockedOperators]
      },
      paths: {
        allowedPaths: [...config.global.paths.allowedPaths],
        initialDir: config.global.paths.initialDir
      }
    },
    shells: {}
  };

  // Add shell configurations
  for (const [shellName, shellConfig] of Object.entries(config.shells)) {
    if (!shellConfig) continue;
    
    const shellInfo: any = {
      enabled: shellConfig.enabled,
      executable: {
        command: shellConfig.executable.command,
        args: [...shellConfig.executable.args]
      }
    };

    // Add overrides if present
    if (shellConfig.overrides) {
      shellInfo.overrides = {};
      
      if (shellConfig.overrides.security) {
        shellInfo.overrides.security = { ...shellConfig.overrides.security };
      }
      
      if (shellConfig.overrides.restrictions) {
        shellInfo.overrides.restrictions = {
          blockedCommands: shellConfig.overrides.restrictions.blockedCommands ? 
            [...shellConfig.overrides.restrictions.blockedCommands] : undefined,
          blockedArguments: shellConfig.overrides.restrictions.blockedArguments ?
            [...shellConfig.overrides.restrictions.blockedArguments] : undefined,
          blockedOperators: shellConfig.overrides.restrictions.blockedOperators ?
            [...shellConfig.overrides.restrictions.blockedOperators] : undefined
        };
      }
      
      if (shellConfig.overrides.paths) {
        shellInfo.overrides.paths = {
          allowedPaths: shellConfig.overrides.paths.allowedPaths ?
            [...shellConfig.overrides.paths.allowedPaths] : undefined,
          initialDir: shellConfig.overrides.paths.initialDir
        };
      }
    }

    // Add WSL-specific config if present
    if ('wslConfig' in shellConfig && shellConfig.wslConfig) {
      shellInfo.wslConfig = {
        mountPoint: shellConfig.wslConfig.mountPoint,
        inheritGlobalPaths: shellConfig.wslConfig.inheritGlobalPaths,
        pathMapping: shellConfig.wslConfig.pathMapping ? {
          enabled: shellConfig.wslConfig.pathMapping.enabled,
          windowsToWsl: shellConfig.wslConfig.pathMapping.windowsToWsl
        } : undefined
      };
    }

    serializable.shells[shellName] = shellInfo;
  }

  return serializable;
}

/**
 * Create a summary of resolved configuration for a specific shell
 */
export function createResolvedConfigSummary(
  shellName: string,
  resolved: ResolvedShellConfig
): any {
  return {
    shell: shellName,
    enabled: resolved.enabled,
    executable: {
      command: resolved.executable.command,
      args: [...resolved.executable.args]
    },
    effectiveSettings: {
      security: { ...resolved.security },
      restrictions: {
        blockedCommands: [...resolved.restrictions.blockedCommands],
        blockedArguments: [...resolved.restrictions.blockedArguments],
        blockedOperators: [...resolved.restrictions.blockedOperators]
      },
      paths: {
        allowedPaths: [...resolved.paths.allowedPaths],
        initialDir: resolved.paths.initialDir
      }
    },
    wslConfig: resolved.wslConfig ? {
      mountPoint: resolved.wslConfig.mountPoint,
      inheritGlobalPaths: resolved.wslConfig.inheritGlobalPaths
    } : undefined
  };
}
```

### 5. Update Other Tool Handlers

Update remaining tool handlers in `src/index.ts`:

```typescript
case "set_current_directory": {
  const args = z.object({
    path: z.string()
  }).parse(toolParams.arguments);

  // Normalize the path (Windows style for server's internal use)
  const newDir = normalizeWindowsPath(args.path);

  // Validate against global allowed paths
  try {
    if (this.config.global.security.restrictWorkingDirectory) {
      if (!isPathAllowed(newDir, this.config.global.paths.allowedPaths)) {
        throw new Error(
          `Directory must be within allowed paths: ${this.config.global.paths.allowedPaths.join(', ')}`
        );
      }
    }

    // Change directory
    process.chdir(newDir);
    this.serverActiveCwd = newDir;
    
    return {
      content: [{
        type: "text",
        text: `Current directory changed to: ${newDir}`
      }],
      isError: false,
      metadata: {
        previousDirectory: args.path,
        newDirectory: newDir
      }
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to change directory: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true,
      metadata: {
        requestedDirectory: args.path
      }
    };
  }
}

case "validate_directories": {
  if (!this.config.global.security.restrictWorkingDirectory) {
    return {
      content: [{
        type: "text",
        text: "Directory validation is disabled because 'restrictWorkingDirectory' is not enabled in the server configuration."
      }],
      isError: true,
      metadata: {}
    };
  }
  
  const args = ValidateDirectoriesArgsSchema.parse(toolParams.arguments);
  const { directories } = args;
  
  // Check if shell is specified for shell-specific validation
  const shellName = (args as any).shell as string | undefined;
  
  if (shellName) {
    // Shell-specific validation
    const shellConfig = this.getShellConfig(shellName);
    if (!shellConfig) {
      return {
        content: [{
          type: "text",
          text: `Shell '${shellName}' is not configured or enabled`
        }],
        isError: true,
        metadata: {}
      };
    }
    
    const context = createValidationContext(shellName, shellConfig);
    const invalidDirs: string[] = [];
    
    for (const dir of directories) {
      try {
        validateWorkingDirectoryWithContext(dir, context);
      } catch (error) {
        invalidDirs.push(dir);
      }
    }
    
    if (invalidDirs.length > 0) {
      return {
        content: [{
          type: "text",
          text: `The following directories are invalid for ${shellName}: ${invalidDirs.join(', ')}. Allowed paths: ${shellConfig.paths.allowedPaths.join(', ')}`
        }],
        isError: true,
        metadata: { invalidDirectories: invalidDirs, shell: shellName }
      };
    }
  } else {
    // Global validation
    validateDirectoriesAndThrow(directories, this.config.global.paths.allowedPaths);
  }
  
  return {
    content: [{
      type: "text",
      text: "All specified directories are valid and within allowed paths."
    }],
    isError: false,
    metadata: {}
  };
}

case "get_config": {
  const safeConfig = createSerializableConfig(this.config);
  
  // Optionally add resolved configs for each shell
  const resolvedConfigs: any = {};
  for (const [shellName, resolved] of this.resolvedConfigs.entries()) {
    resolvedConfigs[shellName] = createResolvedConfigSummary(shellName, resolved);
  }
  
  const fullConfig = {
    configuration: safeConfig,
    resolvedShells: resolvedConfigs
  };
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(fullConfig, null, 2)
    }],
    isError: false,
    metadata: {}
  };
}
```

## Working Examples

### Example 1: Shell-Specific Command Execution

```typescript
// User executes command in CMD
{
  "tool": "execute_command",
  "arguments": {
    "shell": "cmd",
    "command": "dir /b",
    "workingDir": "C:\\Projects"
  }
}
// Server:
// 1. Gets resolved CMD config (timeout: 60s, blocked commands include 'del')
// 2. Creates CMD validation context
// 3. Validates 'dir' is not blocked, path is allowed
// 4. Executes with 60s timeout

// User executes command in WSL
{
  "tool": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "ls -la",
    "workingDir": "/home/user"
  }
}
// Server:
// 1. Gets resolved WSL config (timeout: 120s, Unix paths)
// 2. Creates WSL validation context
// 3. Validates Unix path format, checks against WSL allowed paths
// 4. Executes with 120s timeout
```

### Example 2: Configuration Response

```json
{
  "configuration": {
    "global": {
      "security": {
        "maxCommandLength": 2000,
        "commandTimeout": 30,
        "enableInjectionProtection": true,
        "restrictWorkingDirectory": true
      },
      "restrictions": {
        "blockedCommands": ["format", "shutdown"],
        "blockedArguments": ["--system"],
        "blockedOperators": ["&", "|", ";", "`"]
      },
      "paths": {
        "allowedPaths": ["C:\\Users\\default", "D:\\Projects"]
      }
    },
    "shells": {
      "cmd": {
        "enabled": true,
        "executable": {
          "command": "cmd.exe",
          "args": ["/c"]
        },
        "overrides": {
          "security": {
            "commandTimeout": 60
          }
        }
      }
    }
  },
  "resolvedShells": {
    "cmd": {
      "shell": "cmd",
      "enabled": true,
      "effectiveSettings": {
        "security": {
          "maxCommandLength": 2000,
          "commandTimeout": 60,
          "enableInjectionProtection": true,
          "restrictWorkingDirectory": true
        },
        "restrictions": {
          "blockedCommands": ["format", "shutdown"],
          "blockedArguments": ["--system"],
          "blockedOperators": ["&", "|", ";", "`"]
        }
      }
    }
  }
}
```

## Unit Test Requirements

### 1. Create `tests/server/serverImplementation.test.ts`

```typescript
import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('CLIServer Implementation', () => {
  describe('Shell Configuration Resolution', () => {
    test('pre-resolves enabled shell configurations', () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 60 }
            }
          },
          powershell: {
            enabled: false,
            executable: { command: 'powershell.exe', args: ['-Command'] }
          }
        }
      });

      const server = new CLIServer(config);
      
      // Should have resolved CMD but not PowerShell
      expect((server as any).resolvedConfigs.has('cmd')).toBe(true);
      expect((server as any).resolvedConfigs.has('powershell')).toBe(false);
      
      // CMD should have overridden timeout
      const cmdResolved = (server as any).resolvedConfigs.get('cmd');
      expect(cmdResolved.security.commandTimeout).toBe(60);
    });

    test('lists only enabled shells', () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } },
          powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      const enabledShells = (server as any).getEnabledShells();
      
      expect(enabledShells).toContain('cmd');
      expect(enabledShells).toContain('wsl');
      expect(enabledShells).not.toContain('powershell');
    });
  });

  describe('Working Directory Initialization', () => {
    test('uses initialDir from global config', () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\other');
      
      const config = buildTestConfig({
        global: {
          paths: {
            allowedPaths: ['C:\\allowed'],
            initialDir: 'C:\\allowed'
          }
        }
      });

      const server = new CLIServer(config);
      
      expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed');
      expect((server as any).serverActiveCwd).toBe('C:\\allowed');
      
      chdirSpy.mockRestore();
      cwdSpy.mockRestore();
    });

    test('validates CWD against global allowed paths', () => {
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\not-allowed');
      
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);
      
      expect((server as any).serverActiveCwd).toBeUndefined();
      
      cwdSpy.mockRestore();
    });
  });

  describe('Command Execution with Context', () => {
    test('uses shell-specific timeout', async () => {
      const spawnMock = jest.fn(() => {
        const proc = new (require('events').EventEmitter)();
        proc.stdout = new (require('events').EventEmitter)();
        proc.stderr = new (require('events').EventEmitter)();
        proc.kill = jest.fn();
        
        // Simulate timeout
        setTimeout(() => {
          // Don't emit close event, let timeout fire
        }, 200);
        
        return proc;
      });
      
      jest.doMock('child_process', () => ({ spawn: spawnMock }));
      
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 }
        },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: {
              security: { commandTimeout: 0.1 } // 100ms timeout
            }
          }
        }
      });

      const { CLIServer: MockedCLIServer } = await import('../../src/index.js');
      const server = new MockedCLIServer(config);
      
      jest.useFakeTimers();
      
      const resultPromise = server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'sleep 5' }
      });
      
      jest.advanceTimersByTime(150); // Past WSL timeout
      
      await expect(resultPromise).rejects.toThrow(/timed out after 0.1 seconds.*wsl/);
      
      jest.useRealTimers();
      jest.dontMock('child_process');
    });

    test('validates paths based on shell type', async () => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              paths: { allowedPaths: ['C:\\Windows'] }
            }
          },
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: {
              paths: { allowedPaths: ['/home/user'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      
      // CMD should reject Unix paths
      const cmdResult = await server._executeTool({
        name: 'execute_command',
        arguments: { 
          shell: 'cmd', 
          command: 'echo test',
          workingDir: '/home/user' 
        }
      }) as CallToolResult;
      
      expect(cmdResult.isError).toBe(true);
      expect(cmdResult.content[0].text).toContain('validation failed');
      
      // WSL should reject Windows paths
      const wslResult = await server._executeTool({
        name: 'execute_command',
        arguments: { 
          shell: 'wsl', 
          command: 'echo test',
          workingDir: 'C:\\Windows' 
        }
      }) as CallToolResult;
      
      expect(wslResult.isError).toBe(true);
      expect(wslResult.content[0].text).toContain('validation failed');
    });
  });
});
```

### 2. Create `tests/server/toolHandlers.test.ts`

```typescript
import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('Tool Handlers', () => {
  describe('get_config tool', () => {
    test('returns both configuration and resolved settings', async () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 },
          restrictions: { blockedCommands: ['global-blocked'] }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 60 },
              restrictions: { blockedCommands: ['cmd-specific'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'get_config',
        arguments: {}
      }) as CallToolResult;

      const configData = JSON.parse(result.content[0].text);
      
      // Check configuration structure
      expect(configData.configuration.global.security.commandTimeout).toBe(30);
      expect(configData.configuration.shells.cmd.overrides.security.commandTimeout).toBe(60);
      
      // Check resolved settings
      expect(configData.resolvedShells.cmd.effectiveSettings.security.commandTimeout).toBe(60);
      expect(configData.resolvedShells.cmd.effectiveSettings.restrictions.blockedCommands)
        .toEqual(['global-blocked', 'cmd-specific']);
    });
  });

  describe('validate_directories tool', () => {
    test('supports shell-specific validation', async () => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\global'] }
        },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: {
              paths: { allowedPaths: ['/home/user', '/tmp'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      
      // Global validation
      const globalResult = await server._executeTool({
        name: 'validate_directories',
        arguments: { directories: ['C:\\global\\sub', 'C:\\other'] }
      }) as CallToolResult;
      
      expect(globalResult.isError).toBe(true);
      expect(globalResult.content[0].text).toContain('C:\\other');
      
      // Shell-specific validation (with shell parameter)
      const wslResult = await server._executeTool({
        name: 'validate_directories',
        arguments: { 
          directories: ['/home/user/work', '/usr/local'],
          shell: 'wsl'
        }
      }) as CallToolResult;
      
      expect(wslResult.isError).toBe(true);
      expect(wslResult.content[0].text).toContain('/usr/local');
      expect(wslResult.content[0].text).toContain('wsl');
    });
  });

  describe('set_current_directory tool', () => {
    test('validates against global allowed paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);
      
      // Allowed directory
      const successResult = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\allowed\\sub' }
      }) as CallToolResult;
      
      expect(successResult.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed\\sub');
      expect((server as any).serverActiveCwd).toBe('C:\\allowed\\sub');
      
      // Disallowed directory
      const failResult = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\not-allowed' }
      }) as CallToolResult;
      
      expect(failResult.isError).toBe(true);
      expect(failResult.content[0].text).toContain('must be within allowed paths');
      
      chdirSpy.mockRestore();
    });
  });
});
```

## Documentation Updates

### 1. Update Architecture Documentation

Create `docs/ARCHITECTURE.md`:

```markdown
# Windows CLI MCP Server Architecture

## Overview

The server uses an inheritance-based configuration system where global defaults can be overridden by shell-specific settings.

## Core Components

### Configuration Resolution

1. **Global Defaults**: Applied to all shells
2. **Shell Overrides**: Shell-specific settings that override globals
3. **Resolved Configuration**: Final merged configuration used for execution

### Validation Context

Each command execution creates a validation context that includes:
- Shell name and type
- Resolved configuration for that shell
- Path format expectations

### Command Execution Flow

1. **Parse Request**: Validate shell and command arguments
2. **Resolve Configuration**: Get merged configuration for the shell
3. **Create Context**: Build validation context
4. **Validate Path**: Check working directory format and permissions
5. **Validate Command**: Check against shell-specific restrictions
6. **Execute**: Run command with shell-specific timeout

## Configuration Hierarchy

```config
ServerConfig
├── global
│   ├── security (timeout, max length, etc.)
│   ├── restrictions (blocked items)
│   └── paths (allowed paths)
└── shells
    ├── cmd
    │   ├── executable
    │   └── overrides
    ├── powershell
    │   ├── executable
    │   └── overrides
    └── wsl
        ├── executable
        ├── overrides
        └── wslConfig

```

## Tool Handlers

### execute_command

- Resolves shell configuration
- Creates validation context
- Validates and executes with shell-specific settings

### get_config

- Returns both raw configuration and resolved settings
- Shows effective configuration for each shell

### validate_directories

- Supports global validation against global paths
- Supports shell-specific validation with shell parameter

### set_current_directory

- Always validates against global allowed paths
- Updates server's active working directory

### 2. Update API Documentation

Create `docs/API.md`:

# API Reference

## Tools

### execute_command

Execute a command in the specified shell with shell-specific validation and settings.

**Arguments:**

- `shell` (string, required): Shell to use (must be enabled in config)
- `command` (string, required): Command to execute
- `workingDir` (string, optional): Working directory

**Validation:**

- Path format must match shell expectations
- Command/arguments checked against shell-specific blocked lists
- Working directory validated against shell-specific allowed paths

**Example:**

```json
{
  "name": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "ls -la",
    "workingDir": "/home/user"
  }
}
```

### get_config

Get the complete configuration including resolved settings for each shell.

**Returns:**

- `configuration`: The raw configuration structure
- `resolvedShells`: Effective settings for each enabled shell

### validate_directories

Check if directories are valid for global or shell-specific contexts.

**Arguments:**

- `directories` (string[], required): List of directories to validate
- `shell` (string, optional): Specific shell to validate against

**Without shell parameter:** Validates against global allowed paths
**With shell parameter:** Validates against shell-specific allowed paths

## Implementation Phases

### Phase 1: Core Server Updates

1. Update CLIServer class structure
2. Implement configuration resolution caching
3. Update working directory initialization

### Phase 2: Validation Integration

1. Update command validation to use contexts
2. Implement shell-aware path validation
3. Update error messages with shell context

### Phase 3: Tool Handler Updates

1. Update execute_command for shell-specific execution
2. Enhance get_config with resolved configurations
3. Add shell-specific validate_directories support

### Phase 4: Testing

1. Test configuration resolution
2. Test shell-specific timeouts
3. Test path validation per shell
4. Test tool handler updates

## Acceptance Criteria

### Functional Requirements

- [ ] Server pre-resolves configurations for enabled shells on startup
- [ ] Each shell uses its resolved configuration for all operations
- [ ] Command timeout is shell-specific
- [ ] Path validation uses shell-specific allowed paths and formats
- [ ] Blocked lists are properly merged (commands/args appended, operators replaced)
- [ ] Configuration API shows both raw and resolved settings
- [ ] All error messages include shell context

### Technical Requirements

- [ ] Resolved configurations are cached for performance
- [ ] No direct access to flat config structure
- [ ] Validation always uses contexts
- [ ] Shell process creation uses resolved executable config
- [ ] Configuration serialization doesn't expose functions

### Testing Requirements

- [ ] Unit tests for configuration resolution caching
- [ ] Tests for shell-specific timeout enforcement
- [ ] Tests for path format validation per shell
- [ ] Integration tests for full command execution flow
- [ ] Tests for configuration API responses

### Documentation Requirements

- [ ] Architecture documentation explains resolution flow
- [ ] API documentation shows new response formats
- [ ] Migration guide includes server implementation changes
- [ ] Code comments explain caching strategy

## Risk Assessment

### Technical Risks

1. **Risk**: Performance impact from resolution overhead
   - **Mitigation**: Cache resolved configurations on startup

2. **Risk**: Memory usage from caching configurations
   - **Mitigation**: Minimal overhead, only enabled shells cached

3. **Risk**: Complex validation flow
   - **Mitigation**: Clear separation of concerns with contexts

### Compatibility Risks

1. **Risk**: Tool response format changes
   - **Mitigation**: Maintain backward compatible structure

2. **Risk**: Error message format changes
   - **Mitigation**: Add context without changing base format
