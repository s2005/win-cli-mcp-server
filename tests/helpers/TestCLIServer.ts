import path from 'path';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

export class TestCLIServer {
  private server: CLIServer;

  constructor(overrides: Partial<ServerConfig> = {}) {
    const baseConfig: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Configure wsl shell to use the local emulator script
    const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');
    const wslShell = {
      enabled: true,
      executable: {
        command: 'node',
        args: [wslEmulatorPath, '-e']
      },
      overrides: {
        restrictions: {
          blockedOperators: ['&', '|', ';', '`']
        }
      },
      wslConfig: {
        mountPoint: '/mnt/',
        inheritGlobalPaths: true,
        pathMapping: {
          enabled: true,
          windowsToWsl: true
        }
      }
    };
    
    // Set up shells configuration
    if (baseConfig.shells) {
      // Disable other shells by default for cross platform reliability
      if (baseConfig.shells.powershell) baseConfig.shells.powershell.enabled = false;
      if (baseConfig.shells.cmd) baseConfig.shells.cmd.enabled = false;
      if (baseConfig.shells.gitbash) baseConfig.shells.gitbash.enabled = false;
      
      // Add WSL shell
      baseConfig.shells.wsl = wslShell;
    }

    // Allow -e argument for the emulator
    if (baseConfig.global && baseConfig.global.restrictions) {
      baseConfig.global.restrictions.blockedArguments = 
        (baseConfig.global.restrictions.blockedArguments || []).filter(a => a !== '-e');
    }

    // Merge overrides deeply
    const config: ServerConfig = {
      ...baseConfig,
      global: {
        ...baseConfig.global,
        ...(overrides.global || {}),
        security: {
          ...(baseConfig.global?.security || {}),
          ...(overrides.global?.security || {})
        },
        paths: {
          ...(baseConfig.global?.paths || {}),
          ...(overrides.global?.paths || {})
        },
        restrictions: {
          ...(baseConfig.global?.restrictions || {}),
          ...(overrides.global?.restrictions || {})
        }
      },
      shells: {
        ...baseConfig.shells,
        ...(overrides.shells || {}),
        wsl: overrides.shells?.wsl ? { ...wslShell, ...overrides.shells.wsl } : wslShell
      }
    } as ServerConfig;

    this.server = new CLIServer(config);
  }

  async executeCommand(options: { shell: keyof ServerConfig['shells']; command: string; workingDir?: string; }) {
    const result = await this.server._executeTool({
      name: 'execute_command',
      arguments: {
        shell: options.shell as string,
        command: options.command,
        workingDir: options.workingDir
      }
    });

    const output = result.content[0]?.text ?? '';
    const exitCode = (result.metadata as any)?.exitCode ?? -1;
    const workingDirectory = (result.metadata as any)?.workingDirectory;

    return { ...result, output, exitCode, workingDirectory };
  }

  async callTool(name: string, args: Record<string, any>) {
    return this.server._executeTool({ name, arguments: args });
  }
}
