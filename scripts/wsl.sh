#!/usr/bin/env bash

# Initialize command_to_execute
command_to_execute=""

# Parse arguments
if [ "$1" == "-e" ]; then
  if [ -n "$2" ]; then
    # Collect all arguments after -e as the command
    shift # Remove -e
    command_to_execute="$@"
  else
    echo "Error: No command provided after -e flag." >&2
    echo "Usage: $0 -e <command>" >&2
    exit 1
  fi
else
  echo "Error: -e flag is missing." >&2
  echo "Usage: $0 -e <command>" >&2
  exit 1
fi

# Execute the command
eval "$command_to_execute"
exit_code=$?

# Exit with the executed command's exit code
exit $exit_code
