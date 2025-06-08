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

  test('pwd returns current directory', () => {
    const tmpDir = path.resolve(process.platform === 'win32' ? process.env.TEMP || 'C:/tmp' : '/tmp');
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'pwd'], {
      encoding: 'utf8',
      cwd: tmpDir
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(tmpDir);
  });

  test('ls /tmp returns simulated output', () => {
    const result = spawnSync('node', [wslEmulatorPath, '-e', 'ls', '/tmp'], {
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('total 0');
  });
});
