#### Changelog

##### [Unreleased]

### Fixed
- Fixed path normalization for single backslash paths (e.g., `\\Users\\test`)
- Replaced bash-based WSL emulator with Node.js implementation for cross-platform compatibility
- Fixed directory validator error message test expectations
- Implemented proper WSL path validation for Linux-style paths
- Fixed integration and async test failures related to WSL execution
- Fixed WSL path handling to accept Windows drive paths for WSL shells

### Changed
- WSL tests now use Node.js emulator instead of bash script
- Improved error messages for directory validation
- Enhanced test configuration for better debugging

### Removed
- Removed deprecated `scripts/wsl.sh` bash emulator
