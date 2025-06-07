import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/utils/config.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

describe('Error Handling', () => {
  test('should handle malformed JSON-RPC requests', async () => {
    const server = new CLIServer(DEFAULT_CONFIG);
    await expect(
      server._executeTool({ name: 'execute_command', arguments: { shell: 'cmd' } })
    ).rejects.toEqual(
      expect.objectContaining({ code: ErrorCode.InvalidParams })
    );
  });

  test('should recover from shell crashes', async () => {
    const server = new CLIServer(DEFAULT_CONFIG);
    await expect(
      server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo hi' }
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: ErrorCode.InternalError,
        message: expect.stringContaining('Shell process error')
      })
    );
  });

  test('should throw error on invalid configuration', () => {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-config-'));
    const file = path.join(tmpDir, 'config.json');
    const badConfig = { ...DEFAULT_CONFIG, security: { ...DEFAULT_CONFIG.security, commandTimeout: 0 } };
    fs.writeFileSync(file, JSON.stringify(badConfig, null, 2));
    expect(() => loadConfig(file)).toThrow();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should fall back to defaults when config read fails', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const config = loadConfig('/path/does/not/matter.json');

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(errorSpy).toHaveBeenCalled();

    existsSpy.mockRestore();
    readSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
