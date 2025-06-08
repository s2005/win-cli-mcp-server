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
  normalizeWindowsPath,
  isPathAllowed, // Added import
  validateWorkingDirectory,
  validateWslWorkingDirectory,
  convertWindowsToWslPath
} from './utils/validation.js';
import { validateDirectoriesAndThrow } from './utils/directoryValidator.js';
import { spawn } from 'child_process';
import { z } from 'zod';
import { readFileSync } from 'fs';
import path from 'path';
import { buildToolDescription } from './utils/toolDescription.js';
import { loadConfig, createDefaultConfig } from './utils/config.js';
import { createSerializableConfig } from './utils/configUtils.js';
import type { ServerConfig, ShellConfig } from './types/config.js'; // Added ShellConfig
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
  private config: ServerConfig;
  private serverActiveCwd: string | undefined; // New private member

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
    this.allowedPaths = new Set(config.security.allowedPaths);
    this.blockedCommands = new Set(config.security.blockedCommands);

    // Initialize serverActiveCwd
    const launchDir = process.cwd();
    const normalizedLaunchDir = normalizeWindowsPath(launchDir);

    const restrictCwd = this.config.security.restrictWorkingDirectory;
    // Ensure allowedPaths is treated as an array, even if undefined in config
    const currentAllowedPaths = this.config.security.allowedPaths || [];
    const allowedPathsDefined = currentAllowedPaths.length > 0;

    if (restrictCwd && allowedPathsDefined) {
      const isLaunchDirAllowed = isPathAllowed(normalizedLaunchDir, currentAllowedPaths);
      if (!isLaunchDirAllowed) {
        this.serverActiveCwd = undefined;
        console.error(`INFO: Server started in directory: ${launchDir}.`);
        console.error("INFO: 'restrictWorkingDirectory' is enabled, and this directory is not in the configured 'allowedPaths'.");
        console.error("INFO: The server's active working directory is currently NOT SET.");
        console.error("INFO: To run commands that don't specify a 'workingDir', you must first set a valid working directory using the 'set_current_directory' tool.");
        console.error(`INFO: Configured allowed paths are: ${currentAllowedPaths.map(p => normalizeWindowsPath(p)).join(', ')}.`);
      } else {
        this.serverActiveCwd = normalizedLaunchDir;
        console.error(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
      }
    } else {
      this.serverActiveCwd = normalizedLaunchDir;
      console.error(`INFO: Server's active working directory initialized to: ${this.serverActiveCwd}.`);
    }

    this.setupHandlers();
  }

  private validateSingleCommand(shellConfig: ShellConfig, command: string): void { // Takes ShellConfig directly
    if (this.config.security.enableInjectionProtection) {
      // const shellConfig = this.config.shells[shell]; // No longer needed
      validateShellOperators(command, shellConfig); // Use passed shellConfig
    }

    const { command: executable, args } = parseCommand(command);

    if (isCommandBlocked(executable, Array.from(this.blockedCommands))) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command is blocked: "${extractCommandName(executable)}"`
      );
    }

    if (isArgumentBlocked(args, this.config.security.blockedArguments)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'One or more arguments are blocked. Check configuration for blocked patterns.'
      );
    }

    if (command.length > this.config.security.maxCommandLength) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Command exceeds maximum length of ${this.config.security.maxCommandLength}`
      );
    }
  }

  private validateCommand(shellConfig: ShellConfig, command: string, workingDir: string): void { // Takes ShellConfig
    const steps = command.split(/\s*&&\s*/);
    let currentDir = workingDir;

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(shellConfig, trimmed); // Pass shellConfig

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        let target = normalizeWindowsPath(args[0]);
        if (!path.isAbsolute(target)) {
          target = normalizeWindowsPath(path.resolve(currentDir, target));
        }
        if (this.config.security.restrictWorkingDirectory) {
          validateWorkingDirectory(target, Array.from(this.allowedPaths));
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
      let executeCommandDescription = descriptionLines.join("\n");
      executeCommandDescription += "\nIf the 'workingDir' parameter is omitted, the command will execute in the server's active working directory.";
      executeCommandDescription += "\nNote: If the server's active working directory is not set (e.g., due to starting in a restricted, non-allowed directory), this tool will return an error if 'workingDir' is omitted. Use 'set_current_directory' to establish an active working directory first.";

      console.error(`[tool: execute_command] Description:\n${executeCommandDescription}`);
      const tools = [
        {
          name: "execute_command",
          description: executeCommandDescription,
          inputSchema: {
            type: "object",
            properties: {
              shell: { type: "string", enum: allowedShells, description: "Shell to use for command execution" },
              command: { type: "string", description: "Command to execute" },
              workingDir: { type: "string", description: "Working directory (optional). If omitted, uses the server's active working directory." }
            },
            required: ["shell", "command"]
          }
        },
        {
          name: "get_current_directory",
          description: "Get the server's active working directory. Returns a specific message if the active working directory has not yet been set (e.g., if the server started in a directory not listed in 'allowedPaths' while 'restrictWorkingDirectory' is active).",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "set_current_directory",
          description: "Set or change the server's active working directory. This is crucial if the server starts in a state where the active working directory is initially unset due to security restrictions (e.g. started in a non-allowed directory when 'restrictWorkingDirectory' is true).",
          inputSchema: { 
            type: "object", 
            properties: { 
              path: { type: "string", description: "Path to set as the server's active working directory" }
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
          let originalWorkingDirForError: string | undefined = args.workingDir;

          if (args.workingDir) {
            workingDir = normalizeWindowsPath(args.workingDir);
          } else {
            if (this.serverActiveCwd === undefined) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "Error: Server's active working directory is not set. Please use the 'set_current_directory' tool to establish a valid working directory before running commands without an explicit 'workingDir'."
              );
            }
            workingDir = this.serverActiveCwd;
            originalWorkingDirForError = this.serverActiveCwd; // For error messages, use the active CWD
          }

          const shellKey = args.shell as keyof typeof this.config.shells;
          const shellConfig = this.config.shells[shellKey]!; // Assert non-null: shellKey from enum of enabled shells

          if (this.config.security.restrictWorkingDirectory) {
            try {
              // Use the normalized path for validation
              // Ensure this.config.security.allowedPaths is used, falling back to an empty array if undefined
              const currentAllowedPaths = this.config.security.allowedPaths || [];
              validateWorkingDirectory(workingDir, currentAllowedPaths);
            } catch (error: any) { // Make error 'any' to access error.message
              // Use originalWorkingDirForError which reflects the user's input or the server's active CWD
              let displayWorkingDir = originalWorkingDirForError || "undefined (not set)";
                // Include the caught error's message for diagnostics
                const detailMessage = error && typeof error.message === 'string' ? error.message : String(error);
              throw new McpError(
                ErrorCode.InvalidRequest,
                  `Working directory (${displayWorkingDir}) outside allowed paths. Original error: ${detailMessage}. Use validate_directories tool to validate directories before execution.`
              );
            }
          }

          // Validate command (including chained operations)
          this.validateCommand(shellConfig, args.command, workingDir); // Pass shellConfig (already resolved)

          // Determine CWD for spawn: For WSL emulator, use a valid Linux path.
          let effectiveSpawnCwd = workingDir; // Already normalized if from args.workingDir or serverActiveCwd
          if (shellKey === 'wsl') {
            // The wsl.sh emulator runs on Linux. Its CWD must be a valid Linux path.
            // The conceptual WSL CWD (args.workingDir or converted serverActiveCwd) needs validation.

            let pathForWslValidation: string;
            if (args.workingDir) { // User explicitly provided a workingDir for WSL
              // Assume it's a WSL-style path. Normalize it for consistency.
              pathForWslValidation = path.posix.normalize(args.workingDir);
            // Consistent trailing slash removal (unless root)
            if (pathForWslValidation !== '/' && pathForWslValidation.endsWith('/')) {
              pathForWslValidation = pathForWslValidation.slice(0, -1);
            }
          } else { // No workingDir provided by user, use serverActiveCwd (which must be defined here)
            // serverActiveCwd is a Windows-style path. Convert it for WSL validation.
            try {
              // this.serverActiveCwd would have been validated if restrictWorkingDirectory is on,
              // or it's the launch CWD.
              pathForWslValidation = convertWindowsToWslPath(this.serverActiveCwd!, shellConfig.wslMountPoint || '/mnt/');
            } catch (error: any) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Failed to convert server's active working directory (${this.serverActiveCwd}) to WSL path for validation: ${error.message}`
              );
            }
          }

          if (this.config.security.restrictWorkingDirectory) {
            try {
              // Validate this conceptual WSL working directory.
              // Ensure this.config.security.allowedPaths is used, falling back to an empty array if undefined
              const currentAllowedPaths = this.config.security.allowedPaths || [];
              validateWslWorkingDirectory(pathForWslValidation, shellConfig, currentAllowedPaths);
            } catch (error: any) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `WSL working directory validation failed: ${error.message}. Use validate_directories tool to check allowed paths.`
              );
            }
          }

          // For the wsl.sh SCRIPT itself, it runs in the project root on the host.
          // The wsl.sh script is responsible for setting the correct CWD *inside* WSL if needed.
            effectiveSpawnCwd = process.cwd(); // e.g., /app
          }

          // Execute command
          return new Promise((resolve, reject) => {
            let shellProcess: ReturnType<typeof spawn>;
            let spawnArgs: string[];

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
              const timeoutMessage = `Command execution timed out after ${this.config.security.commandTimeout} seconds. Consult the server admin for configuration changes (config.json - commandTimeout).`;
              reject(new McpError(
                ErrorCode.InternalError,
                timeoutMessage
              ));
            }, this.config.security.commandTimeout * 1000);

            shellProcess.on('close', () => clearTimeout(timeout));
          });
        }

        case "get_current_directory": {
          if (this.serverActiveCwd === undefined) {
            return {
              content: [{
                type: "text",
                text: "The server's active working directory is not currently set. Use 'set_current_directory' to set it."
              }],
              isError: false, // Not an error, but an informational message
              metadata: {}
            };
          } else {
            return {
              content: [{
                type: "text",
                text: this.serverActiveCwd
              }],
              isError: false,
              metadata: {}
            };
          }
        }

        case "set_current_directory": {
          const args = z.object({
            path: z.string()
          }).parse(toolParams.arguments);

          const newNormalizedDir = normalizeWindowsPath(args.path);
          const previousActiveCwd = this.serverActiveCwd; // For metadata

          try {
            if (this.config.security.restrictWorkingDirectory) {
              // Ensure this.config.security.allowedPaths is used, falling back to an empty array if undefined
              const currentAllowedPaths = this.config.security.allowedPaths || [];
              validateWorkingDirectory(newNormalizedDir, currentAllowedPaths);
            }

            // Change Node.js process CWD
            process.chdir(newNormalizedDir);

            // Update server's active CWD
            this.serverActiveCwd = newNormalizedDir;

            return {
              content: [{
                type: "text",
                text: `Server's active working directory changed to: ${this.serverActiveCwd}`
              }],
              isError: false,
              metadata: {
                previousActiveDirectory: previousActiveCwd, // Store original user-provided path
                newActiveDirectory: this.serverActiveCwd
              }
            };
          } catch (error) {
            // If chdir or validation fails, serverActiveCwd should remain unchanged.
            return {
              content: [{
                type: "text",
                text: `Failed to set current directory: ${error instanceof Error ? error.message : String(error)}`
              }],
              isError: true,
              metadata: {
                requestedDirectory: args.path,
                normalizedRequestedDirectory: newNormalizedDir,
                activeDirectoryBeforeAttempt: previousActiveCwd
              }
            };
          }
        }

      case "validate_directories": {
          if (!this.config.security.restrictWorkingDirectory) {
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
            const allowedPathsArray = this.config.security.allowedPaths ?? [];
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
