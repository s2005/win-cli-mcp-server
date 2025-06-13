# Failing Test Cases (2025-06-13)

This document lists the Jest tests that were failing as of the latest run. These failures need to be addressed in future updates.

## Summary

- **8 test suites failed**
- **18 tests failed**

## Failed Tests

- **tests/validation/pathValidation.test.ts**
  - Path Validation validateWorkingDirectory handles empty allowed paths
- **tests/server/toolHandlers.test.ts**
  - Tool Handlers set_current_directory tool validates against global allowed paths
- **tests/server/serverImplementation.test.ts**
  - CLIServer Implementation Command Execution with Context uses shell-specific timeout
  - CLIServer Implementation Command Execution with Context validates paths based on shell type
- **tests/integration/mcpProtocol.test.ts**
  - MCP Protocol Interactions should return configuration via get_config tool
- **tests/wsl.test.ts**
  - WSL Working Directory Validation (Test 5) Test 5.1: Valid WSL working directory (/mnt/c/tad/sub)
  - WSL Working Directory Validation (Test 5) Test 5.1.1: Valid WSL working directory (/tmp)
  - WSL Working Directory Validation (Test 5) Test 5.2: Invalid WSL working directory (not in allowedPaths - /mnt/d/forbidden)
  - WSL Working Directory Validation (Test 5) Test 5.3: Invalid WSL working directory (valid prefix, not directory containment - /mnt/c/tad_plus_suffix)
  - WSL Working Directory Validation (Test 5) Test 5.4: Invalid WSL working directory (pure Linux path not allowed - /usr/local)
- **tests/processManagement.test.ts**
  - Process Management should handle process spawn errors gracefully
  - Process Management should propagate shell process errors
- **tests/getConfig.test.ts**
  - get_config tool createSerializableConfig returns structured configuration
  - get_config tool createSerializableConfig returns consistent config structure
  - get_config tool createSerializableConfig handles empty shells config
  - get_config tool get_config tool response format
- **tests/errorHandling.test.ts**
  - Error Handling should handle malformed JSON-RPC requests
  - Error Handling should recover from shell crashes

