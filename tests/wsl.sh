#!/usr/bin/env bash
# Simple emulator for wsl.exe used in unit tests
# Supports optional "-d <instance>" argument then executes remaining command with bash

if [ "$1" = "-d" ]; then
  shift 2
fi

bash -c "$*"
