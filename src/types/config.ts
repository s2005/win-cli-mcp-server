export interface SecurityConfig {
  maxCommandLength: number;
  blockedCommands: string[];
  blockedArguments: string[];
  allowedPaths: string[];
  restrictWorkingDirectory: boolean;
  commandTimeout: number;
  enableInjectionProtection: boolean;
}

export interface ShellConfig {
  enabled: boolean;
  command: string;
  args: string[];
  validatePath?: (dir: string) => boolean;
  blockedOperators?: string[]; // Added for shell-specific operator restrictions
  // WSL specific options
  allowedPaths?: string[];      // Allowed paths exclusively for this shell
  wslMountPoint?: string;       // Windows drive mount point, default '/mnt/'
  inheritGlobalPaths?: boolean; // Convert global allowedPaths to WSL format
}

export interface ServerConfig {
  security: SecurityConfig;
  shells: {
    powershell: ShellConfig;
    cmd: ShellConfig;
    gitbash: ShellConfig;
    wsl?: ShellConfig;
  };
}