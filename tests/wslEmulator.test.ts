import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wslPath = path.join(__dirname, 'wsl.sh');

describe('wsl emulator', () => {
  test('executes commands using bash', () => {
    const result = spawnSync(wslPath, ['echo hello'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });
});
