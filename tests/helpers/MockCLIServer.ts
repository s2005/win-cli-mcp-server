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
    const shellConfig: ShellConfig =
      typeof shellKey === 'string' ? this.config.shells[shellKey as keyof typeof this.config.shells] : shellKey;
    if (!shellConfig) {
      throw new Error(`Unknown shell: ${shellKey}`);
    }

    const steps = command.split(/\s*&&\s*/);
    let currentDir = workingDir;

    for (const step of steps) {
      const trimmed = step.trim();
      if (!trimmed) continue;

      this.validateSingleCommand(shellConfig, trimmed);

      const { command: executable, args } = parseCommand(trimmed);
      if ((executable.toLowerCase() === 'cd' || executable.toLowerCase() === 'chdir') && args.length) {
        let target = normalizeWindowsPath(args[0]);
        if (!path.isAbsolute(target)) {
          target = normalizeWindowsPath(path.resolve(currentDir, target));
        }
        if (this.config.security.restrictWorkingDirectory) {
          validateWorkingDirectory(target, this.config.security.allowedPaths);
        }
        currentDir = target;
      }
    }
  }
}
