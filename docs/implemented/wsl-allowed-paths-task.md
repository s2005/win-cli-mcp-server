# Task: Implement WSL-Specific AllowedPaths Configuration

## Overview

Implement support for WSL-specific `allowedPaths` configuration that allows independent path restriction settings for the WSL shell while maintaining compatibility with the global Windows path settings. The implementation should automatically convert Windows paths to WSL mount format when validating WSL commands.

## Background

Currently, the Windows CLI MCP server uses a global `allowedPaths` configuration that applies to all shells (PowerShell, CMD, Git Bash, and WSL). However, WSL has a different filesystem structure where Windows drives are mounted under `/mnt/` (e.g., `C:\` becomes `/mnt/c/`). This creates challenges:

1. Global `allowedPaths` with Windows paths (e.g., `D:\mcp`) cannot be directly used for WSL validation
2. Users need to manually specify WSL paths (e.g., `/mnt/d/mcp`) in addition to Windows paths
3. There's no automatic conversion between Windows and WSL path formats

## Requirements

### Functional Requirements

1. **WSL-Specific Configuration**: Add support for WSL-specific `allowedPaths` in the shell configuration
2. **Automatic Path Conversion**: Convert Windows paths to WSL format using configurable mount point (`/mnt/` by default)
3. **Backward Compatibility**: Maintain existing behavior for global `allowedPaths`
4. **Flexible Mount Point**: Allow configuration of WSL mount point (default: `/mnt/`)
5. **Path Validation Logic**: Implement proper validation for both native WSL paths and converted Windows paths

### Technical Requirements

1. **Type Safety**: Update TypeScript interfaces for new configuration options
2. **Validation**: Extend path validation logic to handle WSL-specific paths
3. **Testing**: Comprehensive unit tests for new functionality
4. **Documentation**: Update configuration documentation and examples

## Implementation Details

### 1. Configuration Schema Changes

#### Update `ShellConfig` Interface

```typescript
export interface ShellConfig {
  enabled: boolean;
  command: string;
  args: string[];
  validatePath?: (dir: string) => boolean;
  blockedOperators?: string[];
  // New WSL-specific properties
  allowedPaths?: string[];           // WSL-specific allowed paths
  wslMountPoint?: string;            // Mount point for Windows drives (default: "/mnt/")
  inheritGlobalPaths?: boolean;      // Whether to inherit from global allowedPaths (default: true)
}
```

#### Update Default Configuration

```typescript
wsl: {
  enabled: true,
  command: 'wsl.exe',
  args: ['-e'],
  validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
  blockedOperators: ['&', '|', ';', '`'],
  // New WSL-specific settings
  allowedPaths: [],                  // Empty by default, inherits from global
  wslMountPoint: '/mnt/',           // Default Windows mount point
  inheritGlobalPaths: true          // Convert global Windows paths to WSL format
}
```

### 2. Path Conversion Logic

#### Windows to WSL Path Conversion Function

```typescript
/**
 * Converts Windows path to WSL format using the specified mount point
 * @param windowsPath - Windows path (e.g., "D:\mcp\project")
 * @param mountPoint - WSL mount point (e.g., "/mnt/")
 * @returns WSL path (e.g., "/mnt/d/mcp/project")
 */
export function convertWindowsToWslPath(windowsPath: string, mountPoint: string = '/mnt/'): string {
  // Handle drive letter paths (C:\ -> /mnt/c/)
  const driveMatch = windowsPath.match(/^([a-zA-Z]):(.*)/);
  if (driveMatch) {
    const driveLetter = driveMatch[1].toLowerCase();
    const restPath = driveMatch[2].replace(/\\/g, '/').replace(/^\/+/, '');
    return `${mountPoint}${driveLetter}/${restPath}`.replace(/\/+$/, '') || `${mountPoint}${driveLetter}`;
  }
  
  // Handle UNC paths - not supported in WSL mount conversion
  if (windowsPath.startsWith('\\\\')) {
    throw new Error(`UNC paths cannot be converted to WSL format: ${windowsPath}`);
  }
  
  // Return as-is for non-Windows paths
  return windowsPath;
}
```

#### WSL Path Resolution Function

```typescript
/**
 * Resolves all allowed paths for WSL shell
 * @param globalAllowedPaths - Global allowed paths from security config
 * @param wslConfig - WSL shell configuration
 * @returns Array of WSL-compatible allowed paths
 */
export function resolveWslAllowedPaths(globalAllowedPaths: string[], wslConfig: ShellConfig): string[] {
  const wslPaths: string[] = [];
  const mountPoint = wslConfig.wslMountPoint || '/mnt/';
  
  // Add WSL-specific allowed paths if defined
  if (wslConfig.allowedPaths && wslConfig.allowedPaths.length > 0) {
    wslPaths.push(...wslConfig.allowedPaths);
  }
  
  // Convert and add global paths if inheritance is enabled
  if (wslConfig.inheritGlobalPaths !== false) {
    for (const globalPath of globalAllowedPaths) {
      try {
        const wslPath = convertWindowsToWslPath(globalPath, mountPoint);
        if (!wslPaths.includes(wslPath)) {
          wslPaths.push(wslPath);
        }
      } catch (error) {
        // Log warning for paths that cannot be converted
        console.warn(`Cannot convert global path to WSL format: ${globalPath} - ${error.message}`);
      }
    }
  }
  
  return wslPaths;
}
```

### 3. Validation Logic Updates

#### Update Path Validation for WSL

```typescript
/**
 * Validates WSL working directory against WSL-specific allowed paths
 */
export function validateWslWorkingDirectory(dir: string, wslConfig: ShellConfig, globalAllowedPaths: string[]): void {
  // Get resolved WSL allowed paths
  const wslAllowedPaths = resolveWslAllowedPaths(globalAllowedPaths, wslConfig);
  
  if (wslAllowedPaths.length === 0) {
    throw new Error('No allowed paths configured for WSL shell');
  }
  
  // Validate using WSL-specific logic
  if (!isWslPathAllowed(dir, wslAllowedPaths)) {
    const allowedPathsStr = wslAllowedPaths.join(', ');
    throw new Error(
      `WSL working directory must be within allowed paths: ${allowedPathsStr}`
    );
  }
}

/**
 * Check if WSL path is allowed
 */
export function isWslPathAllowed(testPath: string, allowedPaths: string[]): boolean {
  // Normalize WSL path (handle trailing slashes, etc.)
  const normalizedTestPath = path.posix.normalize(testPath).replace(/\/+$/, '');
  
  return allowedPaths.some(allowedPath => {
    const normalizedAllowedPath = path.posix.normalize(allowedPath).replace(/\/+$/, '');
    
    if (normalizedTestPath === normalizedAllowedPath) {
      return true;
    }
    
    if (normalizedTestPath.startsWith(normalizedAllowedPath)) {
      const charAfterAllowedPath = normalizedTestPath[normalizedAllowedPath.length];
      return charAfterAllowedPath === '/';
    }
    
    return false;
  });
}
```

### 4. Integration Changes

#### Update Command Execution Logic

```typescript
// In CLIServer._executeTool method, for WSL shell:
if (shellKey === 'wsl') {
  if (this.config.security.restrictWorkingDirectory) {
    try {
      validateWslWorkingDirectory(workingDir, shellConfig, Array.from(this.allowedPaths));
    } catch (error: any) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `WSL working directory validation failed: ${error.message}. Use validate_directories tool to check allowed paths.`
      );
    }
  }
}
```

### 5. Configuration Examples

#### Basic WSL Configuration with Inheritance

```json
{
  "security": {
    "allowedPaths": ["D:\\mcp", "C:\\Users\\username\\projects"],
    "restrictWorkingDirectory": true
  },
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "blockedOperators": ["&", "|", ";", "`"],
      "wslMountPoint": "/mnt/",
      "inheritGlobalPaths": true
    }
  }
}
```

This configuration would allow WSL commands in:
- `/mnt/d/mcp` (converted from `D:\mcp`)
- `/mnt/c/Users/username/projects` (converted from `C:\Users\username\projects`)

#### WSL-Specific Paths with Custom Mount Point

```json
{
  "security": {
    "allowedPaths": ["D:\\mcp"],
    "restrictWorkingDirectory": true
  },
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "blockedOperators": ["&", "|", ";", "`"],
      "allowedPaths": ["/home/user", "/tmp"],
      "wslMountPoint": "/mnt/",
      "inheritGlobalPaths": true
    }
  }
}
```

This configuration would allow WSL commands in:
- `/home/user` (WSL-specific)
- `/tmp` (WSL-specific)
- `/mnt/d/mcp` (converted from global `D:\mcp`)

#### WSL-Only Paths (No Inheritance)

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "blockedOperators": ["&", "|", ";", "`"],
      "allowedPaths": ["/home/user/project", "/opt/myapp"],
      "inheritGlobalPaths": false
    }
  }
}
```

### 6. Testing Requirements

#### Unit Tests

1. **Path Conversion Tests**
   - Windows drive paths to WSL format
   - Custom mount points
   - Edge cases (UNC paths, relative paths)

2. **Path Validation Tests**
   - WSL-specific path validation
   - Inheritance behavior
   - Mixed WSL and converted Windows paths

3. **Configuration Tests**
   - Default configuration behavior
   - Custom WSL configuration
   - Error handling for invalid configurations

4. **Integration Tests**
   - End-to-end command execution with WSL paths
   - Working directory validation
   - Error messages and user experience

#### Test Files Structure

```
tests/
├── wsl/
│   ├── pathConversion.test.ts
│   ├── pathValidation.test.ts
│   ├── configuration.test.ts
│   └── integration.test.ts
└── wsl.test.ts (existing - update for new features)
```

### 7. Documentation Updates

#### README.md Updates

1. Add WSL-specific configuration section
2. Update configuration examples
3. Add troubleshooting guide for WSL paths

#### Configuration Documentation

1. Document new WSL configuration options
2. Provide migration guide from global to WSL-specific paths
3. Add best practices for WSL path configuration

## Implementation Plan

### Phase 1: Core Implementation
1. Update TypeScript interfaces
2. Implement path conversion functions
3. Update validation logic
4. Update default configuration

### Phase 2: Integration
1. Integrate WSL path validation into command execution
2. Update configuration loading and merging
3. Update error messages and user feedback

### Phase 3: Testing
1. Implement comprehensive unit tests
2. Update existing integration tests
3. Add new WSL-specific test scenarios

### Phase 4: Documentation
1. Update README and configuration docs
2. Add migration guide
3. Update sample configurations

## Success Criteria

1. **Functionality**: WSL shell can use both WSL-specific paths and converted Windows paths
2. **Backward Compatibility**: Existing configurations continue to work
3. **User Experience**: Clear error messages and intuitive configuration
4. **Test Coverage**: >95% code coverage for new functionality
5. **Documentation**: Complete and accurate documentation for all new features

## Potential Challenges and Solutions

### Challenge 1: UNC Path Handling
**Problem**: UNC paths (`\\server\share`) cannot be converted to WSL format
**Solution**: Provide clear error messages and documentation about limitations

### Challenge 2: Performance Impact
**Problem**: Path conversion and validation might impact performance
**Solution**: Cache converted paths and optimize validation logic

### Challenge 3: Configuration Complexity
**Problem**: Additional configuration options might confuse users
**Solution**: Provide sensible defaults and clear examples

### Challenge 4: WSL Distribution Differences
**Problem**: Different WSL distributions might have different mount behaviors
**Solution**: Document known differences and provide configuration flexibility

## Files to Modify

1. `src/types/config.ts` - Update interfaces
2. `src/utils/config.ts` - Update default configuration and loading
3. `src/utils/validation.ts` - Add WSL path conversion and validation
4. `src/index.ts` - Update command execution logic
5. `tests/wsl.test.ts` - Update existing tests
6. `tests/wsl/` - New test directory with comprehensive tests
7. `README.md` - Documentation updates
8. `config.sample.json` - Update sample configuration

## Estimated Effort

- **Development**: 3-4 days
- **Testing**: 2-3 days  
- **Documentation**: 1-2 days
- **Total**: 6-9 days

This implementation will provide a robust, flexible solution for WSL path management while maintaining backward compatibility and providing a good user experience.
