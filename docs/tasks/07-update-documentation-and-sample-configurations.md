# Task: Update Documentation and Sample Configurations

## Overview and Problem Statement

All project documentation and sample configurations are written for the legacy flat configuration structure. With the new inheritance-based configuration system, users need updated documentation, migration guides, and sample configurations that demonstrate the new features and best practices.

### Current Issues

- README shows old configuration format
- No migration guide for existing users
- Sample configurations use flat structure
- No examples of shell-specific overrides
- Missing documentation for new features (inheritance, WSL config, etc.)

## Technical Implementation Details

### 1. Update README.md

Update the main README.md file with new configuration structure:

```markdown
# Windows CLI MCP Server

[Keep existing badges and introduction]

## Features

- **Multi-Shell Support**: Execute commands in PowerShell, Command Prompt (CMD), Git Bash, and WSL
- **Inheritance-Based Configuration**: Global defaults with shell-specific overrides
- **Shell-Specific Validation**: Each shell can have its own security settings and path formats
- **Flexible Path Management**: Different shells support different path formats (Windows/Unix/Mixed)
- **Resource Exposure**: View configuration and security settings as MCP resources
- [Keep other existing features]

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
      "blockedArguments": ["--system"],
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\YourUsername", "D:\\Projects"],
      "initialDir": "C:\\Users\\YourUsername"
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 60  // Override global timeout
        },
        "restrictions": {
          "blockedCommands": ["del", "rd"]  // Additional commands
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
        "inheritGlobalPaths": true
      },
      "overrides": {
        "paths": {
          "allowedPaths": ["/home/user", "/tmp"]  // Unix paths
        }
      }
    }
  }
}
```

### Key Concepts

#### Global Configuration

- **security**: Default security settings for all shells
- **restrictions**: Default blocked commands, arguments, and operators
- **paths**: Default allowed paths and initial directory

#### Shell Configuration

- **executable**: Shell command and arguments
- **overrides**: Shell-specific settings that override global defaults
- **wslConfig**: Special configuration for WSL (mount points, path inheritance)

#### Configuration Merging

- Security settings: Shell values override global values
- Blocked commands/arguments: Shell lists are appended to global lists
- Blocked operators: Shell list replaces global list
- Allowed paths: Shell paths replace global paths entirely

### Migration from Legacy Configuration

If you have an existing configuration, it will be automatically migrated. See the [Migration Guide](docs/MIGRATION_GUIDE.md) for details.

### Shell-Specific Features

#### Windows Shells (CMD, PowerShell)

- Use Windows path format: `C:\\Users\\...`
- Support Windows-specific commands
- Can have longer command timeouts for batch operations

#### WSL (Windows Subsystem for Linux)

- Uses Unix path format: `/home/user`, `/mnt/c/...`
- Can inherit global Windows paths (converted to `/mnt/...`)
- Supports Linux-specific commands and arguments

#### Git Bash

- Accepts both path formats: `C:\\...` or `/c/...`
- Hybrid Windows/Unix environment

[Continue with existing sections, updating examples to use new format]

### 2. Create Migration Guide

Create `docs/MIGRATION_GUIDE.md`:

# Migration Guide: From Flat to Inheritance-Based Configuration

## Overview

Version 2.0 introduces an inheritance-based configuration system that provides better flexibility and shell-specific customization. Your existing configuration will be automatically migrated, but understanding the new structure will help you take advantage of new features.

## What's Changed

### Configuration Structure

#### Before (Flat Structure)

```json
{
  "security": {
    "maxCommandLength": 2000,
    "blockedCommands": ["rm", "del"],
    "blockedArguments": ["--exec"],
    "allowedPaths": ["C:\\Users\\Me"],
    "restrictWorkingDirectory": true,
    "commandTimeout": 30,
    "enableInjectionProtection": true
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"],
      "blockedOperators": ["&", "|"]
    },
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "blockedOperators": ["&", "|", ";"],
      "allowedPaths": ["/home/user"],
      "wslMountPoint": "/mnt/",
      "inheritGlobalPaths": true
    }
  }
}
```

#### After (Inheritance-Based Structure)

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
      "blockedCommands": ["rm", "del"],
      "blockedArguments": ["--exec"],
      "blockedOperators": ["&", "|"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\Me"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
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
        "inheritGlobalPaths": true
      },
      "overrides": {
        "restrictions": {
          "blockedOperators": ["&", "|", ";"]
        },
        "paths": {
          "allowedPaths": ["/home/user"]
        }
      }
    }
  }
}
```

## Automatic Migration

When you start the server with an old configuration:

1. The server detects the legacy format
2. Automatically converts it to the new format
3. Logs a warning suggesting you update your config file
4. Continues operating normally

## Key Differences

### 1. Hierarchical Structure

- Global defaults under `global` key
- Shell-specific overrides under `shells.<shell>.overrides`

### 2. Separated Concerns

- Security settings (timeout, max length, etc.)
- Restrictions (blocked items)
- Paths (allowed directories)

### 3. Shell Configuration

- `command` and `args` now under `executable`
- WSL-specific settings under `wslConfig`
- Overrides clearly separated

### 4. Merging Behavior

| Setting Type | Merge Strategy |
|-------------|----------------|
| Security settings | Override (shell replaces global) |
| Blocked commands | Append (shell adds to global) |
| Blocked arguments | Append (shell adds to global) |
| Blocked operators | Replace (shell replaces global) |
| Allowed paths | Replace (shell replaces global) |

## Migration Examples

### Example 1: Simple CMD Configuration

**Old:**

```json
{
  "security": {
    "blockedCommands": ["format", "del"]
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"]
    }
  }
}
```

**New:**

```json
{
  "global": {
    "restrictions": {
      "blockedCommands": ["format", "del"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    }
  }
}
```

### Example 2: Mixed Shell Configuration

**Old:**

```json
{
  "security": {
    "allowedPaths": ["C:\\Work"],
    "commandTimeout": 30
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "command": "cmd.exe",
      "args": ["/c"]
    },
    "wsl": {
      "enabled": true,
      "command": "wsl.exe",
      "args": ["-e"],
      "allowedPaths": ["/home/work"]
    }
  }
}
```

**New:**

```json
{
  "global": {
    "security": {
      "commandTimeout": 30
    },
    "paths": {
      "allowedPaths": ["C:\\Work"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    },
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "overrides": {
        "paths": {
          "allowedPaths": ["/home/work"]
        }
      }
    }
  }
}
```

## Taking Advantage of New Features

### 1. Shell-Specific Timeouts

```json
{
  "global": {
    "security": {
      "commandTimeout": 30  // Default for all shells
    }
  },
  "shells": {
    "wsl": {
      "overrides": {
        "security": {
          "commandTimeout": 120  // WSL commands can take longer
        }
      }
    }
  }
}
```

### 2. Different Security Levels

```json
{
  "shells": {
    "cmd": {
      "overrides": {
        "security": {
          "enableInjectionProtection": true  // Strict for CMD
        }
      }
    },
    "gitbash": {
      "overrides": {
        "security": {
          "enableInjectionProtection": false  // Relaxed for Git Bash
        }
      }
    }
  }
}
```

### 3. Path Format Management

```json
{
  "global": {
    "paths": {
      "allowedPaths": ["C:\\Projects", "D:\\Work"]  // Windows paths
    }
  },
  "shells": {
    "wsl": {
      "wslConfig": {
        "inheritGlobalPaths": true  // Converts to /mnt/c/Projects, /mnt/d/Work
      },
      "overrides": {
        "paths": {
          "allowedPaths": ["/home/user"]  // Additional Unix paths
        }
      }
    }
  }
}
```

## Troubleshooting

### Configuration Not Loading

- Check JSON syntax
- Ensure file encoding is UTF-8
- Verify file permissions

### Unexpected Behavior

- Use `get_config` tool to see resolved configuration
- Check `cli://config/shells/<shell>` resource for effective settings
- Review merge strategies above

### Performance Issues

- Shell-specific timeouts may need adjustment
- Consider reducing `maxCommandLength` for better validation performance

## Best Practices

1. **Start with Global Defaults**: Set common settings globally
2. **Override Sparingly**: Only override what's different for specific shells
3. **Use Appropriate Paths**: Windows paths for Windows shells, Unix paths for WSL
4. **Test Each Shell**: Verify settings with `get_config` tool
5. **Document Overrides**: Comment why specific overrides are needed

### 3. Update Sample Configurations

Update `config.sample.json`:

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
      "blockedOperators": ["&", "|", ";", "`"]
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\YourUsername", "C:\\Projects"],
      "initialDir": "C:\\Users\\YourUsername"
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
          "commandTimeout": 60
        },
        "restrictions": {
          "blockedCommands": ["Invoke-Expression", "iex"]
        }
      }
    },
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": ["del", "rd", "rmdir"]
        }
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": ["rm -rf", "chmod 777"],
          "blockedOperators": ["&", "|", ";", "`", "$(", "||", "&&"]
        }
      }
    }
  }
}
```

### 4. Create Specialized Sample Configurations

Create `config.examples/minimal.json`:

```json
{
  "global": {
    "security": {
      "restrictWorkingDirectory": false,
      "enableInjectionProtection": true
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    }
  }
}
```

Create `config.examples/development.json`:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 5000,
      "commandTimeout": 120,
      "enableInjectionProtection": false,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown"],
      "blockedArguments": ["--system"],
      "blockedOperators": []
    },
    "paths": {
      "allowedPaths": ["C:\\Dev", "D:\\Projects"],
      "initialDir": "C:\\Dev"
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "pwsh.exe",
        "args": ["-NoProfile", "-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 300
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
      },
      "overrides": {
        "security": {
          "commandTimeout": 600
        },
        "paths": {
          "allowedPaths": ["/home/dev", "/var/www", "/opt"]
        }
      }
    }
  }
}
```

Create `config.examples/production.json`:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 500,
      "commandTimeout": 10,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [
        "format", "del", "rm", "rmdir", "rd",
        "shutdown", "restart", "reboot",
        "reg", "regedit", "regedt32",
        "net", "netsh", "netstat",
        "taskkill", "tasklist",
        "sc", "wmic",
        "bcdedit", "diskpart",
        "cipher", "sfc",
        "powershell", "pwsh", "cmd", "bash", "sh"
      ],
      "blockedArguments": [
        "--exec", "-e", "/c", "-c",
        "-enc", "-encodedcommand",
        "-command", "-file",
        "--interactive", "-i",
        "--login", "-l",
        "--system", "-s",
        "--force", "-f",
        "--recursive", "-r", "-rf"
      ],
      "blockedOperators": ["&", "|", ";", "`", "$(", "||", "&&", ">", ">>", "<"]
    },
    "paths": {
      "allowedPaths": ["C:\\SafeScripts"],
      "initialDir": "C:\\SafeScripts"
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "maxCommandLength": 200
        },
        "restrictions": {
          "blockedCommands": ["*"]
        }
      }
    }
  }
}
```

### 5. Create Configuration Examples Documentation

Create `docs/CONFIGURATION_EXAMPLES.md`:

```markdown
# Configuration Examples

This document provides configuration examples for common scenarios.

## Table of Contents
- [Minimal Configuration](#minimal-configuration)
- [Development Environment](#development-environment)
- [Production Environment](#production-environment)
- [Multi-Shell Setup](#multi-shell-setup)
- [WSL-Focused Configuration](#wsl-focused-configuration)
- [Security-First Configuration](#security-first-configuration)

## Minimal Configuration

For basic CMD usage with minimal restrictions:

```json
{
  "global": {
    "security": {
      "restrictWorkingDirectory": false,
      "enableInjectionProtection": true
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      }
    }
  }
}
```

## Development Environment

Relaxed security for development work:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 5000,
      "commandTimeout": 300,
      "enableInjectionProtection": false,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["format", "shutdown"],
      "blockedArguments": [],
      "blockedOperators": []
    },
    "paths": {
      "allowedPaths": [
        "C:\\Development",
        "D:\\Projects",
        "C:\\Users\\Developer"
      ]
    }
  },
  "shells": {
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "pwsh.exe",
        "args": ["-NoProfile", "-Command"]
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "C:\\Program Files\\Git\\bin\\bash.exe",
        "args": ["-c"]
      }
    },
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e"]
      },
      "wslConfig": {
        "inheritGlobalPaths": true
      },
      "overrides": {
        "paths": {
          "allowedPaths": ["/home/developer", "/var/www"]
        }
      }
    }
  }
}
```

## Production Environment

Highly restrictive configuration for production:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 200,
      "commandTimeout": 5,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": ["*"],
      "blockedArguments": ["*"],
      "blockedOperators": ["&", "|", ";", "`", "$(", ">", "<"]
    },
    "paths": {
      "allowedPaths": ["C:\\ApprovedScripts"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "restrictions": {
          "blockedCommands": [
            "dir", "echo", "type", "findstr"
          ]
        }
      }
    }
  }
}
```

## Multi-Shell Setup

Different security levels for different shells:

```json
{
  "global": {
    "security": {
      "commandTimeout": 30,
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": ["C:\\Work"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "security": {
          "enableInjectionProtection": true,
          "maxCommandLength": 500
        }
      }
    },
    "powershell": {
      "enabled": true,
      "executable": {
        "command": "powershell.exe",
        "args": ["-Command"]
      },
      "overrides": {
        "security": {
          "commandTimeout": 60,
          "maxCommandLength": 2000
        },
        "restrictions": {
          "blockedCommands": ["Invoke-Expression", "iex"]
        }
      }
    },
    "gitbash": {
      "enabled": true,
      "executable": {
        "command": "bash.exe",
        "args": ["-c"]
      },
      "overrides": {
        "security": {
          "enableInjectionProtection": false
        },
        "paths": {
          "allowedPaths": ["C:\\Work", "/c/Work"]
        }
      }
    }
  }
}
```

## WSL-Focused Configuration

Primarily using WSL with path mapping:

```json
{
  "global": {
    "security": {
      "restrictWorkingDirectory": true
    },
    "paths": {
      "allowedPaths": ["C:\\Users\\Linux", "D:\\LinuxProjects"]
    }
  },
  "shells": {
    "wsl": {
      "enabled": true,
      "executable": {
        "command": "wsl.exe",
        "args": ["-e", "bash"]
      },
      "wslConfig": {
        "mountPoint": "/mnt/",
        "inheritGlobalPaths": true,
        "pathMapping": {
          "enabled": true,
          "windowsToWsl": true
        }
      },
      "overrides": {
        "security": {
          "commandTimeout": 120
        },
        "restrictions": {
          "blockedCommands": ["sudo", "su"],
          "blockedArguments": ["--privileged"]
        },
        "paths": {
          "allowedPaths": [
            "/home/user",
            "/tmp",
            "/var/log"
          ]
        }
      }
    }
  }
}
```

## Security-First Configuration

Maximum security with allowlist approach:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 100,
      "commandTimeout": 3,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": true
    },
    "restrictions": {
      "blockedCommands": [],
      "blockedArguments": [],
      "blockedOperators": ["&", "|", ";", "`", "$(", ">", "<", ">>", "||", "&&"]
    },
    "paths": {
      "allowedPaths": ["C:\\Scripts\\Approved"]
    }
  },
  "shells": {
    "cmd": {
      "enabled": true,
      "executable": {
        "command": "cmd.exe",
        "args": ["/c"]
      },
      "overrides": {
        "restrictions": {
          "allowedCommands": [
            "echo",
            "type C:\\Scripts\\Approved\\*.txt",
            "dir C:\\Scripts\\Approved"
          ]
        }
      }
    }
  }
}
```

## Tips

1. **Start Simple**: Begin with a minimal configuration and add restrictions as needed
2. **Test Thoroughly**: Use the `get_config` tool to verify resolved settings
3. **Document Changes**: Comment your configuration to explain overrides
4. **Use Examples**: Copy and modify these examples for your needs
5. **Version Control**: Keep your configuration in version control

### 6. Update CLI Usage Documentation

Create `docs/CLI_USAGE.md`:

# CLI Usage Guide

## Working with Different Shells

### Path Formats

Each shell expects paths in specific formats:

#### Windows Shells (CMD, PowerShell)

```bash
# Correct
"workingDir": "C:\\Users\\Me\\Projects"
"workingDir": "D:\\Data"

# Incorrect (Unix format)
"workingDir": "/c/Users/Me/Projects"
```

#### WSL

```bash
# Correct
"workingDir": "/home/user"
"workingDir": "/mnt/c/Projects"

# Incorrect (Windows format)
"workingDir": "C:\\Projects"
```

#### Git Bash (Accepts Both)

```bash
# Both formats work
"workingDir": "C:\\Projects\\MyApp"
"workingDir": "/c/Projects/MyApp"
```

### Shell-Specific Commands

#### CMD Examples

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "cmd",
    "command": "dir /b *.txt",
    "workingDir": "C:\\Documents"
  }
}
```

#### PowerShell Examples

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "powershell",
    "command": "Get-ChildItem -Filter *.log | Select-Object -First 10",
    "workingDir": "C:\\Logs"
  }
}
```

#### WSL Examples

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "wsl",
    "command": "find /home/user -name '*.py' -type f",
    "workingDir": "/home/user"
  }
}
```

#### Git Bash Examples

```json
{
  "tool": "execute_command",
  "arguments": {
    "shell": "gitbash",
    "command": "git log --oneline -10",
    "workingDir": "/c/Projects/MyRepo"
  }
}
```

## Checking Configuration

### View Full Configuration

```json
{
  "tool": "get_config",
  "arguments": {}
}
```

### View Shell-Specific Settings

Access the resource `cli://config/shells/wsl` to see resolved WSL configuration.

### Validate Directories

#### Global Validation

```json
{
  "tool": "validate_directories",
  "arguments": {
    "directories": ["C:\\Test", "D:\\Projects"]
  }
}
```

#### Shell-Specific Validation

```json
{
  "tool": "validate_directories",
  "arguments": {
    "directories": ["/home/user", "/tmp"],
    "shell": "wsl"
  }
}
```

## Common Patterns

### Running Scripts

#### Windows Batch Script

```json
{
  "shell": "cmd",
  "command": "script.bat param1 param2",
  "workingDir": "C:\\Scripts"
}
```

#### PowerShell Script

```json
{
  "shell": "powershell",
  "command": ".\\script.ps1 -Param1 value1",
  "workingDir": "C:\\Scripts"
}
```

#### Bash Script

```json
{
  "shell": "wsl",
  "command": "./script.sh --option value",
  "workingDir": "/home/user/scripts"
}
```

### Working with Files

#### List Files (Cross-Shell)

```json
// CMD
{ "shell": "cmd", "command": "dir *.txt" }

// PowerShell
{ "shell": "powershell", "command": "Get-ChildItem *.txt" }

// WSL/Git Bash
{ "shell": "wsl", "command": "ls *.txt" }
```

#### Read File Content

```json
// CMD
{ "shell": "cmd", "command": "type file.txt" }

// PowerShell
{ "shell": "powershell", "command": "Get-Content file.txt" }

// WSL/Git Bash
{ "shell": "wsl", "command": "cat file.txt" }
```

## Troubleshooting

### Command Blocked

- Check shell-specific blocked commands
- Use `get_config` to see effective restrictions
- Some commands may be blocked globally, others per-shell

### Path Not Allowed

- Verify path format matches shell type
- Check shell-specific allowed paths
- Remember WSL paths are different from Windows paths

### Timeout Errors

- Different shells have different timeout settings
- Long-running commands may need shell-specific timeout overrides
- Check effective timeout in shell configuration

## Unit Test Requirements

### 1. Documentation Validation Tests

Create `tests/documentation/configExamples.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';
import { loadConfig } from '../../src/utils/config.js';
import fs from 'fs';
import path from 'path';

describe('Configuration Examples', () => {
  const examplesDir = path.join(process.cwd(), 'config.examples');
  
  // Get all example files
  const exampleFiles = fs.existsSync(examplesDir) 
    ? fs.readdirSync(examplesDir).filter(f => f.endsWith('.json'))
    : [];

  test.each(exampleFiles)('example %s is valid', (filename) => {
    const configPath = path.join(examplesDir, filename);
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Should parse without error
    expect(() => JSON.parse(configContent)).not.toThrow();
    
    // Should load without error
    expect(() => loadConfig(configPath)).not.toThrow();
    
    // Should have required structure
    const config = loadConfig(configPath);
    expect(config.global).toBeDefined();
    expect(config.shells).toBeDefined();
  });

  test('sample config is valid', () => {
    const samplePath = path.join(process.cwd(), 'config.sample.json');
    if (fs.existsSync(samplePath)) {
      expect(() => loadConfig(samplePath)).not.toThrow();
    }
  });

  test('all shells in examples have correct structure', () => {
    exampleFiles.forEach(filename => {
      const configPath = path.join(examplesDir, filename);
      const config = loadConfig(configPath);
      
      Object.entries(config.shells).forEach(([shellName, shell]) => {
        if (shell) {
          expect(shell.enabled).toBeDefined();
          expect(shell.executable).toBeDefined();
          expect(shell.executable.command).toBeDefined();
          expect(shell.executable.args).toBeInstanceOf(Array);
          
          // If overrides exist, check structure
          if (shell.overrides) {
            const { security, restrictions, paths } = shell.overrides;
            
            if (security) {
              Object.keys(security).forEach(key => {
                expect(['maxCommandLength', 'commandTimeout', 'enableInjectionProtection', 'restrictWorkingDirectory']).toContain(key);
              });
            }
            
            if (restrictions) {
              Object.keys(restrictions).forEach(key => {
                expect(['blockedCommands', 'blockedArguments', 'blockedOperators']).toContain(key);
              });
            }
            
            if (paths) {
              Object.keys(paths).forEach(key => {
                expect(['allowedPaths', 'initialDir']).toContain(key);
              });
            }
          }
        }
      });
    });
  });
});
```

### 2. Create Migration Validation Tests

Create `tests/documentation/migrationExamples.test.ts`:

```typescript
import { describe, test, expect } from '@jest/globals';
import { migrateLegacyConfig } from '../../src/utils/configMigration.js';

describe('Migration Guide Examples', () => {
  test('simple CMD configuration migrates correctly', () => {
    const legacy = {
      security: {
        blockedCommands: ["format", "del"]
      },
      shells: {
        cmd: {
          enabled: true,
          command: "cmd.exe",
          args: ["/c"]
        }
      }
    };

    const migrated = migrateLegacyConfig(legacy);
    
    expect(migrated.global.restrictions.blockedCommands).toEqual(["format", "del"]);
    expect(migrated.shells.cmd?.enabled).toBe(true);
    expect(migrated.shells.cmd?.executable.command).toBe("cmd.exe");
  });

  test('mixed shell configuration migrates correctly', () => {
    const legacy = {
      security: {
        allowedPaths: ["C:\\Work"],
        commandTimeout: 30,
        maxCommandLength: 2000,
        blockedCommands: [],
        blockedArguments: [],
        restrictWorkingDirectory: true,
        enableInjectionProtection: true
      },
      shells: {
        cmd: {
          enabled: true,
          command: "cmd.exe",
          args: ["/c"]
        },
        wsl: {
          enabled: true,
          command: "wsl.exe",
          args: ["-e"],
          allowedPaths: ["/home/work"]
        }
      }
    };

    const migrated = migrateLegacyConfig(legacy);
    
    expect(migrated.global.security.commandTimeout).toBe(30);
    expect(migrated.global.paths.allowedPaths).toEqual(["C:\\Work"]);
    expect(migrated.shells.wsl?.overrides?.paths?.allowedPaths).toEqual(["/home/work"]);
  });

  test('WSL configuration with mount point migrates correctly', () => {
    const legacy = {
      security: {
        maxCommandLength: 2000,
        blockedCommands: [],
        blockedArguments: [],
        allowedPaths: [],
        restrictWorkingDirectory: false,
        commandTimeout: 30,
        enableInjectionProtection: true
      },
      shells: {
        wsl: {
          enabled: true,
          command: "wsl.exe",
          args: ["-e"],
          wslMountPoint: "/custom/mount/",
          inheritGlobalPaths: false,
          allowedPaths: ["/home/user"]
        }
      }
    };

    const migrated = migrateLegacyConfig(legacy);
    
    expect(migrated.shells.wsl?.wslConfig?.mountPoint).toBe("/custom/mount/");
    expect(migrated.shells.wsl?.wslConfig?.inheritGlobalPaths).toBe(false);
    expect(migrated.shells.wsl?.overrides?.paths?.allowedPaths).toEqual(["/home/user"]);
  });
});
```

## Documentation Updates

### Additional Files to Create

1. **Create `docs/FAQ.md`**:
   - Common questions about the new configuration
   - Troubleshooting guide
   - Performance tips

2. **Create `docs/SECURITY_BEST_PRACTICES.md`**:
   - Security recommendations for each shell
   - Example restrictive configurations
   - Audit guidelines

3. **Update `CONTRIBUTING.md`**:
   - Guidelines for configuration contributions
   - Testing requirements for new features
   - Documentation standards

## Implementation Phases

### Phase 1: Core Documentation Updates

1. Update README with new configuration structure
2. Create comprehensive migration guide
3. Update main sample configuration

### Phase 2: Example Configurations

1. Create minimal, development, and production examples
2. Create shell-specific examples
3. Validate all examples load correctly

### Phase 3: Usage Documentation

1. Create CLI usage guide with shell examples
2. Document path format requirements
3. Add troubleshooting section

### Phase 4: Testing and Validation

1. Create tests for all example configurations
2. Validate migration examples
3. Ensure documentation accuracy

## Acceptance Criteria

### Functional Requirements

- [ ] README clearly explains new configuration structure
- [ ] Migration guide covers all common scenarios
- [ ] All example configurations are valid and load without errors
- [ ] CLI usage guide covers all shells with examples
- [ ] Path format requirements are clearly documented
- [ ] Security best practices are documented

### Technical Requirements

- [ ] All JSON examples are valid syntax
- [ ] Example configurations demonstrate key features
- [ ] Migration examples show before/after correctly
- [ ] No references to old configuration structure remain

### Testing Requirements

- [ ] All example configurations pass validation tests
- [ ] Migration examples correctly transform
- [ ] Documentation examples are tested
- [ ] No broken links in documentation

### Documentation Requirements

- [ ] Clear explanation of inheritance behavior
- [ ] Merge strategies documented with examples
- [ ] Shell-specific features highlighted
- [ ] Troubleshooting covers common issues

## Risk Assessment

### Technical Risks

1. **Risk**: Users confused by new structure
   - **Mitigation**: Comprehensive migration guide with examples

2. **Risk**: Invalid examples in documentation
   - **Mitigation**: Automated tests for all examples

3. **Risk**: Missing important migration scenarios
   - **Mitigation**: Community feedback and iterative updates

### Compatibility Risks

1. **Risk**: Users don't update configurations
   - **Mitigation**: Automatic migration with clear warnings

2. **Risk**: Third-party integrations break
   - **Mitigation**: Maintain backward compatibility period
