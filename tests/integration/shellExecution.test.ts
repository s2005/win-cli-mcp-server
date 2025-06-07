import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('Shell Execution Security', () => {
  test('should reject commands with blocked operators', async () => {
    const server = new TestCLIServer();
    await expect(
      server.executeCommand({ shell: 'wsl', command: 'echo hi ; ls' })
    ).rejects.toBeInstanceOf(McpError);
  });

  test('should enforce working directory restrictions', async () => {
    const server = new TestCLIServer({
      security: { restrictWorkingDirectory: true, allowedPaths: ['/allowed'] }
    });

    await expect(
      server.executeCommand({ shell: 'wsl', command: 'pwd', workingDir: '/tmp' })
    ).rejects.toBeInstanceOf(McpError);
  });

  test('should execute when working directory allowed', async () => {
    const server = new TestCLIServer({
      security: { restrictWorkingDirectory: true, allowedPaths: ['/tmp'] }
    });

    const result = await server.executeCommand({ shell: 'wsl', command: 'pwd', workingDir: '/tmp' });
    expect(result.exitCode).toBe(0);
    expect(result.workingDirectory).toBe('/tmp');
  });
});
