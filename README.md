# Windows CLI MCP Server

[![NPM Downloads](https://img.shields.io/npm/dt/@simonb97/server-win-cli.svg?style=flat)](https://www.npmjs.com/package/@simonb97/server-win-cli)
[![NPM Version](https://img.shields.io/npm/v/@simonb97/server-win-cli.svg?style=flat)](https://www.npmjs.com/package/@simonb97/server-win-cli?activeTab=versions)
[![smithery badge](https://smithery.ai/badge/@simonb97/server-win-cli)](https://smithery.ai/server/@simonb97/server-win-cli)

[MCP server](https://modelcontextprotocol.io/introduction) for secure command-line interactions on Windows systems, enabling controlled access to PowerShell, CMD, Git Bash shells.
It allows MCP clients (like [Claude Desktop](https://claude.ai/download)) to perform operations on your system, similar to [Open Interpreter](https://github.com/OpenInterpreter/open-interpreter).

>[!IMPORTANT]
> This MCP server provides direct access to your system's command line interface. When enabled, it grants access to your files, environment variables, and command execution capabilities.
>
> - Review and restrict allowed paths
> - Enable directory restrictions
> - Configure command blocks
> - Consider security implications
>
> See [Configuration](#configuration) for more details.

- [Features](#features)
- [Usage with Claude Desktop](#usage-with-claude-desktop)
- [Configuration](#configuration)
  - [Configuration Locations](#configuration-locations)
  - [Default Configuration](#default-configuration)
  - [Configuration Settings](#configuration-settings)
    - [Security Settings](#security-settings)
    - [Shell Configuration](#shell-configuration)
- [API](#api)
  - [Tools](#tools)
  - [Resources](#resources)
- [Security Considerations](#security-considerations)
- [Using the MCP Inspector for Testing](#using-the-mcp-inspector-for-testing)
- [Development and Testing](#development-and-testing)
- [License](#license)

## Features

- **Multi-Shell Support**: Execute commands in PowerShell, Command Prompt (CMD), and Git Bash
- **Windows Subsystem for Linux (WSL)** support for command execution.
- **Resource Exposure**: View current directory and configuration as MCP resources
- **Security Controls**:
  - Command blocking (full paths, case variations)
  - Working directory validation
  - Maximum command length limits
  - Smart argument validation
- **Configurable**:
  - Custom security rules
  - Shell-specific settings
  - Path restrictions
  - Blocked command lists

See the [API](#api) section for more details on the tools and resources the server provides to MCP clients.

**Note**: The server will only allow operations within configured directories, with allowed commands.

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "windows-cli": {
      "command": "npx",
      "args": ["-y", "@simonb97/server-win-cli"]
    }
  }
}
```

For use with a specific config file, add the `--config` flag:

```json
{
  "mcpServers": {
    "windows-cli": {
      "command": "npx",
      "args": [
        "-y",
        "@simonb97/server-win-cli",
        "--config",
        "path/to/your/config.json"
      ]
    }
  }
}
```

After configuring, you can:

- Execute commands directly using the available tools
- View server configuration in the Resources section

## Configuration

The server uses a JSON configuration file to customize its behavior. You can specify settings for security controls and shell configurations.

1. To create a default config file, either:

    **a)** copy `config.sample.json` to `config.json` (or the location specified by `--config`), or

    **b)** run:

    ```bash
    npx @simonb97/server-win-cli --init-config ./config.json
    ```

2. Then set the `--config` flag to point to your config file as described in the [Usage with Claude Desktop](#usage-with-claude-desktop) section.

### Configuration Locations

The server looks for configuration in the following locations (in order):

1. Path specified by `--config` flag
2. ./config.json in current directory
3. ~/.win-cli-mcp/config.json in user's home directory

If no configuration file is found, the server will use a default (restricted) configuration:

### Default Configuration

**Note**: The default configuration is designed to be restrictive and secure. Find more details on each setting in the [Configuration Settings](#configuration-settings) section.

```json
{
  "security": {
    "maxCommandLength": 2000,
    "blockedCommands": [
      "rm",
      "del",
      "rmdir",
      "format",
      "shutdown",
      "restart",
      "reg",
      "regedit",
      "net",
      "netsh",
      "takeown",
      "icacls"
    ],
    "blockedArguments": [
      "--exec",
      "-e",
      "/c",
      "-enc",
      "-encodedcommand",
      "-command",
      "--interactive",
      "-i",
      "--login",
      "--system"
    ],
    "allowedPaths": ["User's home directory", "Current working directory"],
    "restrictWorkingDirectory": true,
    "commandTimeout": 30,
    "enableInjectionProtection": true
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "command": "powershell.exe",
      "args": ["-NoProfile", "-NonInteractive", "-Command"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\bin\\bash.exe",
      "args": ["-c"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "blockedOperators": ["&", "|", ";", "`"]
    }
  }
}
```

### Configuration Settings

The configuration file is divided into two main sections: `security` and `shells`.

#### Security Settings

```json
{
  "security": {
    // Maximum allowed length for any command
    "maxCommandLength": 1000,

    // Commands to block - blocks both direct use and full paths
    // Example: "rm" blocks both "rm" and "C:\Windows\System32\rm.exe"
    // Case-insensitive: "del" blocks "DEL.EXE", "del.cmd", etc.
    "blockedCommands": [
      "rm", // Delete files
      "del", // Delete files
      "rmdir", // Delete directories
      "format", // Format disks
      "shutdown", // Shutdown system
      "restart", // Restart system
      "reg", // Registry editor
      "regedit", // Registry editor
      "net", // Network commands
      "netsh", // Network commands
      "takeown", // Take ownership of files
      "icacls" // Change file permissions
    ],

    // Arguments that will be blocked when used with any command
    // Note: Checks each argument independently - "cd warm_dir" won't be blocked just because "rm" is in blockedCommands
    "blockedArguments": [
      "--exec", // Execution flags
      "-e", // Short execution flags
      "/c", // Command execution in some shells
      "-enc", // PowerShell encoded commands
      "-encodedcommand", // PowerShell encoded commands
      "-command", // Direct PowerShell command execution
      "--interactive", // Interactive mode which might bypass restrictions
      "-i", // Short form of interactive
      "--login", // Login shells might have different permissions
      "--system" // System level operations
    ],

    // List of directories where commands can be executed
    "allowedPaths": ["C:\\Users\\YourUsername", "C:\\Projects"],

    // If true, commands can only run in allowedPaths
    "restrictWorkingDirectory": true,

    // Timeout for command execution in seconds (default: 30)
    "commandTimeout": 30,

    // Enable or disable protection against command injection (covers ;, &, |, `)
    "enableInjectionProtection": true
  }
}
```

#### Shell Configuration

```json
{
  "shells": {
    "powershell": {
      // Enable/disable this shell
      "enabled": true,
      // Path to shell executable
      "command": "powershell.exe",
      // Default arguments for the shell
      "args": ["-NoProfile", "-NonInteractive", "-Command"],
      // Optional: Specify which command operators to block
      "blockedOperators": ["&", "|", ";", "`"]  // Block all command chaining
    },
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"],
      "blockedOperators": ["&", "|", ";", "`"]  // Block all command chaining
    },
    "gitbash": {
      "enabled": true,
      "command": "C:\\Program Files\\Git\\bin\\bash.exe",
      "args": ["-c"],
      "blockedOperators": ["&", "|", ";", "`"]  // Block all command chaining
    },
    "wsl": {
      "enabled": true,
      "command": "wsl.exe", // Command to invoke WSL
      "args": ["-e"],       // Arguments to pass to wsl.exe for command execution (e.g., '-e' to execute a command)
      "blockedOperators": ["&", "|", ";", "`"], // Standard blocked operators
      "allowedPaths": [], // WSL-specific allowed paths in Linux format (e.g., ["/home/username/projects", "/mnt/d/shared"])
      "wslMountPoint": "/mnt/", // Mount point prefix for converting Windows global paths to WSL paths (e.g. C:\ becomes /mnt/c/)
      "inheritGlobalPaths": true // Whether to inherit and convert paths from global security.allowedPaths for WSL use
    }
  }
}
```

The `wsl` shell configuration includes specialized options for path management:
- `allowedPaths`: An array of strings specifying directory paths in Linux format (e.g., `/home/user/project`, `/mnt/c/windows_folder`) that are explicitly permitted for WSL command execution. This is in addition to any paths inherited from the global `security.allowedPaths` if `inheritGlobalPaths` is true.
- `wslMountPoint`: A string representing the prefix used by your WSL distribution to mount Windows drives (default: `/mnt/`). For example, with `/mnt/`, `C:\Users` becomes `/mnt/c/Users`. This is used when converting global Windows paths for WSL.
- `inheritGlobalPaths`: A boolean (default: `true`) that determines if WSL should inherit allowed paths from the global `security.allowedPaths` setting. If true, Windows paths from the global list will be converted to their WSL equivalents (e.g., `C:\MyFolder` becomes `/mnt/c/MyFolder`) and added to WSL's list of allowed paths.

### Advanced WSL Path Configuration

WSL shells have a flexible path management system that allows for fine-grained control over where commands can be executed. This involves a combination of global `security.allowedPaths`, WSL-specific `shells.wsl.allowedPaths`, and how they interact via `inheritGlobalPaths` and `wslMountPoint`.

**Configuration Examples:**

**Example 1: Default Behavior (Inheriting Global Paths)**

Global paths are converted and used by WSL.

*   `config.json`:
    ```json
    {
      "security": {
        "allowedPaths": ["D:\\mcp", "C:\\Users\\username\\projects"],
        "restrictWorkingDirectory": true
      },
      "shells": {
        "wsl": {
          "enabled": true,
          "inheritGlobalPaths": true, // or omitted (defaults to true)
          "allowedPaths": []
          // wslMountPoint defaults to /mnt/
        }
      }
    }
    ```
*   **Explanation:** WSL will effectively allow command execution in `/mnt/d/mcp` and `/mnt/c/Users/username/projects`.

**Example 2: WSL-Specific Paths with Global Inheritance**

Both WSL-specific paths and converted global paths are allowed.

*   `config.json`:
    ```json
    {
      "security": {
        "allowedPaths": ["D:\\mcp"],
        "restrictWorkingDirectory": true
      },
      "shells": {
        "wsl": {
          "enabled": true,
          "allowedPaths": ["/home/user", "/tmp"],
          "inheritGlobalPaths": true
          // wslMountPoint defaults to /mnt/
        }
      }
    }
    ```
*   **Explanation:** WSL will allow command execution in `/home/user`, `/tmp`, and the converted global path `/mnt/d/mcp`.

**Example 3: WSL-Only Paths (No Inheritance)**

Only paths explicitly defined in `shells.wsl.allowedPaths` are permitted; global paths are ignored for WSL.

*   `config.json`:
    ```json
    {
      "security": {
        "allowedPaths": ["D:\\mcp", "C:\\Users\\username\\projects"], // These will be ignored by WSL
        "restrictWorkingDirectory": true
      },
      "shells": {
        "wsl": {
          "enabled": true,
          "allowedPaths": ["/home/user/projectX", "/opt/app"],
          "inheritGlobalPaths": false
        }
      }
    }
    ```
*   **Explanation:** WSL will only allow command execution in `/home/user/projectX` and `/opt/app`.

**Migration Note:**

Users who previously relied solely on the global `security.allowedPaths` for restricting WSL command execution should review these new settings. The default behavior (`inheritGlobalPaths: true`) is designed to maintain compatibility by automatically converting and including those global paths for WSL. However, for more explicit and granular control, it's recommended to define Linux-style paths directly within `shells.wsl.allowedPaths` and consider setting `inheritGlobalPaths: false` if global paths are not relevant to WSL operations.

**Best Practices for WSL Paths:**

*   For maximum clarity and strict control, define allowed paths directly in `shells.wsl.allowedPaths` using the appropriate Linux path format (e.g., `/home/user/mycode`).
*   If your WSL distribution uses a non-standard mount point for Windows drives (i.e., not `/mnt/`), ensure you configure `shells.wsl.wslMountPoint` accordingly (e.g., `/windir/`).
*   Regularly review which paths are accessible to WSL, especially when inheriting global paths, to ensure the principle of least privilege.

### Troubleshooting WSL Paths
*   Remember that global Windows paths (from `security.allowedPaths`) are converted when used by WSL (e.g., `C:\Users\dev` becomes `/mnt/c/Users/dev` by default if `inheritGlobalPaths` is true).
*   Paths defined directly in `shells.wsl.allowedPaths` must be in the Linux path format (e.g., `/home/user/my_project` or `/mnt/c/my_windows_folder_in_wsl`).
*   UNC paths (e.g., `\\\\server\\share`) in `security.allowedPaths` cannot be automatically converted for WSL use via `inheritGlobalPaths` and will be ignored for WSL with a warning.
*   If `inheritGlobalPaths` is `false`, only paths listed in `shells.wsl.allowedPaths` will be permitted for WSL.
```

```


#### Chained Commands

You can execute a series of commands in one request by joining them with `&&`. The server validates each step and checks any `cd` operations against the allowed directories.

```json
{
  "name": "execute_command",
  "arguments": {
    "shell": "gitbash",
    "command": "cd /c/my/project && source venv/bin/activate && npm test"
  }
}
```

## API

### Tools

- **execute_command**

  - Execute a command in the specified shell
  - Inputs:
    - `shell` (string): Shell to use ("powershell", "cmd", "gitbash", or "wsl")
    - `command` (string): Command to execute
    - `workingDir` (optional string): Working directory
  - Returns command output as text, or error message if execution fails

- **get_current_directory**
  - Get the current working directory of the server
  - Returns the current working directory path

- **set_current_directory**
  - Set the current working directory of the server
  - Inputs:
    - `path` (string): Path to set as current working directory
  - Returns confirmation message with the new directory path, or error message if the change fails

- **get_config**
  - Get the windows CLI server configuration
  - Returns the server configuration as a JSON string (excluding sensitive data)

- **validate_directories**
  - Check if specified directories are within allowed paths
  - Only available when `restrictWorkingDirectory` is enabled in configuration
  - Inputs:
    - `directories` (array of strings): List of directory paths to validate
  - Returns success message if all directories are valid, or error message detailing which directories are outside allowed paths

### Resources

- **cli://config**
  - Returns the main CLI server configuration (excluding sensitive data like blocked command details if security requires it).

## Security Considerations

This server allows external tools to execute commands on your system. Exercise extreme caution when configuring and using it.

### Built-in Security Features

- **Path Restrictions**: Commands can only be executed in specified directories (`allowedPaths`) if `restrictWorkingDirectory` is true. For WSL, this includes specific WSL paths and inherited/converted global paths. See "Advanced WSL Path Configuration" for details.
- **Command Blocking**: Defined commands and arguments are blocked to prevent potentially dangerous operations (`blockedCommands`, `blockedArguments`).
- **Injection Protection**: Common shell injection characters (`;`, `&`, `|`, `` ` ``) are blocked in command strings if `enableInjectionProtection` is true.
- **Timeout**: Commands are terminated if they exceed the configured timeout (`commandTimeout`).
- **Input validation**: All user inputs are validated before execution
- **Shell process management**: Processes are properly terminated after execution or timeout

### Configurable Security Features (Active by Default)

- **Working Directory Restriction (`restrictWorkingDirectory`)**: HIGHLY RECOMMENDED. Limits command execution to safe directories.
- **Injection Protection (`enableInjectionProtection`)**: Recommended to prevent bypassing security rules.

### Best Practices

- **Minimal Allowed Paths**: Only allow execution in necessary directories.
- **Restrictive Blocklists**: Block any potentially harmful commands or arguments.
- **Regularly Review Logs**: Check the command history for suspicious activity.
- **Keep Software Updated**: Ensure Node.js, npm, and the server itself are up-to-date.

## Using the MCP Inspector for Testing

Use the Inspector to interactively test this server with a custom config file. Pass any server flags after `--`:

```bash
# Inspect with built server and test config
npx @modelcontextprotocol/inspector -- node dist/index.js --config tests/config.json
```

## Development and Testing

This project requires **Node.js 18 or later**.
Install the dependencies and run the test suite with:

```bash
npm install
npm test
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.
