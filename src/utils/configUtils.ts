import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

/**
 * Create a safe, serializable version of the configuration for external use
 */
export function createSerializableConfig(config: ServerConfig): any {
  const serializable: any = {
    security: {
      maxCommandLength: config.global.security.maxCommandLength,
      commandTimeout: config.global.security.commandTimeout,
      enableInjectionProtection: config.global.security.enableInjectionProtection,
      restrictWorkingDirectory: config.global.security.restrictWorkingDirectory,
      blockedCommands: [...config.global.restrictions.blockedCommands],
      blockedArguments: [...config.global.restrictions.blockedArguments],
      blockedOperators: [...config.global.restrictions.blockedOperators],
      allowedPaths: [...config.global.paths.allowedPaths]
    },
    shells: {}
  };

  // Add shell configurations
  for (const [shellName, shellConfig] of Object.entries(config.shells)) {
    if (!shellConfig) continue;

    const shellInfo: any = {
      enabled: shellConfig.enabled,
      command: shellConfig.executable.command,
      args: [...shellConfig.executable.args],
      blockedOperators: [
        ...(shellConfig.overrides?.restrictions?.blockedOperators || [])
      ]
    };

    serializable.shells[shellName] = shellInfo;
  }

  return serializable;
}

/**
 * Create a summary of resolved configuration for a specific shell
 */
export function createResolvedConfigSummary(
  shellName: string,
  resolved: ResolvedShellConfig
): any {
  return {
    shell: shellName,
    enabled: resolved.enabled,
    executable: {
      command: resolved.executable.command,
      args: [...resolved.executable.args]
    },
    effectiveSettings: {
      security: { ...resolved.security },
      restrictions: {
        blockedCommands: [...resolved.restrictions.blockedCommands],
        blockedArguments: [...resolved.restrictions.blockedArguments],
        blockedOperators: [...resolved.restrictions.blockedOperators]
      },
      paths: {
        allowedPaths: [...resolved.paths.allowedPaths],
        initialDir: resolved.paths.initialDir
      }
    },
    wslConfig: resolved.wslConfig ? {
      mountPoint: resolved.wslConfig.mountPoint,
      inheritGlobalPaths: resolved.wslConfig.inheritGlobalPaths
    } : undefined
  };
}

