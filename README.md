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
- **Explicit Working Directory State**: The server maintains an active working directory used when `execute_command` omits `workingDir`. If the launch directory isn't allowed, this state starts unset and must be set via `set_current_directory`.
- **Optional Initial Directory**: Configure `initialDir` to start the server in a specific directory.
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
    "initialDir": null,
    "allowedPaths": ["User's home directory", "Current working directory"],
    "restrictWorkingDirectory": true,
    "commandTimeout": 30,
    "enableInjectionProtection": true,
    "includeDefaultWSL": false
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

    // Optional starting directory for the server
    "initialDir": null,

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
    }
  }
}
```

### WSL Configuration

WSL support is optional. The server includes WSL settings only when your `config.json` contains a `wsl` shell configuration or the `includeDefaultWSL` flag is set to `true` in the security section.

Enable the default WSL configuration:

```json
{
  "security": {
    "includeDefaultWSL": true
  }
}
```

Or provide custom WSL settings:

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"]
    }
  }
}
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
  - If `workingDir` is omitted, the command runs in the server's active working directory. If this has not been set, the tool returns an error.

- **get_current_directory**
  - Get the server's active working directory
  - If the directory is not set, returns a message explaining how to set it

- **set_current_directory**
  - Set the server's active working directory
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

- **Path Restrictions**: Commands can only be executed in specified directories (`allowedPaths`) if `restrictWorkingDirectory` is true.
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

## Development Environment using Dev Containers

This project includes a [Dev Container](https://code.visualstudio.com/docs/remote/containers) configuration, which allows you to use a Docker container as a fully-featured development environment. This ensures consistency and makes it easy to get started with development and testing.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.
- [Visual Studio Code](https://code.visualstudio.com/) installed.
- The [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) installed in VS Code.

### Getting Started

1. Clone this repository to your local machine.
2. Open the repository in Visual Studio Code.
3. When prompted "Reopen in Container", click the button. (If you don't see a prompt, you can open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and select "Dev Containers: Reopen in Container".)
4. VS Code will build the dev container image (as defined in `.devcontainer/devcontainer.json` and `Dockerfile`) and start the container. This might take a few minutes the first time.
5. Once the container is built and started, your VS Code will be connected to this environment. The `postCreateCommand` (`npm install`) will ensure all dependencies are installed.

### Running Tests

After opening the project in the dev container:

1. Open a new terminal in VS Code (it will be a terminal inside the container).
2. Run the tests using the command:

    ```bash
    npm test
    ```

This setup mirrors the environment used in GitHub Actions for tests, ensuring consistency between local development and CI.
