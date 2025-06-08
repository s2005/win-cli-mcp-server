import { spawnSync } from 'child_process';
import path from 'path';

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');

describe('WSL Emulator Functionality', () => {
  test('emulator handles basic commands', () => {
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'echo', 'test'], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('test');
  });

  test('emulator propagates exit codes', () => {
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'exit', '42']);
    expect(result.status).toBe(42);
  });
});
