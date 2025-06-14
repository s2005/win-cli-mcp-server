# Task: Update Tool Handlers and Resource Providers

## Overview and Problem Statement

The tool listing and resource providers need to be updated to work with the new configuration structure. The handlers should use resolved configurations and provide accurate, shell-specific information.

### Requirements

- Tool descriptions should reflect shell-specific settings
- Execute command description should list only enabled shells
- Resource provider should expose clean configuration structure
- Provide access to resolved configuration for specific shells
- Tool input schemas should be dynamic based on actual configuration

## Technical Implementation Details

### 1. Update Tool Description Builder

Update `src/utils/toolDescription.ts`:

```typescript
import type { ResolvedShellConfig } from '../types/config.js';

/**
 * Build tool description with resolved shell information
 */
export function buildExecuteCommandDescription(
  enabledShells: Map<string, ResolvedShellConfig>
): string {
  const lines: string[] = [];
  const shellNames = Array.from(enabledShells.keys());
  
  lines.push(`Execute a command in the specified shell (${shellNames.join(', ')})`);
  lines.push('');
  lines.push('**Shell-Specific Settings:**');
  lines.push('');
  
  // Add summary of each shell's configuration
  for (const [shellName, config] of enabledShells) {
    lines.push(`**${shellName}:**`);
    lines.push(`- Command timeout: ${config.security.commandTimeout}s`);
    lines.push(`- Max command length: ${config.security.maxCommandLength} characters`);
    lines.push(`- Injection protection: ${config.security.enableInjectionProtection ? 'enabled' : 'disabled'}`);
    
    if (config.restrictions.blockedOperators.length > 0) {
      lines.push(`- Blocked operators: ${config.restrictions.blockedOperators.join(', ')}`);
    }
    
    // Add path format information
    if (shellName === 'wsl') {
      lines.push(`- Path format: Unix-style (/home/user, /mnt/c/...)`);
      if (config.wslConfig?.inheritGlobalPaths) {
        lines.push(`- Inherits global Windows paths (converted to /mnt/...)`);
      }
    } else if (shellName === 'cmd' || shellName === 'powershell') {
      lines.push(`- Path format: Windows-style (C:\\Users\\...)`);
    } else if (shellName === 'gitbash') {
      lines.push(`- Path format: Mixed (C:\\... or /c/...)`);
    }
    
    lines.push('');
  }
  
  lines.push('**Working Directory:**');
  lines.push('- If omitted, uses the server\'s current directory');
  lines.push('- Must be within allowed paths for the selected shell');
  lines.push('- Must use the correct format for the shell type');
  lines.push('');
  
  // Add examples
  lines.push('**Examples:**');
  lines.push('');
  
  if (enabledShells.has('cmd')) {
    lines.push('Windows CMD:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "cmd",');
    lines.push('  "command": "dir /b",');
    lines.push('  "workingDir": "C:\\\\Projects"');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }
  
  if (enabledShells.has('wsl')) {
    lines.push('WSL:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "wsl",');
    lines.push('  "command": "ls -la",');
    lines.push('  "workingDir": "/home/user"');
    lines.push('}');
    lines.push('```');
    lines.push('');
  }
  
  if (enabledShells.has('gitbash')) {
    lines.push('Git Bash:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "shell": "gitbash",');
    lines.push('  "command": "git status",');
    lines.push('  "workingDir": "/c/Projects/repo"  // or "C:\\\\Projects\\\\repo"');
    lines.push('}');
    lines.push('```');
  }
  
  return lines.join('\n');
}

/**
 * Build validate_directories tool description
 */
export function buildValidateDirectoriesDescription(
  hasShellSpecific: boolean
): string {
  const lines: string[] = [];
  
  lines.push('Check if directories are within allowed paths');
  lines.push('');
  
  if (hasShellSpecific) {
    lines.push('**Validation Modes:**');
    lines.push('- Global: Validates against server-wide allowed paths (default)');
    lines.push('- Shell-specific: Validates against a specific shell\'s allowed paths');
    lines.push('');
    lines.push('**Shell-Specific Validation:**');
    lines.push('Add the "shell" parameter to validate for a specific shell:');
    lines.push('```json');
    lines.push('{');
    lines.push('  "directories": ["/home/user", "/tmp"],');
    lines.push('  "shell": "wsl"');
    lines.push('}');
    lines.push('```');
  } else {
    lines.push('Validates directories against the global allowed paths configuration.');
  }
  
  return lines.join('\n');
}

/**
 * Build get_config tool description
 */
export function buildGetConfigDescription(): string {
  const lines: string[] = [];
  
  lines.push('Get the Windows CLI server configuration');
  lines.push('');
  lines.push('**Returns:**');
  lines.push('- `configuration`: The server configuration with global and shell-specific settings');
  lines.push('- `resolvedShells`: Effective configuration for each enabled shell after merging');
  lines.push('');
  lines.push('The resolved configuration shows what settings are actually used for each shell,');
  lines.push('including inherited global settings and shell-specific overrides.');
  
  return lines.join('\n');
}
```

### 2. Update ListTools Handler

Update the ListTools handler in `src/index.ts`:

```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [];
  
  // Execute command tool
  const enabledShells = this.getEnabledShells();
  if (enabledShells.length > 0) {
    tools.push({
      name: "execute_command",
      description: buildExecuteCommandDescription(this.resolvedConfigs),
      inputSchema: {
        type: "object",
        properties: {
          shell: { 
            type: "string", 
            enum: enabledShells,
            description: `Shell to use for command execution. Available: ${enabledShells.join(', ')}`
          },
          command: { 
            type: "string", 
            description: "Command to execute"
          },
          workingDir: { 
            type: "string", 
            description: "Working directory (optional). Must use appropriate format for the shell."
          }
        },
        required: ["shell", "command"]
      }
    });
  }
  
  // Get current directory tool
  tools.push({
    name: "get_current_directory",
    description: "Get the server's current working directory",
    inputSchema: { 
      type: "object", 
      properties: {},
      additionalProperties: false
    }
  });
  
  // Set current directory tool
  tools.push({
    name: "set_current_directory",
    description: "Set the server's current working directory. The directory must be within the global allowed paths.",
    inputSchema: { 
      type: "object", 
      properties: { 
        path: { 
          type: "string", 
          description: "Absolute path to set as current working directory"
        } 
      },
      required: ["path"],
      additionalProperties: false
    }
  });
  
  // Get config tool
  tools.push({
    name: "get_config",
    description: buildGetConfigDescription(),
    inputSchema: { 
      type: "object", 
      properties: {},
      additionalProperties: false
    }
  });
  
  // Validate directories tool
  if (this.config.global.security.restrictWorkingDirectory) {
    tools.push({
      name: "validate_directories",
      description: buildValidateDirectoriesDescription(enabledShells.length > 0),
      inputSchema: {
        type: "object",
        properties: {
          directories: { 
            type: "array", 
            items: { type: "string" }, 
            description: "List of directory paths to validate"
          },
          shell: {
            type: "string",
            enum: enabledShells.length > 0 ? [...enabledShells, undefined] : undefined,
            description: "Optional: Validate against a specific shell's configuration"
          }
        },
        required: ["directories"],
        additionalProperties: false
      }
    });
  }
  
  return { tools };
});
```

### 3. Update Resource Provider

Update resource handling in `src/index.ts`:

```typescript
// Add new resource types
this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources: Array<{uri:string,name:string,description:string,mimeType:string}> = [];
  
  // Main configuration resource
  resources.push({
    uri: "cli://config",
    name: "CLI Server Configuration",
    description: "Complete server configuration with global and shell-specific settings",
    mimeType: "application/json"
  });
  
  // Add shell-specific resources for enabled shells
  for (const shellName of this.getEnabledShells()) {
    resources.push({
      uri: `cli://config/shells/${shellName}`,
      name: `${shellName} Shell Configuration`,
      description: `Resolved configuration for ${shellName} shell`,
      mimeType: "application/json"
    });
  }
  
  // Global configuration resource
  resources.push({
    uri: "cli://config/global",
    name: "Global Configuration",
    description: "Global default settings applied to all shells",
    mimeType: "application/json"
  });
  
  // Security info resource
  resources.push({
    uri: "cli://info/security",
    name: "Security Information",
    description: "Current security settings and restrictions",
    mimeType: "application/json"
  });

  return { resources };
});

// Update read resource handler
this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  switch (uri) {
    case "cli://config": {
      // Full configuration
      const safeConfig = createSerializableConfig(this.config);
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(safeConfig, null, 2)
        }]
      };
    }
    
    case "cli://config/global": {
      // Just global configuration
      const globalConfig = {
        security: { ...this.config.global.security },
        restrictions: {
          blockedCommands: [...this.config.global.restrictions.blockedCommands],
          blockedArguments: [...this.config.global.restrictions.blockedArguments],
          blockedOperators: [...this.config.global.restrictions.blockedOperators]
        },
        paths: {
          allowedPaths: [...this.config.global.paths.allowedPaths],
          initialDir: this.config.global.paths.initialDir
        }
      };
      
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(globalConfig, null, 2)
        }]
      };
    }
    
    case "cli://info/security": {
      // Security summary
      const securityInfo = {
        globalSettings: {
          restrictWorkingDirectory: this.config.global.security.restrictWorkingDirectory,
          enableInjectionProtection: this.config.global.security.enableInjectionProtection,
          maxCommandLength: this.config.global.security.maxCommandLength,
          defaultTimeout: this.config.global.security.commandTimeout
        },
        currentWorkingDirectory: this.serverActiveCwd || "Not set",
        enabledShells: this.getEnabledShells(),
        globalAllowedPaths: [...this.config.global.paths.allowedPaths],
        globalBlockedCommands: this.config.global.restrictions.blockedCommands.length,
        globalBlockedArguments: this.config.global.restrictions.blockedArguments.length,
        shellSpecificSettings: {}
      };
      
      // Add shell-specific summary
      for (const [shellName, resolved] of this.resolvedConfigs) {
        securityInfo.shellSpecificSettings[shellName] = {
          timeout: resolved.security.commandTimeout,
          maxCommandLength: resolved.security.maxCommandLength,
          allowedPathsCount: resolved.paths.allowedPaths.length,
          blockedCommandsCount: resolved.restrictions.blockedCommands.length,
          blockedOperators: [...resolved.restrictions.blockedOperators]
        };
      }
      
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify(securityInfo, null, 2)
        }]
      };
    }
    
    default: {
      // Check for shell-specific config
      const shellMatch = uri.match(/^cli:\/\/config\/shells\/(.+)$/);
      if (shellMatch) {
        const shellName = shellMatch[1];
        const resolved = this.resolvedConfigs.get(shellName);
        
        if (!resolved) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Shell '${shellName}' not found or not enabled`
          );
        }
        
        const shellInfo = createResolvedConfigSummary(shellName, resolved);
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(shellInfo, null, 2)
          }]
        };
      }
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource URI: ${uri}`
      );
    }
  }
});
```

### 4. Create Dynamic Tool Schema Builder

Create `src/utils/toolSchemas.ts`:

```typescript
import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

export interface ToolSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Build dynamic input schema for execute_command based on enabled shells
 */
export function buildExecuteCommandSchema(
  enabledShells: string[],
  resolvedConfigs: Map<string, ResolvedShellConfig>
): ToolSchema {
  if (enabledShells.length === 0) {
    throw new Error('No shells enabled');
  }
  
  // Build shell descriptions with key settings
  const shellDescriptions: Record<string, string> = {};
  for (const shell of enabledShells) {
    const config = resolvedConfigs.get(shell);
    if (config) {
      const parts = [`${shell} shell`];
      parts.push(`timeout: ${config.security.commandTimeout}s`);
      
      if (shell === 'wsl') {
        parts.push('Unix paths');
      } else if (shell === 'cmd' || shell === 'powershell') {
        parts.push('Windows paths');
      } else if (shell === 'gitbash') {
        parts.push('Mixed paths');
      }
      
      shellDescriptions[shell] = parts.join(' - ');
    }
  }
  
  return {
    type: "object",
    properties: {
      shell: {
        type: "string",
        enum: enabledShells,
        description: "Shell to use for command execution",
        enumDescriptions: shellDescriptions
      },
      command: {
        type: "string",
        description: "Command to execute. Note: Different shells have different blocked commands and operators."
      },
      workingDir: {
        type: "string",
        description: "Working directory (optional). Format depends on shell type:\n" +
                     "- Windows shells (cmd, powershell): Use C:\\Path\\Format\n" +
                     "- WSL: Use /unix/path/format\n" +
                     "- Git Bash: Both formats accepted"
      }
    },
    required: ["shell", "command"],
    additionalProperties: false
  };
}

/**
 * Build schema for validate_directories with optional shell parameter
 */
export function buildValidateDirectoriesSchema(
  enabledShells: string[]
): ToolSchema {
  const schema: ToolSchema = {
    type: "object",
    properties: {
      directories: {
        type: "array",
        items: { type: "string" },
        description: "List of directory paths to validate",
        minItems: 1
      }
    },
    required: ["directories"],
    additionalProperties: false
  };
  
  if (enabledShells.length > 0) {
    schema.properties.shell = {
      type: "string",
      enum: enabledShells,
      description: "Optional: Validate against a specific shell's allowed paths instead of global paths"
    };
  }
  
  return schema;
}
```

## Working Examples

### Example 1: Tool Listing Response

```json
{
  "tools": [
    {
      "name": "execute_command",
      "description": "Execute a command in the specified shell (cmd, wsl)\n\n**Shell-Specific Settings:**\n\n**cmd:**\n- Command timeout: 60s\n- Max command length: 2000 characters\n- Injection protection: enabled\n- Blocked operators: &, |, ;, `\n- Path format: Windows-style (C:\\Users\\...)\n\n**wsl:**\n- Command timeout: 120s\n- Max command length: 2000 characters\n- Injection protection: enabled\n- Blocked operators: &, |, ;, `\n- Path format: Unix-style (/home/user, /mnt/c/...)\n- Inherits global Windows paths (converted to /mnt/...)\n\n**Working Directory:**\n- If omitted, uses the server's current directory\n- Must be within allowed paths for the selected shell\n- Must use the correct format for the shell type\n\n**Examples:**\n\nWindows CMD:\n```json\n{\n  \"shell\": \"cmd\",\n  \"command\": \"dir /b\",\n  \"workingDir\": \"C:\\\\Projects\"\n}\n```\n\nWSL:\n```json\n{\n  \"shell\": \"wsl\",\n  \"command\": \"ls -la\",\n  \"workingDir\": \"/home/user\"\n}\n```",
      "inputSchema": {
        "type": "object",
        "properties": {
          "shell": {
            "type": "string",
            "enum": ["cmd", "wsl"],
            "description": "Shell to use for command execution",
            "enumDescriptions": {
              "cmd": "cmd shell - timeout: 60s - Windows paths",
              "wsl": "wsl shell - timeout: 120s - Unix paths"
            }
          },
          "command": {
            "type": "string",
            "description": "Command to execute. Note: Different shells have different blocked commands and operators."
          },
          "workingDir": {
            "type": "string",
            "description": "Working directory (optional). Format depends on shell type:\n- Windows shells (cmd, powershell): Use C:\\Path\\Format\n- WSL: Use /unix/path/format\n- Git Bash: Both formats accepted"
          }
        },
        "required": ["shell", "command"],
        "additionalProperties": false
      }
    }
  ]
}
```

### Example 2: Resource Listing

```json
{
  "resources": [
    {
      "uri": "cli://config",
      "name": "CLI Server Configuration",
      "description": "Complete server configuration with global and shell-specific settings",
      "mimeType": "application/json"
    },
    {
      "uri": "cli://config/shells/cmd",
      "name": "cmd Shell Configuration",
      "description": "Resolved configuration for cmd shell",
      "mimeType": "application/json"
    },
    {
      "uri": "cli://config/shells/wsl",
      "name": "wsl Shell Configuration",
      "description": "Resolved configuration for wsl shell",
      "mimeType": "application/json"
    },
    {
      "uri": "cli://config/global",
      "name": "Global Configuration",
      "description": "Global default settings applied to all shells",
      "mimeType": "application/json"
    },
    {
      "uri": "cli://info/security",
      "name": "Security Information",
      "description": "Current security settings and restrictions",
      "mimeType": "application/json"
    }
  ]
}
```

### Example 3: Shell-Specific Resource

```json
// cli://config/shells/wsl
{
  "shell": "wsl",
  "enabled": true,
  "executable": {
    "command": "wsl.exe",
    "args": ["-e"]
  },
  "effectiveSettings": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 120,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown", "rm -rf /", "dd"],
      "blockedArguments": ["--system", "--no-preserve-root"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["/home/user", "/tmp", "/mnt/c/Users"],
      "initialDir": "/home/user"
    }
  },
  "wslConfig": {
    "mountPoint": "/mnt/",
    "inheritGlobalPaths": true
  }
}
```

## Unit Test Requirements

### 1. Create `tests/handlers/toolListHandler.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';

describe('ListTools Handler', () => {
  test('lists only enabled shells in execute_command', async () => {
    const config = buildTestConfig({
      shells: {
        cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
        powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } },
        wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await server._executeTool({
      name: 'list_tools',
      arguments: {}
    });

    const tools = result.content[0].text;
    const executeCommand = tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand).toBeDefined();
    expect(executeCommand.inputSchema.properties.shell.enum).toEqual(['cmd', 'wsl']);
    expect(executeCommand.inputSchema.properties.shell.enum).not.toContain('powershell');
  });

  test('includes shell-specific settings in description', async () => {
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
        }
      }
    });

    const server = new CLIServer(config);
    const result = await server._executeTool({
      name: 'list_tools',
      arguments: {}
    });

    const tools = result.content[0].text;
    const executeCommand = tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand.description).toContain('cmd:');
    expect(executeCommand.description).toContain('Command timeout: 60s');
  });

  test('indicates path format for each shell', async () => {
    const config = buildTestConfig({
      shells: {
        cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
        wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } },
        gitbash: { enabled: true, executable: { command: 'bash.exe', args: ['-c'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await server._executeTool({
      name: 'list_tools',
      arguments: {}
    });

    const tools = result.content[0].text;
    const executeCommand = tools.find(t => t.name === 'execute_command');
    
    expect(executeCommand.description).toContain('Path format: Windows-style');
    expect(executeCommand.description).toContain('Path format: Unix-style');
    expect(executeCommand.description).toContain('Path format: Mixed');
  });

  test('validate_directories shows shell option when shells enabled', async () => {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: true }
      },
      shells: {
        wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } }
      }
    });

    const server = new CLIServer(config);
    const result = await server._executeTool({
      name: 'list_tools',
      arguments: {}
    });

    const tools = result.content[0].text;
    const validateDirs = tools.find(t => t.name === 'validate_directories');
    
    expect(validateDirs).toBeDefined();
    expect(validateDirs.inputSchema.properties.shell).toBeDefined();
    expect(validateDirs.inputSchema.properties.shell.enum).toContain('wsl');
    expect(validateDirs.description).toContain('Shell-Specific Validation');
  });

  test('omits validate_directories when restrictions disabled', async () => {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: false }
      }
    });

    const server = new CLIServer(config);
    const result = await server._executeTool({
      name: 'list_tools',
      arguments: {}
    });

    const tools = result.content[0].text;
    const validateDirs = tools.find(t => t.name === 'validate_directories');
    
    expect(validateDirs).toBeUndefined();
  });
});
```

### 2. Create `tests/handlers/resourceHandler.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';

describe('Resource Handler', () => {
  describe('ListResources', () => {
    test('lists all resource types', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'list_resources',
        arguments: {}
      });

      const resources = result.content[0].text;
      const uris = resources.map(r => r.uri);
      
      expect(uris).toContain('cli://config');
      expect(uris).toContain('cli://config/global');
      expect(uris).toContain('cli://config/shells/cmd');
      expect(uris).toContain('cli://config/shells/wsl');
      expect(uris).toContain('cli://info/security');
    });

    test('only lists enabled shells', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'list_resources',
        arguments: {}
      });

      const resources = result.content[0].text;
      const uris = resources.map(r => r.uri);
      
      expect(uris).toContain('cli://config/shells/cmd');
      expect(uris).not.toContain('cli://config/shells/powershell');
    });
  });

  describe('ReadResource', () => {
    test('returns full configuration', async () => {
      const config = buildTestConfig({
        global: {
          security: { maxCommandLength: 1500 }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://config' }
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.global.security.maxCommandLength).toBe(1500);
    });

    test('returns global configuration only', async () => {
      const config = buildTestConfig({
        global: {
          restrictions: { blockedCommands: ['test-cmd'] }
        },
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://config/global' }
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.restrictions.blockedCommands).toContain('test-cmd');
      expect(content.shells).toBeUndefined();
    });

    test('returns resolved shell configuration', async () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 },
          restrictions: { blockedCommands: ['global-cmd'] }
        },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: {
              security: { commandTimeout: 120 },
              restrictions: { blockedCommands: ['wsl-cmd'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://config/shells/wsl' }
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.shell).toBe('wsl');
      expect(content.effectiveSettings.security.commandTimeout).toBe(120);
      expect(content.effectiveSettings.restrictions.blockedCommands).toEqual(['global-cmd', 'wsl-cmd']);
    });

    test('returns security information summary', async () => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\test'] }
        },
        shells: {
          cmd: { 
            enabled: true, 
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 45 }
            }
          }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://info/security' }
      });

      const content = JSON.parse(result.content[0].text);
      expect(content.globalSettings.restrictWorkingDirectory).toBe(true);
      expect(content.globalAllowedPaths).toContain('C:\\test');
      expect(content.enabledShells).toContain('cmd');
      expect(content.shellSpecificSettings.cmd.timeout).toBe(45);
    });

    test('returns error for unknown resource', async () => {
      const config = buildTestConfig();
      const server = new CLIServer(config);
      
      await expect(server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://unknown' }
      })).rejects.toThrow('Unknown resource URI');
    });

    test('returns error for disabled shell resource', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: false, executable: { command: 'cmd.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      
      await expect(server._executeTool({
        name: 'read_resource',
        arguments: { uri: 'cli://config/shells/cmd' }
      })).rejects.toThrow('not found or not enabled');
    });
  });
});
```

### 3. Create `tests/utils/toolDescription.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals';
import { 
  buildExecuteCommandDescription,
  buildValidateDirectoriesDescription,
  buildGetConfigDescription
} from '../../src/utils/toolDescription';
import type { ResolvedShellConfig } from '../../src/types/config';

describe('Tool Description Builders', () => {
  const createMockResolved = (overrides: Partial<ResolvedShellConfig> = {}): ResolvedShellConfig => ({
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true,
      ...overrides.security
    },
    restrictions: {
      blockedCommands: [],
      blockedArguments: [],
      blockedOperators: ['&', '|'],
      ...overrides.restrictions
    },
    paths: {
      allowedPaths: [],
      ...overrides.paths
    },
    ...overrides
  });

  describe('buildExecuteCommandDescription', () => {
    test('includes all enabled shells', () => {
      const shells = new Map([
        ['cmd', createMockResolved()],
        ['wsl', createMockResolved()]
      ]);

      const description = buildExecuteCommandDescription(shells);
      
      expect(description).toContain('Execute a command in the specified shell (cmd, wsl)');
      expect(description).toContain('**cmd:**');
      expect(description).toContain('**wsl:**');
    });

    test('shows shell-specific settings', () => {
      const shells = new Map([
        ['cmd', createMockResolved({
          security: { commandTimeout: 60, maxCommandLength: 1000 }
        })]
      ]);

      const description = buildExecuteCommandDescription(shells);
      
      expect(description).toContain('Command timeout: 60s');
      expect(description).toContain('Max command length: 1000 characters');
    });

    test('indicates path formats correctly', () => {
      const shells = new Map([
        ['cmd', createMockResolved()],
        ['wsl', createMockResolved({ wslConfig: { inheritGlobalPaths: true } })],
        ['gitbash', createMockResolved()]
      ]);

      const description = buildExecuteCommandDescription(shells);
      
      expect(description).toContain('Path format: Windows-style');
      expect(description).toContain('Path format: Unix-style');
      expect(description).toContain('Path format: Mixed');
      expect(description).toContain('Inherits global Windows paths');
    });

    test('includes relevant examples', () => {
      const shells = new Map([
        ['cmd', createMockResolved()],
        ['wsl', createMockResolved()]
      ]);

      const description = buildExecuteCommandDescription(shells);
      
      expect(description).toContain('Windows CMD:');
      expect(description).toContain('"shell": "cmd"');
      expect(description).toContain('"workingDir": "C:\\\\Projects"');
      
      expect(description).toContain('WSL:');
      expect(description).toContain('"shell": "wsl"');
      expect(description).toContain('"workingDir": "/home/user"');
    });
  });

  describe('buildValidateDirectoriesDescription', () => {
    test('basic description without shell support', () => {
      const description = buildValidateDirectoriesDescription(false);
      
      expect(description).toContain('Check if directories are within allowed paths');
      expect(description).toContain('global allowed paths');
      expect(description).not.toContain('Shell-Specific Validation');
    });

    test('includes shell option when available', () => {
      const description = buildValidateDirectoriesDescription(true);
      
      expect(description).toContain('Validation Modes:');
      expect(description).toContain('Global:');
      expect(description).toContain('Shell-specific:');
      expect(description).toContain('"shell": "wsl"');
    });
  });

  describe('buildGetConfigDescription', () => {
    test('describes return format', () => {
      const description = buildGetConfigDescription();
      
      expect(description).toContain('configuration');
      expect(description).toContain('resolvedShells');
      expect(description).toContain('effective configuration');
      expect(description).toContain('after merging');
    });
  });
});
```

## Documentation Updates

### 1. Create Tool Description Guide

Create `docs/TOOL_DESCRIPTIONS.md`:

```markdown
# Tool Descriptions and Resources

## Dynamic Tool Descriptions

Tool descriptions are generated dynamically based on the current configuration:

### execute_command

The description includes:
- List of enabled shells
- Shell-specific settings (timeout, max length, injection protection)
- Path format expectations for each shell
- Blocked operators for each shell
- Working directory requirements
- Examples for each shell type

### validate_directories

The description changes based on:
- Whether directory restrictions are enabled
- Whether any shells are enabled (enables shell-specific validation)

### get_config

Shows that the tool returns:
- Raw configuration structure
- Resolved effective settings for each shell

## Available Resources

### Configuration Resources

#### cli://config
Complete server configuration including:
- Global defaults
- Shell-specific settings
- All overrides

#### cli://config/global
Just the global configuration:
- Security settings
- Default restrictions
- Global allowed paths

#### cli://config/shells/{shellName}
Resolved configuration for a specific shell showing:
- Effective settings after merging
- Shell-specific overrides
- Special configuration (e.g., WSL mount points)

### Information Resources

#### cli://info/security
Security summary including:
- Global security settings
- Current working directory
- Enabled shells
- Shell-specific security summaries

## Resource Content Examples

### Full Configuration (cli://config)
```json
{
  "global": {
    "security": { ... },
    "restrictions": { ... },
    "paths": { ... }
  },
  "shells": {
    "cmd": { ... },
    "wsl": { ... }
  }
}
```

### Resolved Shell Config (cli://config/shells/wsl)

```json
{
  "shell": "wsl",
  "enabled": true,
  "executable": { ... },
  "effectiveSettings": {
    "security": { ... },
    "restrictions": { ... },
    "paths": { ... }
  },
  "wslConfig": { ... }
}
```

### Security Info (cli://info/security)

```json
{
  "globalSettings": { ... },
  "currentWorkingDirectory": "/current/path",
  "enabledShells": ["cmd", "wsl"],
  "globalAllowedPaths": [...],
  "shellSpecificSettings": {
    "cmd": { ... },
    "wsl": { ... }
  }
}
```

### 2. Update API Reference

Add to `docs/API.md`:

## Resources

The server exposes several resources via the MCP resource protocol:

### Configuration Resources

- `cli://config` - Full server configuration
- `cli://config/global` - Global default settings only
- `cli://config/shells/{shellName}` - Resolved configuration for specific shell

### Information Resources

- `cli://info/security` - Current security settings and restrictions summary

## Dynamic Tool Schemas

Tool input schemas are generated dynamically based on configuration:

### execute_command

- `shell` enum only includes enabled shells
- Shell descriptions include key settings (timeout, path format)
- Working directory description explains format requirements

### validate_directories

- `shell` parameter only appears when shells are enabled
- Enum includes all enabled shells
- Description explains global vs shell-specific validation

## Tool Descriptions

Tool descriptions include:

### Shell-Specific Information

- Timeout settings
- Path format requirements
- Blocked operators
- Special features (WSL path inheritance)

### Examples

- Format-appropriate examples for each shell type
- Working directory format examples
- Common use cases

## Implementation Phases

### Phase 1: Tool Description Updates

1. Create enhanced tool description builders
2. Include shell-specific information
3. Add format-appropriate examples

### Phase 2: Tool Handler Updates

1. Update ListTools to use dynamic descriptions
2. Build schemas from resolved configurations
3. Include only enabled shells

### Phase 3: Resource Provider Updates

1. Add new resource types
2. Implement shell-specific resources
3. Add security information resource

### Phase 4: Testing

1. Test dynamic tool descriptions
2. Test resource content
3. Test edge cases (no shells enabled)

## Acceptance Criteria

### Functional Requirements

- [ ] Tool descriptions reflect actual enabled shells and their settings
- [ ] Execute command description shows shell-specific timeouts and formats
- [ ] Validate directories shows shell option only when shells are enabled
- [ ] Resources expose both raw and resolved configurations
- [ ] Shell-specific resources show effective merged settings
- [ ] Security info resource provides useful summary
- [ ] Tool schemas dynamically built from configuration

### Technical Requirements

- [ ] No hardcoded shell lists in descriptions
- [ ] Descriptions generated from resolved configurations
- [ ] Resource URIs follow consistent pattern
- [ ] Error handling for invalid resource URIs
- [ ] Efficient resource content generation

### Testing Requirements

- [ ] Unit tests for all description builders
- [ ] Tests for resource listing with various configs
- [ ] Tests for each resource type content
- [ ] Tests for error cases (unknown resources)
- [ ] Integration tests for tool listing

### Documentation Requirements

- [ ] Tool description guide explains dynamic nature
- [ ] Resource documentation shows all types
- [ ] API reference updated with new formats
- [ ] Examples for each resource type

## Risk Assessment

### Technical Risks

1. **Risk**: Large descriptions may exceed limits
   - **Mitigation**: Keep descriptions concise, essential info only

2. **Risk**: Performance impact from dynamic generation
   - **Mitigation**: Cache descriptions when possible

3. **Risk**: Complex schema generation logic
   - **Mitigation**: Keep schemas simple and well-tested
