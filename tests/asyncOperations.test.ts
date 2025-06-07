import { describe, test, expect, beforeEach } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';
import path from 'path';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl.sh');

describe('Async Command Execution', () => {
  let server: CLIServer;
  let config: ServerConfig;

  beforeEach(() => {
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.shells.wsl = {
      enabled: true,
      command: 'bash', // Use bash to execute the script
      args: [wslEmulatorPath, '-e'], // Pass script path as first arg to bash
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      blockedOperators: ['&', '|', ';', '`']
    };
    config.shells.powershell.enabled = false;
    config.shells.cmd.enabled = false;
    config.shells.gitbash.enabled = false;
    config.security.restrictWorkingDirectory = false;
    // Allow -e argument for wsl emulator
    config.security.blockedArguments = config.security.blockedArguments.filter(arg => arg !== '-e');
    server = new CLIServer(config);
  });

  test('should handle concurrent command executions', async () => {
    const commands = ['echo first', 'echo second', 'echo third'];
    const promises = commands.map(cmd =>
      server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: cmd }
      }) as Promise<CallToolResult>
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(commands.length);
    results.forEach((result, idx) => {
      expect(result.isError).toBe(false);
      const expected = commands[idx].split(' ')[1];
      expect(result.content[0].text).toContain(expected);
    });
  });

  test('should queue commands when limit reached', async () => {
    const limit = 1;
    let active = 0;
    let maxActive = 0;
    const queue: Array<() => void> = [];

    const runWithLimit = async (cmd: string) => {
      if (active >= limit) {
        await new Promise<void>(resolve => queue.push(resolve));
      }
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'wsl', command: cmd }
        }) as CallToolResult;
      } finally {
        active--;
        const next = queue.shift();
        if (next) next();
      }
    };

    const commands = ['echo one', 'echo two', 'echo three'];
    const results = await Promise.all(commands.map(c => runWithLimit(c)));

    expect(maxActive).toBeLessThanOrEqual(limit);
    results.forEach((result, idx) => {
      expect(result.isError).toBe(false);
      const expected = commands[idx].split(' ')[1];
      expect(result.content[0].text).toContain(expected);
    });
  });

  test('should handle concurrent errors independently', async () => {
    const cmds = [
      'echo good',
      'exit 42'
    ];

    const promises = cmds.map(cmd =>
      server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: cmd }
      }) as Promise<CallToolResult>
    );

    const results = await Promise.all(promises);

    expect(results[0].isError).toBe(false);
    expect(results[0].content[0].text).toContain('good');

    expect(results[1].isError).toBe(true);
    expect((results[1].metadata as any)?.exitCode).toBe(42);
  });
});
