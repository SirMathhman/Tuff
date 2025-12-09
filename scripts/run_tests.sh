#!/usr/bin/env bash
set -euo pipefail

CC=${CC:-clang}
if ! command -v "$CC" >/dev/null 2>&1; then
  echo "$CC not found, trying gcc"
  CC=gcc
fi

OUT=run_tests
SRC=src/interpret.c
TESTS=tests/test_interpret.c
UNITY=tests/vendor/unity.c

echo "Using compiler: $CC"
echo "Compiling tests"
$CC -std=c99 -Wall -Wextra -Werror -O0 -g -o "$OUT" "$TESTS" "$SRC" "$UNITY"
echo "Running tests"
./"$OUT"
