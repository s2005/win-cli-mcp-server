import { CLIServer } from '../../src/index';
import { DEFAULT_CONFIG } from '../../src/utils/config';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl.sh');

describe('WSL integration allowed paths', () => {
  const server = new CLIServer({
    ...DEFAULT_CONFIG,
    security: {
      ...DEFAULT_CONFIG.security,
      allowedPaths: ['C:\\mcp']
    },
    shells: {
      ...DEFAULT_CONFIG.shells,
      wsl: {
        ...DEFAULT_CONFIG.shells.wsl!,
        command: wslEmulatorPath,
        allowedPaths: ['/home/test'],
        inheritGlobalPaths: true
      },
      powershell: { ...DEFAULT_CONFIG.shells.powershell, enabled: false },
      cmd: { ...DEFAULT_CONFIG.shells.cmd, enabled: false },
      gitbash: { ...DEFAULT_CONFIG.shells.gitbash, enabled: false }
    }
  });

  test('executes within allowed wsl path', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'wsl', command: 'pwd', workingDir: '/home/test' }
    }) as CallToolResult;
    expect(result.isError).toBe(false);
  });
});
