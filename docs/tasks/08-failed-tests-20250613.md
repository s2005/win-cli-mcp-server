# Failing Test Cases (2025-06-13)

This document lists the Jest tests that were failing as of the latest run. These failures need to be addressed in future updates.

## Summary

- **4 test suites failed**
- **7 tests failed**

## Failed Tests

- **tests/server/toolHandlers.test.ts**
  - Tool Handlers set_current_directory tool validates against global allowed paths
- **tests/server/serverImplementation.test.ts**
  - CLIServer Implementation Command Execution with Context uses shell-specific timeout
  - CLIServer Implementation Command Execution with Context validates paths based on shell type
- **tests/integration/mcpProtocol.test.ts**
  - MCP Protocol Interactions should return configuration via get_config tool
  
- **tests/errorHandling.test.ts**
  - Error Handling should handle malformed JSON-RPC requests
  - Error Handling should recover from shell crashes

