# Tuff

A simple arithmetic expression interpreter with arena-based memory management.

## Features

- **Arena allocator**: Custom memory allocator with leak detection
- **Expression interpreter**: Evaluates arithmetic expressions with `+`, `-`, `*`, `/`, parentheses, and unary operators
- **Leak detection**: Automatically detects memory leaks when arena is destroyed

## Building

Requires `clang` or `gcc`:

```bash
# Build and run tests
clang -Iinclude -Wall -Wextra -std=c11 -o test/interpret_test.exe src/interpret.c src/arena.c test/test_interpret.c
./test/interpret_test.exe

# Or use make (if available)
make test
```

## Usage

```c
#include "arena.h"
#include "interpret.h"

// Initialize the global arena
arena_init(1024);

// Interpret an expression
char *result = interpret("1 + 2 * 3");
printf("%s\n", result);  // prints "7"

// Track freed memory
arena_free(result, strlen(result) + 1);

// Cleanup arena (aborts if there are leaks)
arena_cleanup();
```

## API

### Arena (`arena.h`)

- `void arena_init(size_t capacity)` - Initialize the global arena
- `void *arena_alloc(size_t size)` - Allocate memory from the global arena
- `void arena_free(void *ptr, size_t size)` - Mark memory as freed (for leak tracking)
- `void arena_cleanup(void)` - Cleanup the global arena and abort if leaks detected

### Interpreter (`interpret.h`)

- `char *interpret(const char *expr)` - Evaluate arithmetic expression and return result as string

## Example Expressions

- `"1 + 2"` → `"3"`
- `"10 + 20 * 3"` → `"70"` (respects precedence)
- `"(2+3)*4"` → `"20"` (supports parentheses)
- `"7 - 5 / 2"` → `"5"` (integer division)
- `"-3 + 5"` → `"2"` (unary minus)
