export interface SecurityConfig {
  maxCommandLength: number;
  blockedCommands: string[];
  blockedArguments: string[];
  allowedPaths: string[];
  restrictWorkingDirectory: boolean;
  commandTimeout: number;
  enableInjectionProtection: boolean;
  initialDir?: string;
  includeDefaultWSL?: boolean;
}

export interface ShellConfig {
  enabled: boolean;
  command: string;
  args: string[];
  validatePath?: (dir: string) => boolean;
  blockedOperators?: string[]; // Added for shell-specific operator restrictions
  allowedPaths?: string[];
  wslMountPoint?: string;
  inheritGlobalPaths?: boolean;
}

export interface ServerConfig {
  security: SecurityConfig;
  shells: {
    powershell?: ShellConfig;
    cmd?: ShellConfig;
    gitbash?: ShellConfig;
    wsl?: ShellConfig;
  };
}