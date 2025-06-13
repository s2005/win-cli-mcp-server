import { ServerConfig, BaseShellConfig } from '../types/config.js';
import { getResolvedShellConfig } from './config.js';

/**
 * Creates a structured copy of the configuration for external use
 * @param config The server configuration
 * @returns A serializable version of the configuration
 */
export function createSerializableConfig(config: ServerConfig): any {
  // Handle potentially malformed or old format configs
  const global = config.global || {};
  const security = global.security || {};
  const restrictions = global.restrictions || {};
  const paths = global.paths || {};
  
  return {
    security: {
      // Security config is now under global.security
      maxCommandLength: security.maxCommandLength,
      commandTimeout: security.commandTimeout,
      enableInjectionProtection: security.enableInjectionProtection,
      restrictWorkingDirectory: security.restrictWorkingDirectory,
      
      // Restrictions config is now under global.restrictions
      blockedCommands: [...(restrictions.blockedCommands || [])],
      blockedArguments: [...(restrictions.blockedArguments || [])],
      
      // Paths config is now under global.paths
      allowedPaths: [...(paths.allowedPaths || [])],
    },
    shells: Object.entries(config.shells).reduce((acc, [key, shell]) => {
      if (shell) {
        // Get the resolved shell config which has merged global and shell-specific settings
        const resolvedConfig = getResolvedShellConfig(config, key as keyof ServerConfig['shells']);
        
        acc[key] = {
          enabled: shell.enabled,
          // Shell command/args are now in the executable property
          command: shell.executable?.command,
          args: shell.executable?.args ? [...shell.executable.args] : [],
          // blockedOperators are now in the resolved restrictions after applying overrides
          blockedOperators: resolvedConfig?.restrictions?.blockedOperators ? [...resolvedConfig.restrictions.blockedOperators] : []
        };
      }
      return acc;
    }, {} as Record<string, any>)
  };
}
