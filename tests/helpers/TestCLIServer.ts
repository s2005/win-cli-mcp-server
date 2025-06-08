import path from 'path';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG, DEFAULT_WSL_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

export class TestCLIServer {
  private server: CLIServer;

  constructor(overrides: Partial<ServerConfig> = {}) {
    const baseConfig: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // Configure wsl shell to use the local emulator script
    const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl.sh');
    const wslShell = {
      ...DEFAULT_WSL_CONFIG,
      command: 'bash',
      args: [wslEmulatorPath, '-e']
    };
    baseConfig.shells = { ...baseConfig.shells, wsl: wslShell };

    // Disable other shells by default for cross platform reliability
    baseConfig.shells.powershell.enabled = false;
    baseConfig.shells.cmd.enabled = false;
    baseConfig.shells.gitbash.enabled = false;

    // Allow -e argument for the emulator
    baseConfig.security.blockedArguments = baseConfig.security.blockedArguments.filter(a => a !== '-e');

    // Merge overrides
    const config: ServerConfig = {
      ...baseConfig,
      security: { ...baseConfig.security, ...(overrides.security || {}) },
      shells: { ...baseConfig.shells, ...(overrides.shells || {}) }
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
