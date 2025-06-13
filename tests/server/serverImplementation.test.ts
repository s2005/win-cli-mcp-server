import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('CLIServer Implementation', () => {
  describe('Shell Configuration Resolution', () => {
    test('pre-resolves enabled shell configurations', () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 60 }
            }
          },
          powershell: {
            enabled: false,
            executable: { command: 'powershell.exe', args: ['-Command'] }
          }
        }
      });

      const server = new CLIServer(config);

      expect((server as any).resolvedConfigs.has('cmd')).toBe(true);
      expect((server as any).resolvedConfigs.has('powershell')).toBe(false);

      const cmdResolved = (server as any).resolvedConfigs.get('cmd');
      expect(cmdResolved.security.commandTimeout).toBe(60);
    });

    test('lists only enabled shells', () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          wsl: { enabled: true, executable: { command: 'wsl.exe', args: ['-e'] } },
          powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      const enabledShells = (server as any).getEnabledShells();

      expect(enabledShells).toContain('cmd');
      expect(enabledShells).toContain('wsl');
      expect(enabledShells).not.toContain('powershell');
    });
  });

  describe('Working Directory Initialization', () => {
    test('uses initialDir from global config', () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C\\other');

      const config = buildTestConfig({
        global: {
          paths: {
            allowedPaths: ['C\\allowed'],
            initialDir: 'C\\allowed'
          }
        }
      });

      const server = new CLIServer(config);

      expect(chdirSpy).toHaveBeenCalledWith('C\\allowed');
      expect((server as any).serverActiveCwd).toBe('C\\allowed');

      chdirSpy.mockRestore();
      cwdSpy.mockRestore();
    });

    test('validates CWD against global allowed paths', () => {
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C\\not-allowed');

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C\\allowed'] }
        }
      });

      const server = new CLIServer(config);

      expect((server as any).serverActiveCwd).toBeUndefined();

      cwdSpy.mockRestore();
    });
  });

  describe('Command Execution with Context', () => {
    test('uses shell-specific timeout', async () => {
      const spawnMock = jest.fn(() => {
        const proc = new (require('events').EventEmitter)();
        proc.stdout = new (require('events').EventEmitter)();
        proc.stderr = new (require('events').EventEmitter)();
        proc.kill = jest.fn();

        setTimeout(() => {
        }, 200);

        return proc;
      });

      jest.doMock('child_process', () => ({ spawn: spawnMock }));

      const config = buildTestConfig({
        global: { security: { commandTimeout: 30 } },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: { security: { commandTimeout: 0.1 } }
          }
        }
      });

      const { CLIServer: MockedCLIServer } = await import('../../src/index.js');
      const server = new MockedCLIServer(config);

      jest.useFakeTimers();

      const resultPromise = server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'sleep 5' }
      });

      jest.advanceTimersByTime(150);

      await expect(resultPromise).rejects.toThrow(/timed out after 0.1 seconds.*wsl/);

      jest.useRealTimers();
      jest.dontMock('child_process');
    });

    test('validates paths based on shell type', async () => {
      const config = buildTestConfig({
        global: { security: { restrictWorkingDirectory: true } },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: { paths: { allowedPaths: ['C\\Windows'] } }
          },
          wsl: {
            enabled: true,
            executable: { command: 'wsl.exe', args: ['-e'] },
            overrides: { paths: { allowedPaths: ['/home/user'] } }
          }
        }
      });

      const server = new CLIServer(config);

      const cmdResult = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test', workingDir: '/home/user' }
      }) as CallToolResult;

      expect(cmdResult.isError).toBe(true);
      expect(cmdResult.content[0].text).toContain('validation failed');

      const wslResult = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'echo test', workingDir: 'C\\Windows' }
      }) as CallToolResult;

      expect(wslResult.isError).toBe(true);
      expect(wslResult.content[0].text).toContain('validation failed');
    });
  });
});
