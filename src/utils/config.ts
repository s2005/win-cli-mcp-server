import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig, ShellConfig } from '../types/config.js';
import { normalizeWindowsPath, normalizeAllowedPaths } from './validation.js';

const defaultValidatePathRegex = /^[a-zA-Z]:\\(?:[^<>:"/\\|?*]+\\)*[^<>:"/\\|?*]*$/;

export const DEFAULT_WSL_CONFIG: ShellConfig = {
  enabled: true,
  command: 'wsl.exe',
  args: ['-e'],
  // Basic WSL path validation: starts with /mnt/<drive>/ or is a Linux-like absolute path.
  validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
  blockedOperators: ['&', '|', ';', '`'],
  allowedPaths: [],
  wslMountPoint: '/mnt/',
  inheritGlobalPaths: true
};

export const DEFAULT_CONFIG: ServerConfig = {
  security: {
    maxCommandLength: 2000,
    blockedCommands: [
      'rm', 'del', 'rmdir', 'format',
      'shutdown', 'restart',
      'reg', 'regedit',
      'net', 'netsh',
      'takeown', 'icacls'
    ],
    blockedArguments: [
      "--exec", "-e", "/c", "-enc", "-encodedcommand",
      "-command", "--interactive", "-i", "--login", "--system"
    ],
    initialDir: undefined,
    allowedPaths: [
      os.homedir(),
      process.cwd()
    ],
    restrictWorkingDirectory: true,
    commandTimeout: 30,
    enableInjectionProtection: true
  },
  shells: {
    powershell: {
      enabled: true,
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command'],
      validatePath: (dir: string) => dir.match(defaultValidatePathRegex) !== null,
      blockedOperators: ['&', '|', ';', '`']
    },
    cmd: {
      enabled: true,
      command: 'cmd.exe',
      args: ['/c'],
      validatePath: (dir: string) => dir.match(defaultValidatePathRegex) !== null,
      blockedOperators: ['&', '|', ';', '`']
    },
    gitbash: {
      enabled: true,
      command: 'C:\\Program Files\\Git\\bin\\bash.exe',
      args: ['-c'],
      validatePath: (dir: string) => dir.match(defaultValidatePathRegex) !== null,
      blockedOperators: ['&', '|', ';', '`']
    }
  },
};

export function loadConfig(configPath?: string): ServerConfig {
  // If no config path provided, look in default locations
  const configLocations = [
    configPath,
    path.join(process.cwd(), 'config.json'),
    path.join(os.homedir(), '.win-cli-mcp', 'config.json')
  ].filter(Boolean);

  let loadedConfig: Partial<ServerConfig> = {};

  for (const location of configLocations) {
    if (!location) continue;
    
    try {
      if (fs.existsSync(location)) {
        const fileContent = fs.readFileSync(location, 'utf8');
        loadedConfig = JSON.parse(fileContent);
        break;
      }
    } catch (error) {
      console.error(`Error loading config from ${location}:`, error);
    }
  }

  // Use defaults only if no config was loaded
  const mergedConfig = Object.keys(loadedConfig).length > 0
    ? mergeConfigs(DEFAULT_CONFIG, loadedConfig)
    : DEFAULT_CONFIG;

  // Validate and process initialDir if provided
  if (mergedConfig.security.initialDir && typeof mergedConfig.security.initialDir === 'string') {
    const normalizedInitialDir = normalizeWindowsPath(mergedConfig.security.initialDir);
    if (fs.existsSync(normalizedInitialDir) && fs.statSync(normalizedInitialDir).isDirectory()) {
      mergedConfig.security.initialDir = normalizedInitialDir;
      if (mergedConfig.security.restrictWorkingDirectory) {
        if (!mergedConfig.security.allowedPaths.includes(normalizedInitialDir)) {
          mergedConfig.security.allowedPaths.push(normalizedInitialDir);
        }
        mergedConfig.security.allowedPaths = normalizeAllowedPaths(mergedConfig.security.allowedPaths);
      }
    } else {
      console.warn(`WARN: Configured initialDir '${mergedConfig.security.initialDir}' does not exist or is not a directory. Falling back to default CWD behavior.`);
      mergedConfig.security.initialDir = undefined;
    }
  } else if (mergedConfig.security.initialDir !== undefined) {
    console.warn(`WARN: Configured initialDir is not a valid string. Falling back to default CWD behavior.`);
    mergedConfig.security.initialDir = undefined;
  }

  // Normalize and dedupe allowedPaths
  mergedConfig.security.allowedPaths = normalizeAllowedPaths(mergedConfig.security.allowedPaths);


  // Validate the merged config
  validateConfig(mergedConfig);

  return mergedConfig;
}

function mergeConfigs(defaultConfig: ServerConfig, userConfig: Partial<ServerConfig>): ServerConfig {
  const merged: ServerConfig = {
    security: {
      // Start with defaults then override with any user supplied options
      ...defaultConfig.security,
      ...(userConfig.security || {})
    },
    shells: {}
  };

  // Remove deprecated includeDefaultWSL if present
  delete (merged.security as any).includeDefaultWSL;

  // Determine which shells should be included
  const shouldIncludePowerShell = userConfig.shells?.powershell !== undefined;
  const shouldIncludeCmd = userConfig.shells?.cmd !== undefined;
  const shouldIncludeGitBash = userConfig.shells?.gitbash !== undefined;
  const shouldIncludeWSL = userConfig.shells?.wsl !== undefined;

  if (shouldIncludePowerShell) {
    merged.shells.powershell = {
      ...defaultConfig.shells.powershell,
      ...(userConfig.shells?.powershell || {})
    } as ShellConfig;
  }

  if (shouldIncludeCmd) {
    merged.shells.cmd = {
      ...defaultConfig.shells.cmd,
      ...(userConfig.shells?.cmd || {})
    } as ShellConfig;
  }

  if (shouldIncludeGitBash) {
    merged.shells.gitbash = {
      ...defaultConfig.shells.gitbash,
      ...(userConfig.shells?.gitbash || {})
    } as ShellConfig;
  }

  if (shouldIncludeWSL) {
    merged.shells.wsl = {
      ...DEFAULT_WSL_CONFIG,
      ...(userConfig.shells?.wsl || {})
    } as ShellConfig;
  }

  // Only add validatePath functions and blocked operators if they don't exist
  for (const [key, shell] of Object.entries(merged.shells) as [keyof typeof merged.shells, ShellConfig][]) {
    // Get the appropriate default config
    let defaultShellForKey: ShellConfig | undefined;
    if (key === 'wsl') {
      defaultShellForKey = DEFAULT_WSL_CONFIG;
    } else if (key in defaultConfig.shells) {
      defaultShellForKey = defaultConfig.shells[key as keyof typeof defaultConfig.shells];
    }

    if (defaultShellForKey) {
      if (!shell.validatePath) {
        shell.validatePath = defaultShellForKey.validatePath;
      }
      if (!shell.blockedOperators) {
        shell.blockedOperators = defaultShellForKey.blockedOperators;
      }
    }
  }

  return merged;
}

function validateConfig(config: ServerConfig): void {
  // Validate security settings
  if (config.security.maxCommandLength < 1) {
    throw new Error('maxCommandLength must be positive');
  }

  // Validate shell configurations
  for (const [shellName, shell] of Object.entries(config.shells)) {
    if (shell.enabled && (!shell.command || !shell.args)) {
      throw new Error(`Invalid configuration for ${shellName}: missing command or args`);
    }
  }

  // Validate timeout (minimum 1 second)
  if (config.security.commandTimeout < 1) {
    throw new Error('commandTimeout must be at least 1 second');
  }
}

// Helper function to create a default config file
export function createDefaultConfig(configPath: string): void {
  const dirPath = path.dirname(configPath);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Create a JSON-safe version of the config (excluding functions)
  const configForSave = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  fs.writeFileSync(configPath, JSON.stringify(configForSave, null, 2));
}