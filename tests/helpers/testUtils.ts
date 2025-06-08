import { DEFAULT_CONFIG, DEFAULT_WSL_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig, ShellConfig } from '../../src/types/config.js';

/**
 * Build a ServerConfig for testing by applying partial overrides to the
 * project's DEFAULT_CONFIG. This helps keep test setups concise.
 */
export function buildTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  
  function mergeShellConfig(defaultShell: ShellConfig, overrideShell?: Partial<ShellConfig>): ShellConfig {
    const o = overrideShell || {};
    return {
      ...defaultShell, // Spread default first
      ...o,            // Spread override (Partial<ShellConfig>)
      // Explicitly re-apply defaults for required fields if override provided 'undefined' for them,
      // or if the override didn't specify them at all.
      enabled: o.enabled !== undefined ? o.enabled : defaultShell.enabled,
      command: o.command !== undefined ? o.command : defaultShell.command,
      args: o.args !== undefined ? o.args : defaultShell.args,
    };
  }

  return {
    security: {
      ...DEFAULT_CONFIG.security,
      ...(overrides.security || {}),
    },
    shells: {
      powershell: mergeShellConfig(DEFAULT_CONFIG.shells.powershell, overrides.shells?.powershell),
      cmd: mergeShellConfig(DEFAULT_CONFIG.shells.cmd, overrides.shells?.cmd),
      gitbash: mergeShellConfig(DEFAULT_CONFIG.shells.gitbash, overrides.shells?.gitbash),
      ...(overrides.shells?.wsl ? {
        wsl: mergeShellConfig(DEFAULT_WSL_CONFIG, overrides.shells?.wsl)
      } : {})
    },
  };
}
