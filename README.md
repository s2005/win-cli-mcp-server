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
  - [Configuration Structure](#configuration-structure)
  - [Configuration Locations](#configuration-locations)
  - [Default Configuration](#default-configuration)
  - [Configuration Settings](#configuration-settings)
- [API](#api)
  - [Tools](#tools)
  - [Resources](#resources)
- [Security Considerations](#security-considerations)
- [Using the MCP Inspector for Testing](#using-the-mcp-inspector-for-testing)
- [Development and Testing](#development-and-testing)
- [License](#license)

## Features

- **Multi-Shell Support**: Execute commands in PowerShell, Command Prompt (CMD), Git Bash, and WSL
- **Inheritance-Based Configuration**: Global defaults with shell-specific overrides
- **Shell-Specific Validation**: Each shell can have its own security settings and path formats
- **Flexible Path Management**: Different shells support different path formats (Windows/Unix/Mixed)
- **Resource Exposure**: View configuration and security settings as MCP resources
- **Explicit Working Directory State**: The server maintains an active working directory used when `execute_command` omits `workingDir`. If the launch directory isn't allowed, this state starts unset and must be set via `set_current_directory`.
- **Optional Initial Directory**: Configure `initialDir` to start the server in a specific directory.
- **Security Controls**:
  - Command blocking (full paths, case variations)
  - Working directory validation
  - Maximum command length limits
  - Smart argument validation
  - Shell-specific timeout settings
- **Configurable**:
  - Inheritance-based configuration system
  - Shell-specific security overrides
  - Dynamic tool descriptions based on enabled shells

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

### Configuration Setup

To get started with configuration:

1. **Use a sample configuration**:
   - Copy `config.sample.json` for basic setup
   - Copy `config.development.json` for development environments
   - Copy `config.secure.json` for high-security environments

2. **Create your own configuration**:

   ```bash
   # Copy and customize a sample
   cp config.sample.json my-config.json
   
   # Or generate a default config
   npx @simonb97/server-win-cli --init-config ./my-config.json
   ```

3. **Update your Claude Desktop configuration** to use your config file:

   ```json
   {
     "mcpServers": {
       "windows-cli": {
         "command": "npx",
         "args": [
           "-y",
           "@simonb97/server-win-cli",
           "--config",
           "./my-config.json"
         ]
       }
     }
   }
   ```

After configuring, you can:

- Execute commands directly using the available tools
- View server configuration and security settings in the Resources section
- Access shell-specific configurations and capabilities

## Configuration

The server uses an inheritance-based configuration system where global defaults can be overridden by shell-specific settings.

### Configuration Structure

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown"],
      "blockedArguments": ["--exec", "-e"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["/home/user", "/tmp"],
      "initialDir": "/home/user"
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 45
        },
        "restrictions": {
          "blockedCommands": ["Remove-Item", "Format-Volume"]
        }
      }
    },
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true,
        "pathMapping": {
          "enabled": true,
          "windowsToWsl": true
        }
      }
    }
  }
}
```

### Configuration Locations

The server looks for configuration files in the following order:

1. Path specified via `--config` command line argument
2. `win-cli-mcp.config.json` in the current working directory
3. `~/.win-cli-mcp/config.json` in user's home directory

If no configuration file is found, the server will use a default (restricted) configuration.

### Default Configuration

**Note**: The default configuration is designed to be restrictive and secure. Find more details on each setting in the [Configuration Settings](#configuration-settings) section.

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        "rm", "del", "rmdir", "format", "shutdown", "restart",
        "reg", "regedit", "net", "netsh", "takeown", "icacls"
      ],
      "blockedArguments": [
        "--exec", "-e", "/c", "-enc", "-encodedcommand",
        "-command", "--interactive", "-i", "--login", "--system"
      ],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["~", "."],
      "initialDir": null,
      "restrictWorkingDirectory": true
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    }
  }
}
```

### Configuration Settings

The configuration file uses an inheritance system with two main sections: `global` and `shells`.

#### Global Settings

Global settings provide defaults that apply to all shells unless overridden.

##### Security Settings

```json
{
  "global": {
    "security": {
      // Maximum allowed length for any command
      "maxCommandLength": 2000,
      
      // Command execution timeout in seconds
      "commandTimeout": 30,
      
      // Enable protection against command injection
      "enableInjectionProtection": true,
      
      // Restrict commands to allowed working directories
      "restrictWorkingDirectory": true
    }
  }
}
```

##### Restriction Settings

```json
{
  "global": {
    "restrictions": {
      // Commands to block - blocks both direct use and full paths
      "blockedCommands": ["rm", "format", "shutdown"],
      
      // Arguments to block across all commands
      "blockedArguments": ["--exec", "-e", "/c"],
      
      // Operators to block in commands
      "blockedOperators": ["&", "|", ";", "`"]
    }
  }
}
```

##### Path Settings

```json
{
  "global": {
    "paths": {
      // Directories where commands can be executed
      "allowedPaths": ["/home/user", "/tmp", "C:\\Users\\username"],
      
      // Initial working directory (null = use launch directory)
      "initialDir": "/home/user",
      
      // Whether to restrict working directories
      "restrictWorkingDirectory": true
    }
  }
}
```

#### Shell Configuration

Each shell can be individually configured and can override global settings.

##### Basic Shell Configuration

```json
{
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      }
    }
  }
}
```

##### Shell-Specific Overrides

```json
{
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-NoProfile", "-NonInteractive", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 45,
          "maxCommandLength": 3000
        },
        "restrictions": {
          "blockedCommands": ["Remove-Item", "Format-Volume"],
          "blockedOperators": ["|", "&"]
        }
      }
    }
  }
}
```

##### WSL Configuration

WSL shells have additional configuration options for path mapping:

```json
{
  "shells": {
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true,
        "pathMapping": {
          "enabled": true,
          "windowsToWsl": true
        }
      }
    }
  }
}
```

### Configuration Inheritance

The inheritance system works as follows:

1. **Global defaults** are applied to all shells
2. **Shell-specific overrides** replace or extend global settings
3. **Array settings** (like `blockedCommands`) are merged, not replaced
4. **Object settings** are deep-merged
5. **Primitive settings** are replaced

Example of inheritance in action:

```json
{
  "global": {
    "security": { "commandTimeout": 30 },
    "restrictions": { "blockedCommands": ["rm", "format"] }
  },
  "shells": {
    "powershell": {
      "overrides": {
        "security": { "commandTimeout": 45 },
        "restrictions": { "blockedCommands": ["Remove-Item"] }
      }
    }
  }
}
```

Results in PowerShell having:
- `commandTimeout`: 45 (overridden)
- `blockedCommands`: ["rm", "format", "Remove-Item"] (merged)

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

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:validation    # Path validation tests
npm run test:wsl          # WSL emulation tests
npm run test:integration  # Integration tests
npm run test:async        # Async operation tests

# Run tests with coverage
npm run test:coverage

# Debug open handles
npm run test:debug
```

### Cross-Platform Testing

The project uses a Node.js-based WSL emulator (`scripts/wsl-emulator.js`) to enable testing of WSL functionality on all platforms. This allows the test suite to run successfully on both Windows and Linux environments.

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
