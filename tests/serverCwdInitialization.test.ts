import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { buildTestConfig } from './helpers/testUtils.js';

const ALLOWED_DIR = 'C:\\allowed';
const OUTSIDE_DIR = 'C:\\not\\allowed';

describe('Server active working directory initialization', () => {
  test('launch outside allowed paths leaves active cwd undefined', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const config = buildTestConfig({
      security: { allowedPaths: [ALLOWED_DIR], restrictWorkingDirectory: true },
      shells: { wsl: { enabled: true } }
    });
    const server = new CLIServer(config);
    expect((server as any).serverActiveCwd).toBeUndefined();
    cwdSpy.mockRestore();
  });

  test('execute_command without workingDir fails when active cwd undefined', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const config = buildTestConfig({
      security: { allowedPaths: [ALLOWED_DIR], restrictWorkingDirectory: true },
      shells: { wsl: { enabled: true } }
    });
    const server = new CLIServer(config);
    const res = await server._executeTool({ name: 'execute_command', arguments: { shell: 'wsl', command: 'echo hi' } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/active working directory is not set/i);
    cwdSpy.mockRestore();
  });

  test('set_current_directory sets active cwd', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const config = buildTestConfig({ security: { allowedPaths: [ALLOWED_DIR], restrictWorkingDirectory: true } });
    const server = new CLIServer(config);
    const res = await server._executeTool({ name: 'set_current_directory', arguments: { path: ALLOWED_DIR } });
    expect(res.isError).toBe(false);
    expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);
    expect(chdirSpy).toHaveBeenCalledWith(ALLOWED_DIR);
    chdirSpy.mockRestore();
    cwdSpy.mockRestore();
  });

  test('get_current_directory reports unset state', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const config = buildTestConfig({ security: { allowedPaths: [ALLOWED_DIR], restrictWorkingDirectory: true } });
    const server = new CLIServer(config);
    const res = await server._executeTool({ name: 'get_current_directory', arguments: {} });
    expect(res.isError).toBe(false);
    expect(res.content[0].text).toMatch(/not currently set/i);
    cwdSpy.mockRestore();
  });

  test('initialDir sets active cwd when valid', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const config = buildTestConfig({ security: { allowedPaths: [ALLOWED_DIR], initialDir: ALLOWED_DIR, restrictWorkingDirectory: true } });
    const server = new CLIServer(config);
    expect(chdirSpy).toHaveBeenCalledWith(ALLOWED_DIR);
    expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);
    chdirSpy.mockRestore();
    cwdSpy.mockRestore();
  });

  test('initialDir chdir failure falls back to process.cwd()', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(ALLOWED_DIR);
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => { throw new Error('fail'); });
    const config = buildTestConfig({ security: { allowedPaths: [ALLOWED_DIR], initialDir: 'C\\bad', restrictWorkingDirectory: true } });
    const server = new CLIServer(config);
    expect(chdirSpy).toHaveBeenCalledWith('C\\bad');
    expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);
    chdirSpy.mockRestore();
    cwdSpy.mockRestore();
  });

  test('initialDir not in allowedPaths leaves active cwd undefined', () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(OUTSIDE_DIR);
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const config = buildTestConfig({ security: { allowedPaths: [ALLOWED_DIR], initialDir: 'C\\outside', restrictWorkingDirectory: true } });
    const server = new CLIServer(config);
    expect(chdirSpy).toHaveBeenCalledWith('C\\outside');
    expect((server as any).serverActiveCwd).toBeUndefined();
    chdirSpy.mockRestore();
    cwdSpy.mockRestore();
  });
});
