#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CallToolResult, // Changed from CallToolResultPayload
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  isCommandBlocked,
  isArgumentBlocked,
  parseCommand,
  extractCommandName,
  validateShellOperators,
  isPathAllowed,
  normalizeWindowsPath
} from './utils/validation.js';
import { createValidationContext, ValidationContext } from './utils/validationContext.js';
import {
  validateWorkingDirectory as validateWorkingDirectoryWithContext,
  normalizePathForShell
} from './utils/pathValidation.js';
import { validateDirectoriesAndThrow } from './utils/directoryValidator.js';
import { spawn } from 'child_process';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';
import { buildToolDescription } from './utils/toolDescription.js';
import { loadConfig, createDefaultConfig, getResolvedShellConfig } from './utils/config.js';
import { createSerializableConfig, createResolvedConfigSummary } from './utils/configUtils.js';
import type { ServerConfig, ResolvedShellConfig } from './types/config.js';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

// Parse command line arguments using yargs
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const parseArgs = async () => {
  return yargs(hideBin(process.argv))
    .option('config', {
      alias: 'c',
      type: 'string',
      description: 'Path to config file'
    })
    .option('init-config', {
      type: 'string',
      description: 'Create a default config file at the specified path'
    })
    .help()
    .parse();
};

const ValidateDirectoriesArgsSchema = z.object({
  directories: z.array(z.string()),
  shell: z.string().optional()
});


class CLIServer {
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
    const startupMessages: string[] = [];
    const restrictCwd = this.config.global.security.restrictWorkingDirectory;
    const allowedPaths = this.config.global.paths.allowedPaths;

    let candidateCwd = this.config.global.paths.initialDir;

    // Validate candidate against allowed paths before attempting to chdir
    if (restrictCwd && candidateCwd) {
      if (!isPathAllowed(candidateCwd, allowedPaths)) {
        startupMessages.push(`ERROR: Initial directory '${candidateCwd}' is not in allowed paths.`);
        candidateCwd = allowedPaths[0];
        if (candidateCwd) {
          startupMessages.push(`INFO: Falling back to default allowed path '${candidateCwd}'.`);
        }
      }
    }

    if (!candidateCwd) {
      candidateCwd = normalizeWindowsPath(process.cwd());
    }

    try {
      process.chdir(candidateCwd);
      this.serverActiveCwd = candidateCwd;
      startupMessages.push(`INFO: Server's active working directory set to '${this.serverActiveCwd}'.`);
    } catch (error: any) {
      this.serverActiveCwd = undefined;
      startupMessages.push(`ERROR: Failed to set working directory: ${error.message}`);
    }

    startupMessages.forEach(msg => console.error(msg));
  }

  private getShellConfig(shellName: string): ResolvedShellConfig | null {
    return this.resolvedConfigs.get(shellName) || null;
  }

  private getEnabledShells(): string[] {
    return Array.from(this.resolvedConfigs.keys());
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

    if (command.length > context.shellConfig.security.maxCommandLength) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command exceeds maximum length of ${context.shellConfig.security.maxCommandLength} for ${context.shellName}`
      );
    }
  }

  private validateCommand(context: ValidationContext, command: string, workingDir: string): void {
    const steps = command.split(/\s*&&\s*/);
    let currentDir = normalizePathForShell(workingDir, context);

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(context, trimmed);

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

  private async executeShellCommand(
    shellName: string,
    shellConfig: ResolvedShellConfig,
    command: string,
    workingDir: string
  ): Promise<CallToolResult> {
    return new Promise((resolve, reject) => {
      let shellProcess: ReturnType<typeof spawn>;
      let spawnArgs: string[];

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
            type: 'text',
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

      const timeout = setTimeout(() => {
        shellProcess.kill();
        reject(new McpError(
          ErrorCode.InternalError,
          `Command execution timed out after ${shellConfig.security.commandTimeout} seconds in ${shellName}`
        ));
      }, shellConfig.security.commandTimeout * 1000);
    });
  }

  /**
   * Creates a structured copy of the configuration for external use
   * @returns A serializable version of the configuration
   */
  private getSafeConfig(): any {
    return createSerializableConfig(this.config);
  }

  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources: Array<{uri:string,name:string,description:string,mimeType:string}> = [];
      
      // Add a resource for CLI configuration
      resources.push({
        uri: "cli://config",
        name: "CLI Server Configuration",
        description: "Main CLI server configuration (excluding sensitive data)",
        mimeType: "application/json"
      });

      return { resources };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      // Handle CLI configuration resource
      if (uri === "cli://config") {
        // Create a structured copy of config for external use
        const safeConfig = this.getSafeConfig();
        
        return {
          contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(safeConfig, null, 2)
          }]
        };
      }
      
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown resource URI: ${uri}`
      );
    });

    // List available tools: log execute_command description then return tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allowedShells = (Object.keys(this.config.shells) as Array<keyof typeof this.config.shells>)
        .filter(shell => {
          const shellConf = this.config.shells[shell];
          return shellConf && shellConf.enabled; // Check shellConf exists
        });
      const descriptionLines = [
        ...buildToolDescription(allowedShells)
      ];
      const description = descriptionLines.join("\n");
      console.error(`[tool: execute_command] Description:\n${description}`);
      const tools = [
        {
          name: "execute_command",
          description,
          inputSchema: {
            type: "object",
            properties: {
              shell: { type: "string", enum: allowedShells, description: "Shell to use for command execution" },
              command: { type: "string", description: "Command to execute" },
              workingDir: { type: "string", description: "Working directory (optional)" }
            },
            required: ["shell", "command"]
          }
        },
        {
          name: "get_current_directory",
          description: "Get the current working directory",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "set_current_directory",
          description: "Set the current working directory",
          inputSchema: { 
            type: "object", 
            properties: { 
              path: { type: "string", description: "Path to set as current working directory" } 
            },
            required: ["path"]
          }
        },
        {
          name: "get_config",
          description: "Get the windows CLI server configuration",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "validate_directories",
          description: "Check if directories are within allowed paths (only available when restrictWorkingDirectory is enabled)",
          inputSchema: {
            type: "object",
            properties: {
              directories: { type: "array", items: { type: "string" }, description: "List of directories to validate" }
            },
            required: ["directories"]
          }
        }
      ];
      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Directly call the public tool execution logic
      return this._executeTool(request.params);
    });
  }

  // Public method for testing or direct invocation of tool logic
  public async _executeTool(toolParams: z.infer<typeof CallToolRequestSchema>['params']): Promise<CallToolResult> { // Changed return type
    try {
      switch (toolParams.name) {
        case "execute_command": {
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

          const shellConfig = this.getShellConfig(args.shell);
          if (!shellConfig) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Shell '${args.shell}' is not configured or enabled`
            );
          }

          const context = createValidationContext(args.shell, shellConfig);

          let workingDir: string;
          if (args.workingDir) {
            workingDir = normalizePathForShell(args.workingDir, context);
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

          this.validateCommand(context, args.command, workingDir);

          return this.executeShellCommand(args.shell, shellConfig, args.command, workingDir);
        }

        case "get_current_directory": {
          if (!this.serverActiveCwd) {
            return {
              content: [{
                type: "text",
                text: "The server's active working directory is not currently set. Use 'set_current_directory' to set it."
              }],
              isError: false,
              metadata: {}
            };
          }
          const currentDir = this.serverActiveCwd;
          return {
            content: [{
              type: "text",
              text: currentDir
            }],
            isError: false,
            metadata: {}
          };
        }

        case "set_current_directory": {
          // Parse args
          const args = z.object({
            path: z.string()
          }).parse(toolParams.arguments);

          // Determine if this is a GitBash-style path and handle accordingly
          let newDir = args.path;
          // If it's a GitBash path, normalize it to Windows format for Node.js
          if (args.path.match(/^\/[a-z]\//i)) {
            // Convert GitBash-style path (/c/path) to Windows format (C:/path)
            const match = args.path.match(/^\/([a-z])(\/.*)$/i);
            if (match) {
              const drive = match[1].toUpperCase();
              const remainder = match[2].replace(/\//g, '\\');
              newDir = `${drive}:${remainder}`;
            }
          }

          // Validate the path
          try {
            if (this.config.global.security.restrictWorkingDirectory) {
              const normalized = normalizeWindowsPath(newDir);
              if (!isPathAllowed(normalized, this.config.global.paths.allowedPaths)) {
                throw new Error(
                  `Directory must be within allowed paths: ${this.config.global.paths.allowedPaths.join(', ')}`
                );
              }
            }

            // Change directory and update server state
            process.chdir(newDir);
            this.serverActiveCwd = newDir;
            const currentDir = this.serverActiveCwd;
            return {
              content: [{
                type: "text",
                text: `Current directory changed to: ${currentDir}`
              }],
              isError: false,
              metadata: {
                previousDirectory: args.path,
                newDirectory: currentDir
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

        try {
          const args = ValidateDirectoriesArgsSchema.parse(toolParams.arguments);
          const { directories } = args;
          const shellName = (args as any).shell as string | undefined;

          if (shellName) {
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
        } catch (error: any) {
          if (error instanceof z.ZodError) {
            return {
              content: [{
                type: "text",
                text: `Invalid arguments for validate_directories: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`
              }],
              isError: true,
              metadata: {}
            };
          } else if (error instanceof McpError) {
            return {
              content: [{
                type: "text",
                text: error.message
              }],
              isError: true,
              metadata: {}
            };
          } else {
            return {
              content: [{
                type: "text",
                text: `An unexpected error occurred during directory validation: ${error.message || String(error)}`
              }],
              isError: true,
              metadata: {}
            };
          }
        }
      }


      case "get_config": {
        const safeConfig = createSerializableConfig(this.config);

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

        default:
          throw new McpError(
            ErrorCode.InvalidRequest,
            // Use type assertion to handle potential undefined name, though schema should ensure it
            `Unknown tool: ${(toolParams as { name: string }).name}`
          );
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid arguments: ${err.errors.map(e => e.message).join(', ')}`
        );
      }
      throw err;
    }
  }

  private async cleanup(): Promise<void> {
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    
    // Set up cleanup handler
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
    
    await this.server.connect(transport);
    console.error("Windows CLI MCP Server running on stdio");
  }
}

// Start server
const main = async () => {
  try {
    const args = await parseArgs();
    
    // Handle --init-config flag
    if (args['init-config']) {
      try {
        createDefaultConfig(args['init-config'] as string);
        console.error(`Created default config at: ${args['init-config']}`);
        process.exit(0);
      } catch (error) {
        console.error('Failed to create config file:', error);
        process.exit(1);
      }
    }

    // Load configuration
    const config = loadConfig(args.config);
    
    const server = new CLIServer(config);
    await server.run();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}

export { CLIServer, main };
