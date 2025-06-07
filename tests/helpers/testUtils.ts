import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

/**
 * Build a ServerConfig for testing by applying partial overrides to the
 * project's DEFAULT_CONFIG. This helps keep test setups concise.
 */
export function buildTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    security: { ...DEFAULT_CONFIG.security, ...(overrides.security || {}) },
    shells: {
      powershell: { ...DEFAULT_CONFIG.shells.powershell, ...(overrides.shells?.powershell || {}) },
      cmd: { ...DEFAULT_CONFIG.shells.cmd, ...(overrides.shells?.cmd || {}) },
      gitbash: { ...DEFAULT_CONFIG.shells.gitbash, ...(overrides.shells?.gitbash || {}) },
      wsl: { ...DEFAULT_CONFIG.shells.wsl!, ...(overrides.shells?.wsl || {}) }
    }
  };
}
