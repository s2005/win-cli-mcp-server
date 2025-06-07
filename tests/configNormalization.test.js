import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { loadConfig, DEFAULT_CONFIG } from '../src/utils/config.js';
describe('Validate allowedPaths normalization from config', () => {
    let tempDir;
    let CONFIG_PATH;
    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-test-'));
        CONFIG_PATH = path.join(tempDir, `${randomBytes(8).toString('hex')}.json`);
        const content = {
            security: { allowedPaths: [
                    'C:\\SomeFolder\\Test',
                    '/c/other/PATH',
                    'C:/Another/Folder',
                    '/mnt/d/Incorrect/Path'
                ] }
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(content));
    });
    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
    test('loadConfig lower-cases and normalizes allowedPaths', () => {
        const cfg = loadConfig(CONFIG_PATH);
        const normalized = cfg.security.allowedPaths;
        expect(normalized).toEqual([
            path.normalize('c:\\somefolder\\test'), // Stays Windows path
            path.normalize('c:\\other\\path'), // This was /c/other/path, now normalized to C:\other\path
            path.normalize('c:\\another\\folder'), // Stays Windows path
            '/mnt/d/incorrect/path', // This was /mnt/d/incorrect/path, preserved as WSL path
        ]);
    });
    test('loadConfig fills missing security settings with defaults', () => {
        const cfg = loadConfig(CONFIG_PATH);
        expect(cfg.security.maxCommandLength).toBe(DEFAULT_CONFIG.security.maxCommandLength);
        expect(cfg.security.blockedCommands).toEqual(DEFAULT_CONFIG.security.blockedCommands);
        expect(cfg.security.blockedArguments).toEqual(DEFAULT_CONFIG.security.blockedArguments);
        expect(cfg.security.commandTimeout).toBe(DEFAULT_CONFIG.security.commandTimeout);
        expect(cfg.security.enableInjectionProtection).toBe(DEFAULT_CONFIG.security.enableInjectionProtection);
    });
});
