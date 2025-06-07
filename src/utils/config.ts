import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig, ShellConfig } from '../types/config.js';
import { normalizeWindowsPath, normalizeAllowedPaths } from './validation.js';

const defaultValidatePathRegex = /^[a-zA-Z]:\\(?:[^<>:"/\\|?*]+\\)*[^<>:"/\\|?*]*$/;

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
      },
      wsl: {
        enabled: true,
        command: '../../scripts/wsl.sh',
        args: ['-e'],
        // Basic WSL path validation: starts with /mnt/<drive>/ or is a Linux-like absolute path.
        validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
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
    shells: {
      // Merge each shell config individually so unspecified options fall back to defaults
      powershell: {
        ...defaultConfig.shells.powershell,
        ...(userConfig.shells?.powershell || {})
      },
      cmd: {
        ...defaultConfig.shells.cmd,
        ...(userConfig.shells?.cmd || {})
      },
      gitbash: {
        ...defaultConfig.shells.gitbash,
        ...(userConfig.shells?.gitbash || {})
      },
      wsl: {
        ...defaultConfig.shells.wsl!, // Assert wsl is defined in default config
        ...(userConfig.shells?.wsl || {})
      }
    }
  };

  // Only add validatePath functions and blocked operators if they don't exist
  // Ensure that the key exists in defaultConfig.shells before trying to access its properties
  for (const [key, shell] of Object.entries(merged.shells) as [keyof typeof merged.shells, ShellConfig][]) {
    const defaultShellForKey = defaultConfig.shells[key];
    if (defaultShellForKey) { // Check if the shell actually exists in default config
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