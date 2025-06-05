# Unit Test Descriptions

This document summarizes the purpose of each unit test in the project.

## tests/commandChain.test.ts

- **allows cd within allowed path** – verifies that chained commands containing a `cd` to a directory under the allowed paths list do not throw an error when validated.
- **rejects cd to disallowed path** – ensures that attempting to `cd` into a directory outside the allowed paths causes validation to throw.
- **rejects relative cd escaping allowed path** – checks that using a relative `cd ..` to leave the permitted directory is blocked.
- **rejects blocked commands and arguments in chain** – confirms that blocked commands or arguments in a chained command cause validation to fail.

## tests/configNormalization.test.ts

- **loadConfig lower-cases and normalizes allowedPaths** – tests that loading configuration normalizes path casing and formats allowed paths consistently.
- **loadConfig fills missing security settings with defaults** – verifies that any security settings not supplied in the config file are populated with default values.

## tests/directoryValidator.test.ts

- **should return valid for directories within allowed paths** – validates that directories contained in the allowed list are accepted.
- **should return invalid for directories outside allowed paths** – checks that directories outside the whitelist are reported as invalid.
- **should handle a mix of valid and invalid directories** – ensures that only the directories outside the allowed paths are listed as invalid.
- **should handle GitBash style paths** – confirms that Unix-style paths like `/c/Users/...` are normalized and validated correctly.
- **should consider invalid paths that throw during normalization** – tests that paths causing normalization errors are treated as invalid.
- **should not throw for valid directories** – verifies that the throwing validator passes silently when all directories are allowed.
- **should throw McpError for invalid directories** – checks that a custom error is thrown when invalid directories are found.
- **should include invalid directories in error message** – ensures the thrown error lists each offending directory and allowed paths for clarity.
- **should use singular wording for a single invalid directory** – tests that the error message uses singular phrasing when only one directory is invalid.
- **should handle empty directories array** – confirms that validating an empty list of directories succeeds.
- **should handle empty allowed paths array** – ensures that an empty allowed path configuration results in an error when validating directories.

## tests/getConfig.test.ts

- **createSerializableConfig returns structured configuration** – verifies that `createSerializableConfig` produces a plain object without functions and with the expected fields from the configuration.
- **createSerializableConfig returns consistent config structure** – checks that the structure of the serialized config always contains the necessary keys for security and shell settings.
- **get_config tool response format** – ensures the response format produced by the configuration tool is correctly shaped and contains the serialized config.

## tests/toolDescription.test.ts

- **generates correct description with all shells enabled** – checks that the tool description lists every enabled shell and includes example blocks for each.
- **generates correct description with only cmd enabled** – verifies that the description includes only the CMD example when other shells are disabled.
- **generates correct description with powershell and gitbash enabled** – ensures that only the relevant examples for enabled shells are present.
- **handles empty allowed shells array** – confirms that an empty shell list results in a minimal description without examples.
- **handles unknown shell names** – tests that unrecognized shell names appear in the header but no examples are generated.

## tests/validation.test.ts

- **extractCommandName handles various formats** – covers numerous command string formats to make sure only the executable name is returned.
- **extractCommandName is case insensitive** – validates that command extraction works regardless of case.
- **isCommandBlocked identifies blocked commands** – ensures commands in the blocked list are detected even with paths or extensions.
- **isCommandBlocked is case insensitive** – checks detection of blocked commands independent of case.
- **isCommandBlocked handles different extensions** – tests blocked command detection across `.cmd`, `.bat`, and other extensions.
- **isArgumentBlocked identifies blocked arguments** – verifies arguments in the blocked list are found.
- **isArgumentBlocked is case insensitive for security** – ensures argument checks are case insensitive.
- **isArgumentBlocked handles multiple arguments** – confirms any blocked argument in a list triggers detection.
- **parseCommand handles basic commands** – parses simple commands and ensures arguments are split properly.
- **parseCommand handles quoted arguments** – supports arguments wrapped in quotes.
- **parseCommand handles paths with spaces** – validates parsing when the executable path contains spaces.
- **parseCommand handles empty input** – returns empty command and args when given whitespace.
- **parseCommand handles mixed quotes** – supports quotes with embedded spaces and key=value pairs.
- **normalizeWindowsPath handles various formats** – converts a mix of Windows, Unix, and UNC style paths into canonical Windows format.
- **normalizeWindowsPath removes redundant separators** – collapses duplicate slashes and backslashes.
- **normalizeWindowsPath resolves relative segments** – resolves `..` segments in Windows style paths.
- **normalizeWindowsPath resolves git bash style relative segments** – handles `/c/../` style paths used by Git Bash.
- **normalizeWindowsPath handles drive-relative paths** – normalizes paths like `C:folder/file`.
- **removes duplicates and normalizes paths** – ensures normalization removes duplicate allowed paths.
- **removes nested subpaths** – verifies that nested allowed paths are collapsed to the parent path.
- **keeps multiple top-level paths** – multiple unrelated allowed paths remain after normalization.
- **isPathAllowed validates paths correctly** – checks standard cases of allowed and disallowed path validation.
- **isPathAllowed handles trailing slashes correctly** – ensures trailing slashes in either path do not affect validation.
- **isPathAllowed is case insensitive** – path checking disregards letter case.
- **isPathAllowed supports UNC paths** – validates UNC network paths.
- **validateWorkingDirectory throws for invalid paths** – ensures relative or disallowed working directories are rejected.
- **validateShellOperators blocks dangerous operators** – verifies that blocked shell operators cause validation failure.
- **validateShellOperators allows safe operators when configured** – ensures allowed operators do not throw.
- **validateShellOperators respects shell config** – checks that shell-specific operator settings are honored.

