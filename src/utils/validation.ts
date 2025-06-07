import path from 'path';
import type { ShellConfig } from '../types/config.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"; // Import McpError and ErrorCode

export function extractCommandName(command: string): string {
    // Replace backslashes with forward slashes
    const normalizedCommand = command.replace(/\\/g, '/');
    // Remove any path components
    const basename = path.basename(normalizedCommand);
    // Remove extension
    return basename.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

export function isCommandBlocked(command: string, blockedCommands: string[]): boolean {
    const commandName = extractCommandName(command.toLowerCase());
    return blockedCommands.some(blocked => 
        commandName === blocked.toLowerCase() ||
        commandName === `${blocked.toLowerCase()}.exe` ||
        commandName === `${blocked.toLowerCase()}.cmd` ||
        commandName === `${blocked.toLowerCase()}.bat`
    );
}

export function isArgumentBlocked(args: string[], blockedArguments: string[]): boolean {
    return args.some(arg => 
        blockedArguments.some(blocked => 
            new RegExp(`^${blocked}$`, 'i').test(arg)
        )
    );
}

/**
 * Validates a command for a specific shell, checking for shell-specific blocked operators
 */
export function validateShellOperators(command: string, shellConfig: ShellConfig): void {
    // Skip validation if shell doesn't specify blocked operators
    if (!shellConfig.blockedOperators?.length) {
        return;
    }

    // Create regex pattern from blocked operators
    // Iterate and test each operator to identify the specific one found.
    for (const op of shellConfig.blockedOperators) {
        const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape for regex
        const regex = new RegExp(escapedOp);
        if (regex.test(command)) {
            throw new McpError(ErrorCode.InvalidRequest, `Command contains blocked operator: ${op}`);
        }
    }
}

/**
 * Parse a command string into command and arguments, properly handling paths with spaces and quotes
 */
export function parseCommand(fullCommand: string): { command: string; args: string[] } {
    fullCommand = fullCommand.trim();
    if (!fullCommand) {
        return { command: '', args: [] };
    }

    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    // Parse into tokens, preserving quoted strings
    for (let i = 0; i < fullCommand.length; i++) {
        const char = fullCommand[i];

        // Handle quotes
        if ((char === '"' || char === "'") && (!inQuotes || char === quoteChar)) {
            if (inQuotes) {
                tokens.push(current);
                current = '';
            }
            inQuotes = !inQuotes;
            quoteChar = inQuotes ? char : '';
            continue;
        }

        // Handle spaces outside quotes
        if (char === ' ' && !inQuotes) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    // Add any remaining token
    if (current) {
        tokens.push(current);
    }

    // Handle empty input
    if (tokens.length === 0) {
        return { command: '', args: [] };
    }

    // First, check if this is a single-token command
    if (!tokens[0].includes(' ') && !tokens[0].includes('\\')) {
        return {
            command: tokens[0],
            args: tokens.slice(1)
        };
    }

    // Special handling for Windows paths with spaces
    let commandTokens: string[] = [];
    let i = 0;

    // Keep processing tokens until we find a complete command path
    while (i < tokens.length) {
        commandTokens.push(tokens[i]);
        const potentialCommand = commandTokens.join(' ');

        // Check if this could be a complete command path
        if (/\.(exe|cmd|bat)$/i.test(potentialCommand) || 
            (!potentialCommand.includes('\\') && commandTokens.length === 1)) {
            return {
                command: potentialCommand,
                args: tokens.slice(i + 1)
            };
        }

        // If this is part of a path, keep looking
        if (potentialCommand.includes('\\')) {
            i++;
            continue;
        }

        // If we get here, treat the first token as the command
        return {
            command: tokens[0],
            args: tokens.slice(1)
        };
    }

    // If we get here, use all collected tokens as the command
    return {
        command: commandTokens.join(' '),
        args: tokens.slice(commandTokens.length)
    };
}

export function convertWindowsToWslPath(windowsPath: string, mountPoint: string = '/mnt/'): string {
  if (windowsPath.startsWith('\\\\') || windowsPath.startsWith('//')) {
    throw new Error('UNC paths are not supported for WSL conversion.');
  }

  const driveRegex = /^([a-zA-Z]):([\\/]?.*)$/;
  const match = windowsPath.match(driveRegex);

  if (match) {
    const driveLetter = match[1].toLowerCase();
    let restOfPath = match[2].replace(/\\/g, '/'); // Normalize to forward slashes

    // Remove leading slash from restOfPath if it exists, as it's part of the path components
    if (restOfPath.startsWith('/')) {
      restOfPath = restOfPath.substring(1);
    }

    // Handle trailing slashes for the main path part
    if (restOfPath.endsWith('/')) {
        restOfPath = restOfPath.substring(0, restOfPath.length - 1);
    }

    // Ensure mountPoint ends with a slash
    const baseMount = mountPoint.endsWith('/') ? mountPoint : mountPoint + '/';

    if (!restOfPath) { // Path was just "C:" or "C:\" or "C:/"
        return `${baseMount}${driveLetter}`;
    }

    return `${baseMount}${driveLetter}/${restOfPath}`;
  }

  // Not a Windows drive path, return as-is
  return windowsPath;
}

export function resolveWslAllowedPaths(globalAllowedPaths: string[], wslConfig: ShellConfig): string[] {
  const wslPaths: string[] = [];
  const mountPoint = wslConfig.wslMountPoint || '/mnt/';

  if (wslConfig.allowedPaths && wslConfig.allowedPaths.length > 0) {
    wslConfig.allowedPaths.forEach(p => {
      if (!wslPaths.includes(p)) {
        wslPaths.push(p);
      }
    });
  }

  if (wslConfig.inheritGlobalPaths !== false) { // True or undefined
    globalAllowedPaths.forEach(globalPath => {
      try {
        const convertedPath = convertWindowsToWslPath(globalPath, mountPoint);
        // Add if not already present (either from wslConfig.allowedPaths or a previous conversion)
        if (!wslPaths.includes(convertedPath)) {
          wslPaths.push(convertedPath);
        }
      } catch (error) {
        // Check if error is an instance of Error and has a message
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping global path "${globalPath}" for WSL: ${message}`);
      }
    });
  }

  return wslPaths;
}

export function isWslPathAllowed(testPath: string, allowedPaths: string[]): boolean {
  if (!testPath || typeof testPath !== 'string') {
    return false;
  }
  // Normalize testPath: use POSIX normalization for WSL paths
  let normalizedTestPath = path.posix.normalize(testPath);
  // Remove trailing slash for consistent comparison, unless it's the root "/"
  if (normalizedTestPath !== '/' && normalizedTestPath.endsWith('/')) {
    normalizedTestPath = normalizedTestPath.substring(0, normalizedTestPath.length - 1);
  }

  return allowedPaths.some(allowedPath => {
    if (!allowedPath || typeof allowedPath !== 'string') {
      return false;
    }
    // Normalize allowedPath
    let normalizedAllowedPath = path.posix.normalize(allowedPath);
    // Remove trailing slash for consistent comparison, unless it's the root "/"
    if (normalizedAllowedPath !== '/' && normalizedAllowedPath.endsWith('/')) {
      normalizedAllowedPath = normalizedAllowedPath.substring(0, normalizedAllowedPath.length - 1);
    }

    // Check for exact match or if testPath is a subdirectory of allowedPath
    if (normalizedTestPath === normalizedAllowedPath) {
      return true;
    }
    // Ensure that if allowedPath is "/", it correctly matches paths like "/foo"
    // And if allowedPath is "/foo", it matches "/foo/bar" but not "/foobar"
    if (normalizedTestPath.startsWith(normalizedAllowedPath + (normalizedAllowedPath === '/' ? '' : '/'))) {
      return true;
    }
    return false;
  });
}

export function validateWslWorkingDirectory(dir: string, wslConfig: ShellConfig, globalAllowedPaths: string[]): void {
  // Ensure dir is an absolute WSL/Linux-style path
  if (!path.posix.isAbsolute(dir)) {
      throw new Error('WSL working directory must be an absolute path (e.g., /mnt/c/Users or /home/user)');
  }

  const resolvedWslAllowedPaths = resolveWslAllowedPaths(globalAllowedPaths, wslConfig);

  if (resolvedWslAllowedPaths.length === 0) {
    throw new Error('No allowed paths configured for WSL shell. Cannot set working directory.');
  }

  if (!isWslPathAllowed(dir, resolvedWslAllowedPaths)) {
    const allowedPathsStr = resolvedWslAllowedPaths.join(', ');
    throw new Error(
      `WSL working directory '${dir}' must be within allowed paths: ${allowedPathsStr}`
    );
  }
}

export function isPathAllowed(testPath: string, allowedPaths: string[]): boolean {
    // Step 1: Normalize testPath
    let normalizedTestPath = normalizeWindowsPath(testPath).toLowerCase();
    normalizedTestPath = normalizedTestPath.replace(/[/\\]+$/, ''); // Remove ALL trailing slashes

    // Step 2: Iterate through allowedPaths
    return allowedPaths.some(allowedPath => {
        // Step 2a: Normalize current allowedPath
        let normalizedAllowedPath = normalizeWindowsPath(allowedPath).toLowerCase();
        normalizedAllowedPath = normalizedAllowedPath.replace(/[/\\]+$/, ''); // Remove ALL trailing slashes

        let comparisonResult = false;
        if (normalizedTestPath === normalizedAllowedPath) {
            comparisonResult = true;
        } else if (normalizedTestPath.startsWith(normalizedAllowedPath)) {
            const charAfterAllowedPath = normalizedTestPath[normalizedAllowedPath.length];
            if (charAfterAllowedPath === '/' || charAfterAllowedPath === '\\') {
                comparisonResult = true;
            }
        }

        if (comparisonResult) return true;

        // Fallback for other paths
        return false;
    });
}

export function validateWorkingDirectory(dir: string, allowedPaths: string[]): void {
    const isWindowsDriveAbsolute = /^[a-zA-Z]:\\/.test(dir);
    if (!isWindowsDriveAbsolute && !path.isAbsolute(dir)) {
        throw new Error('Working directory must be an absolute path');
    }

    if (!isPathAllowed(dir, allowedPaths)) {
        const allowedPathsStr = allowedPaths.join(', ');
        throw new Error(
            `Working directory must be within allowed paths: ${allowedPathsStr}`
        );
    }
}

export function normalizeWindowsPath(inputPath: string): string {
    // Handle UNC paths first: \\server\share
    if (inputPath.startsWith('\\\\')) {
        // Normalize, but prevent converting forward slashes if any were used by mistake in a UNC path
        let normalizedUnc = inputPath.replace(/\//g, '\\');
        normalizedUnc = path.win32.normalize(normalizedUnc);
        // path.win32.normalize might convert \\\\ to \\ if not careful, ensure it stays \\\\server
        if (normalizedUnc.startsWith('\\') && !normalizedUnc.startsWith('\\\\')) {
          // This can happen if path.win32.normalize "fixes" \\\\server to \server
          // It's a bit of a dance, ensure it's a valid UNC start.
          // A more robust UNC check might be needed if this isn't sufficient.
           return '\\' + normalizedUnc; // Prepend backslash to make it \\server again
        }
        return normalizedUnc;
    }

    // Check for WSL paths and other POSIX-like absolute paths
    if (inputPath.startsWith('/')) {
        let normalizedPosixPath = path.posix.normalize(inputPath);
        // Check for Git Bash style /c/foo paths specifically
        const gitBashDriveMatch = normalizedPosixPath.match(/^\/([a-zA-Z])($|\/.*)/);
        if (gitBashDriveMatch) {
            const driveLetter = gitBashDriveMatch[1].toUpperCase();
            const restOfPath = gitBashDriveMatch[2] || ''; // Ensure restOfPath is empty string if undefined
            // Convert to Windows style: C:\rest\of\path
            // Need to remove leading slash from restOfPath if it exists, as it's part of the Windows path
            return `${driveLetter}:${restOfPath.startsWith('/') ? restOfPath : '\\' + restOfPath}`.replace(/\//g, '\\');
        }
        // For other POSIX paths like /home/user, /mnt/c/foo, /usr/bin, return as is (normalized)
        return normalizedPosixPath;
    }

    let currentPath = inputPath;

    // The OLD WSL /mnt/x/foo to X:\foo handling block has been removed.

    const hadTrailingSlash = /[/\\]$/.test(currentPath) && currentPath.length > 1;

    currentPath = currentPath.replace(/\//g, '\\'); // Convert all / to \ for Windows processing

    // The Git Bash style /c/foo conversion is now handled by the block: if (inputPath.startsWith('/'))
    // No need for the old `gitbashMatch` here for that specific case.
    // However, if a path like `\c\foo` (starting with backslash) was intended to be caught,
    // that is a different scenario. The `gitbashMatch` below implies it was for paths already processed to use `\`.
    // Given the new upfront handling of `/` prefixed paths, this specific regex might be redundant or for edge cases.

    // This regex was for paths like `\c\foo` that might have resulted after initial conversion of `/` to `\`
    // It's less likely to be hit for `/c/foo` style inputs now.
    const gitbashDriveMatchAfterSlashConversion = currentPath.match(/^\\([a-zA-Z])($|\\.*)/);
    if (gitbashDriveMatchAfterSlashConversion) {
        currentPath = `${gitbashDriveMatchAfterSlashConversion[1].toUpperCase()}:${gitbashDriveMatchAfterSlashConversion[2] || ''}`;
    }
    // Removed `else if (currentPath.startsWith('\\'))` for UNC as it's handled upfront.
    // This handles paths like `\Users\test` (not `\\server\share` or `\c\foo`)
    else if (currentPath.startsWith('\\') && !currentPath.startsWith('\\\\')) {
        // This case was for paths like \Users\test (interpreted as C:\Users\test)
        const hasDriveLetterAfterInitialSlash = /^[a-zA-Z]:/.test(currentPath.substring(1));
        if (hasDriveLetterAfterInitialSlash) {
            currentPath = currentPath.substring(1);
        } else {
            currentPath = `C:\\${currentPath.substring(1)}`;
        }
    }
    else { 
        if (/^[a-zA-Z]:(?![\\/])/.test(currentPath)) { 
            currentPath = `${currentPath.substring(0, 2)}\\${currentPath.substring(2)}`;
        } 
        // This was the old logic that might have prepended C:\ to already drive-lettered paths if not careful.
        // If currentPath is already "C:\foo" or "C:", this should not apply.
        // If currentPath is "foo\bar" (relative), it should become "C:\foo\bar".
        else if (!/^[a-zA-Z]:\\/.test(currentPath) && !currentPath.startsWith('\\')) { // if not X:\path and not \path
             if (!/^[a-zA-Z]:/.test(currentPath)) { // And also not X:relative
                 currentPath = `C:\\${currentPath}`;
             }
        }
    }
    
    let finalPath = path.win32.normalize(currentPath);

    const driveLetterMatchCleanup = finalPath.match(/^([a-z]):(.*)/);
    if (driveLetterMatchCleanup) {
        finalPath = `${driveLetterMatchCleanup[1].toUpperCase()}:${driveLetterMatchCleanup[2]}`;
    }

    finalPath = finalPath.replace(/\\+/g, '\\');
    
    if (finalPath.match(/^[a-zA-Z]:$/)) {
        finalPath += '\\';
    }

    if (hadTrailingSlash && !finalPath.endsWith('\\')) {
        finalPath += '\\';
    } else if (!hadTrailingSlash && finalPath.endsWith('\\') && finalPath.length > 3) { 
        finalPath = finalPath.replace(/\\$/, ''); 
    }

    return finalPath;
}

export function normalizeAllowedPaths(paths: string[]): string[] {
    // Step 1: Initial Normalization
    const normalizedInputPaths = paths.map(p => normalizeWindowsPath(p).toLowerCase());

    // Step 2: Processing and Filtering
    const processedPaths: string[] = [];

    for (const currentPath of normalizedInputPaths) {
        // a. Create a version of currentPath without a trailing backslash
        const comparableCurrentPath = currentPath.replace(/\\$/, '');

        // b. Check for Duplicates
        if (processedPaths.some(existingPath => existingPath.replace(/\\$/, '') === comparableCurrentPath)) {
            continue;
        }

        // c. Check for Nesting (currentPath is child of an existing path)
        if (processedPaths.some(existingPath => {
            const comparableExistingPath = existingPath.replace(/\\$/, '');
            return comparableCurrentPath.startsWith(comparableExistingPath + '\\');
        })) {
            continue;
        }

        // d. Remove Existing Nested Children (existing path is child of currentPath)
        for (let i = processedPaths.length - 1; i >= 0; i--) {
            const comparableExistingPath = processedPaths[i].replace(/\\$/, '');
            if (comparableExistingPath.startsWith(comparableCurrentPath + '\\')) {
                processedPaths.splice(i, 1);
            }
        }
        
        // e. Add comparableCurrentPath (the version without the trailing slash)
        processedPaths.push(comparableCurrentPath);
    }

    // Step 3: Return
    return processedPaths;
}
