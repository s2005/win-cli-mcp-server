import path from 'path';
import { ServerConfig, ShellConfig } from '../../src/types/config.js';
import {
  parseCommand,
  extractCommandName,
  validateShellOperators,
  normalizeWindowsPath,
  validateWorkingDirectory,
  isCommandBlocked,
  isArgumentBlocked
} from '../../src/utils/validation.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const validateCommandCallHistory: { command: string, workingDir: string }[] = [];
const MAX_VALIDATE_CMD_HISTORY_SIZE = 5;
const VALIDATE_CMD_RECURSION_THRESHOLD = 2;

export class MockCLIServer {
  constructor(public config: ServerConfig) {}

  private validateSingleCommand(shellConfig: ShellConfig, command: string): void {
    if (this.config.security.enableInjectionProtection) {
      validateShellOperators(command, shellConfig);
    }

    const { command: executable, args } = parseCommand(command);

    if (isCommandBlocked(executable, this.config.security.blockedCommands)) {
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

  validateCommand(shellKey: string | ShellConfig, command: string, workingDir: string): void {
    const normalizePathCallStack: Set<string> = new Set(); // Call stack for normalizeWindowsPath calls within this validateCommand execution
    // Debugging: Track call history for validateCommand
    const currentCall = { command, workingDir };
    validateCommandCallHistory.push(currentCall);
    if (validateCommandCallHistory.length > MAX_VALIDATE_CMD_HISTORY_SIZE) {
        validateCommandCallHistory.shift();
    }
    const occurrences = validateCommandCallHistory.filter(c => c.command === command && c.workingDir === workingDir).length;
    if (occurrences >= VALIDATE_CMD_RECURSION_THRESHOLD && validateCommandCallHistory.length >= VALIDATE_CMD_RECURSION_THRESHOLD) {
        const historyString = validateCommandCallHistory.map(c => `(cmd: '${c.command}', wd: '${c.workingDir}')`).join(" -> ");
        const historyCopy = [...validateCommandCallHistory];
        validateCommandCallHistory.length = 0; // Clear for next tests
        throw new Error(`MockCLIServer.validateCommand: Potential recursion detected. Call with (cmd: '${command}', wd: '${workingDir}') appeared ${occurrences} times in the last ${historyCopy.length} calls. History: [${historyString}]`);
    }

    const shellConfig: ShellConfig | undefined =
      typeof shellKey === 'string' ? this.config.shells[shellKey as keyof typeof this.config.shells] : shellKey;
    if (!shellConfig) {
      throw new Error(`Unknown shell: ${shellKey}`);
    }

    const steps = command.split(/\s*&&\s*/);
    let currentDir = normalizeWindowsPath(workingDir);

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(shellConfig, trimmed);

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        const cdArg = args[0];
           
        let pathForNormalization: string;

        // Check if cdArg is a Git Bash style absolute path (e.g., /c/foo)

        const gitBashMatch = cdArg.match(/^\/([a-zA-Z])(\/.*)?$/);
        const isWSLAbsolutePath = !gitBashMatch && cdArg.startsWith('/');
        const isWin32Absolute = path.win32.isAbsolute(cdArg);


        if (gitBashMatch) {
          // It's a Git Bash path (e.g., /c/foo), normalizeWindowsPath will handle its conversion
          pathForNormalization = cdArg; 

        } else if (isWSLAbsolutePath) {
          // It's a WSL absolute path (e.g., /mnt/c/foo or /home/user)
          // normalizeWindowsPath will handle it (preserving forward slashes)
          pathForNormalization = cdArg;

        } else if (path.win32.isAbsolute(cdArg)) {
          // It's a Windows absolute path (e.g., C:\foo)
          pathForNormalization = cdArg;

        } else {
          // It's a relative path
          if (cdArg === '..') {
            const normalizedCurrentDir = normalizeWindowsPath(currentDir); // Ensure currentDir is in a consistent format for checks
            const isWindowsRoot = /^[a-zA-Z]:\\$/.test(normalizedCurrentDir);
            const isWslRoot = normalizedCurrentDir === '/';
            const isUncRoot = /^\\\\[^\\\\]+\\[^\\\\]+$/.test(normalizedCurrentDir);

            if (isWindowsRoot || isWslRoot || isUncRoot) {
              pathForNormalization = normalizedCurrentDir; // Stay at root

            } else {
              // Not at a root, resolve '..' normally
              pathForNormalization = path.resolve(currentDir, cdArg);

            }
          } else {
            // Relative path, but not '..', resolve normally
            pathForNormalization = path.resolve(currentDir, cdArg);

          }
        }
        
        let target = normalizeWindowsPath(pathForNormalization);


        if (this.config.security.restrictWorkingDirectory) {
          validateWorkingDirectory(target, this.config.security.allowedPaths);
        }
        currentDir = target;
      }
    }
  }
}
