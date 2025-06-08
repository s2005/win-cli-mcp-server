#!/usr/bin/env node

// WSL Emulator for cross-platform testing
// Mimics basic wsl.exe behavior for development and testing

import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

// Handle WSL list distributions command
if ((args.includes('-l') || args.includes('--list')) &&
    (args.includes('-v') || args.includes('--verbose'))) {
  console.log('NAME            STATE           VERSION');
  console.log('* Ubuntu-Test    Running         2');
  process.exit(0);
}

// Handle command execution with -e flag
if (args[0] === '-e') {
  if (args.length < 2) {
    console.error('Error: No command provided after -e flag.');
    console.error('Usage: wsl-emulator -e <command>');
    process.exit(1);
  }

  // Get the command and its arguments
  const command = args[1];
  const commandArgs = args.slice(2);

  // Special handling for test commands
  if (command === 'exit' && commandArgs.length === 1) {
    const exitCode = parseInt(commandArgs[0], 10);
    if (!isNaN(exitCode)) {
      process.exit(exitCode);
    }
  }

  // Execute the command
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, WSL_DISTRO_NAME: 'Ubuntu-Test' }
  });

  process.exit(result.status || 0);
}

// If no recognized command, show error
console.error('Error: Invalid arguments. Expected -e <command> OR --list --verbose');
console.error('Received:', args.join(' '));
process.exit(1);
