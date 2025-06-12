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
  convertWindowsToWslPath,
  isPathAllowed
} from './utils/validation.js';
import { createValidationContext } from './utils/validationContext.js';
import { validateWorkingDirectory, normalizePathForShell } from './utils/pathValidation.js';
import { validateDirectoriesAndThrow } from './utils/directoryValidator.js';
import { spawn } from 'child_process';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';
import { buildToolDescription } from './utils/toolDescription.js';
import { loadConfig, createDefaultConfig, getResolvedShellConfig } from './utils/config.js';
import { createSerializableConfig } from './utils/configUtils.js';
import type { ServerConfig, BaseShellConfig } from './types/config.js';
import type { ValidationContext } from './utils/validationContext.js';
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
});


class CLIServer {
  private server: Server;
  private allowedPaths: Set<string>;
  private blockedCommands: Set<string>;
  private serverActiveCwd: string | undefined;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = new Server({
      name: "windows-cli-server",
      version: packageJson.version,
    }, {
      capabilities: {
        tools: {},
        resources: {}  // Add resources capability
      }
    });

    // Initialize from config
    this.allowedPaths = new Set(config.global.paths.allowedPaths);
    this.blockedCommands = new Set(config.global.restrictions.blockedCommands);

    let candidateCwd: string | undefined = undefined;
    let chdirFailed = false;
    const startupMessages: string[] = [];

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

    if (!candidateCwd || chdirFailed) {
      candidateCwd = process.cwd().replace(/\\/g, '/');
      if (chdirFailed) {
        startupMessages.push(`INFO: Current working directory remains: ${candidateCwd}`);
      }
    }

    const restrictCwd = this.config.global.security.restrictWorkingDirectory;
    const allowedPathsDefined = this.config.global.paths.allowedPaths && this.config.global.paths.allowedPaths.length > 0;
    const normalizedAllowedPathsFromConfig = this.config.global.paths.allowedPaths.map((p: string) => p.replace(/\\/g, '/'));

    if (restrictCwd && allowedPathsDefined) {
      const isCandidateCwdAllowed = isPathAllowed(candidateCwd!, normalizedAllowedPathsFromConfig);
      if (!isCandidateCwdAllowed) {
        this.serverActiveCwd = undefined;
        startupMessages.push(`INFO: Server's effective starting directory: ${candidateCwd}`);
        startupMessages.push("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.");
        startupMessages.push("INFO: The server's active working directory is currently NOT SET.");
        startupMessages.push("INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.");
        startupMessages.push(`INFO: Configured allowed paths are: ${normalizedAllowedPathsFromConfig.join(', ')}`);
      } else {
        this.serverActiveCwd = candidateCwd;
        startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
      }
    } else {
      this.serverActiveCwd = candidateCwd;
      startupMessages.push(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
    }

    startupMessages.forEach(msg => console.error(msg));

    this.setupHandlers();
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
    let currentDir = workingDir;

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(context, trimmed);

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        // Handle path format according to shell type
        let target;
        if (context.isWslShell) {
          // WSL paths should remain as-is
          target = args[0];
          if (!path.posix.isAbsolute(target)) {
            target = path.posix.resolve(currentDir, target);
          }
        } else {
          // Windows or mixed format paths
          target = normalizePathForShell(args[0], context);
          if (!path.isAbsolute(target)) {
            target = normalizePathForShell(path.resolve(currentDir, target), context);
          }
        }
        
        if (context.shellConfig.security.restrictWorkingDirectory) {
          validateWorkingDirectory(target, context);
        }
        currentDir = target;
      }
    }
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
          // parse args with allowed shells
          const args = z.object({
            shell: z.enum(Object.keys(this.config.shells).filter(shell =>
              this.config.shells[shell as keyof typeof this.config.shells]!.enabled
            ) as [string, ...string[]]),
            command: z.string(),
            workingDir: z.string().optional()
          }).parse(toolParams.arguments);

          // Determine working directory
          let workingDir: string;
          if (args.workingDir) {
            // Preserve WSL paths; normalize others
            if (args.shell === 'wsl') {
              workingDir = args.workingDir;
            } else {
              // For non-WSL shells, normalize the path for the appropriate shell
              const shellConfig = this.config.shells[args.shell as keyof typeof this.config.shells];
              const shellValidationContext = createValidationContext(args.shell, shellConfig as any);
              workingDir = normalizePathForShell(args.workingDir, shellValidationContext);
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
              } as CallToolResult;
            }
            workingDir = this.serverActiveCwd;
          }

          const shellKey = args.shell as keyof typeof this.config.shells;
          const shellConfig = this.config.shells[shellKey as keyof typeof this.config.shells];
          if (!shellConfig || !shellConfig.enabled) {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Shell '${shellKey}' is not configured or enabled`
            );
          }

          // Create validation context with properly resolved shell config
          const resolvedConfig = getResolvedShellConfig(this.config, shellKey);
          if (!resolvedConfig) {
            throw new McpError(ErrorCode.InvalidRequest, `Shell '${shellKey}' configuration could not be resolved`);
          }
          const validationContext = createValidationContext(shellKey, resolvedConfig);

          // Validate working directory with context
          if (args.workingDir) {
            try {
              validateWorkingDirectory(args.workingDir, validationContext);
            } catch (error: any) {
              const detailMessage = error && typeof error.message === 'string' ? error.message : String(error);
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Working directory (${args.workingDir}) validation failed: ${detailMessage}. Use validate_directories tool to check allowed paths.`
              );
            }
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

          // Determine CWD for spawn based on shell type
          let effectiveSpawnCwd = workingDir;
          
          // For WSL, we need special handling
          if (validationContext.isWslShell) {
            // The wsl.sh emulator runs on Linux. For WSL commands, we'll run the script
            // in the project root and let the emulator handle setting the correct path
            effectiveSpawnCwd = process.cwd();
          } 
          // For GitBash, ensure Windows-style paths for Node.js spawn
          else if (validationContext.shellName === 'gitbash' && workingDir.startsWith('/')) {
            // Convert GitBash-style path to Windows path for spawn
            effectiveSpawnCwd = normalizePathForShell(workingDir, validationContext);
          }

          // Execute command
          return new Promise((resolve, reject) => {
            let shellProcess: ReturnType<typeof spawn>;
            let spawnArgs: string[];

            // Get shell executable config
            const shellConfig = this.config.shells[shellKey as keyof typeof this.config.shells]!.executable;
            
            if (shellKey === 'wsl') {
              const parsedWslCommand = parseCommand(args.command);
              spawnArgs = [...shellConfig.args, parsedWslCommand.command, ...parsedWslCommand.args];
            } else {
              spawnArgs = [...shellConfig.args, args.command];
            }

            try {
              shellProcess = spawn(
                shellConfig.command,
                spawnArgs, // Use the conditionally prepared spawnArgs
                { cwd: effectiveSpawnCwd, stdio: ['pipe', 'pipe', 'pipe'] }
              );
            } catch (err) {
              throw new McpError(
                ErrorCode.InternalError,
                `Failed to start shell process: ${err instanceof Error ? err.message : String(err)}. Consult the server admin for configuration changes (config.json - shells).`
              );
            }

            if (!shellProcess.stdout || !shellProcess.stderr) {
              throw new McpError(
                ErrorCode.InternalError,
                'Failed to initialize shell process streams'
              );
            }

            let output = '';
            let error = '';

            shellProcess.stdout.on('data', (data) => {
              output += data.toString();
            });

            shellProcess.stderr.on('data', (data) => {
              error += data.toString();
            });

            shellProcess.on('close', (code) => {
              // Prepare detailed result message
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
                if (!error && !output) {
                  resultMessage += 'No error message or output was provided';
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
                  shell: args.shell,
                  workingDirectory: workingDir
                }
              });
            });

            // Handle process errors (e.g., shell crashes)
            shellProcess.on('error', (err) => {
              clearTimeout(timeout); // Clear the timeout
              const errorMessage = `Shell process error: ${err.message}`;
              reject(new McpError(
                ErrorCode.InternalError,
                errorMessage
              ));
            });

            // Set configurable timeout to prevent hanging
            const timeout = setTimeout(() => {
              shellProcess.kill();
              const timeoutMessage = `Command execution timed out after ${this.config.global.security.commandTimeout} seconds. Consult the server admin for configuration changes (config.json - commandTimeout).`;
              reject(new McpError(
                ErrorCode.InternalError,
                timeoutMessage
              ));
            }, this.config.global.security.commandTimeout * 1000);

            shellProcess.on('close', () => clearTimeout(timeout));
          });
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
              // Create a generic Windows validation context for directory validation
              const shellKey = 'cmd';
              const resolvedConfig = getResolvedShellConfig(this.config, shellKey);
              if (!resolvedConfig) {
                throw new McpError(ErrorCode.InvalidRequest, 'Failed to resolve shell configuration');
              }
              const validationContext = createValidationContext(shellKey, resolvedConfig);
              validateWorkingDirectory(newDir, validationContext);
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
            const parsedValDirArgs = ValidateDirectoriesArgsSchema.parse(toolParams.arguments);
            const allowedPathsArray = this.config.global.paths.allowedPaths ?? [];
            validateDirectoriesAndThrow(parsedValDirArgs.directories, allowedPathsArray);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ message: "All specified directories are valid and within allowed paths." })
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
        // Create a structured copy of config for external use
        const safeConfig = this.getSafeConfig();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(safeConfig, null, 2)
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
