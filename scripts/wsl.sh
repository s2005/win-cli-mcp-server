#!/usr/bin/env bash

# Check for WSL list distributions command
# Handles common variations like 'wsl -l -v', 'wsl --list --verbose'
if [[ "$*" == *"-l"* && ( "$*" == *"-v"* || "$*" == *"--verbose"* ) ]] || \
   [[ "$*" == *"--list"* && ( "$*" == *"-v"* || "$*" == *"--verbose"* ) ]]; then
  echo "NAME            STATE           VERSION"
  echo "* Ubuntu-Test    Running         2" # Mock output for tests
  exit 0
fi

# Initialize command_to_execute
command_to_execute=""

# Parse arguments for -e (execute command)
if [ "$1" == "-e" ]; then
  if [ -n "$2" ]; then
    # Collect all arguments after -e as the command
    shift # Remove -e
    command_to_execute="$@"
  else
    echo "Error: No command provided after -e flag." >&2
    echo "Usage: $0 -e <command> OR $0 --list --verbose" >&2
    exit 1
  fi
else
  # If not a recognized list command and not -e, it's an error for this emulator.
  echo "Error: Invalid arguments. Expected -e <command> OR --list --verbose (or -l -v)." >&2
  echo "Received: $*" >&2
  exit 1
fi

# Execute the command if we reached here (meaning -e was processed)
if [ -n "$command_to_execute" ]; then
  eval "$command_to_execute"
  exit_code=$?
  # Exit with the executed command's exit code
  exit $exit_code
else
  # Should not happen if logic above is correct, but as a safeguard:
  echo "Error: Internal emulator error, command to execute was not set." >&2
  exit 126 # General error for shell script problems
fi
