# Tuff Programming Language

A statically-typed, compiled programming language that combines TypeScript's flexibility with C's performance, while guaranteeing memory safety through compile-time proofs.

## Status

🚧 **Bootstrap Phase** - Currently implementing the minimal bootstrap compiler in C.

The bootstrap compiler translates Tuff source code to C, which can then be compiled with any C compiler. As the language matures, we'll gradually replace C components with Tuff implementations.

## Building

### Prerequisites

- CMake 3.20 or later
- A C11 compiler (GCC, Clang, or MSVC)

### Build Steps

```bash
mkdir build
cd build
cmake ..
cmake --build .
```

This produces `tuffc` (or `tuffc.exe` on Windows) in the build directory.

## Usage

Compile a Tuff program to C:

```bash
tuffc input.tuff -o output.c -h output.h
```

Then compile the generated C code:

```bash
# With clang
clang output.c -o program

# With gcc
gcc output.c -o program

# With MSVC
cl output.c /Fe:program.exe
```

## Example

**hello.tuff:**
```tuff
fn main() : Void => {
    printf("Hello, Tuff!\n");
}
```

**Build and run:**
```bash
./build/tuffc tests/hello.tuff -o hello.c
clang hello.c -o hello
./hello
```

## Current Implementation

✅ **Lexer**: Complete tokenization of Tuff syntax
- Keywords, identifiers, numbers, strings, operators
- Line/block comments
- Hex/binary/octal number literals

🚧 **Parser**: In progress
🚧 **Type Checker**: In progress
🚧 **Code Generator**: Stub implementation

## Project Structure

```
Tuff/
├── CMakeLists.txt        # Build configuration
├── main.c                # Bootstrap compiler (single file)
├── tests/                # Test programs
│   └── hello.tuff
├── SPECIFICATION.md      # Full language specification
└── BOOTSTRAP.md          # Bootstrap subset and strategy
```

## Documentation

- [**SPECIFICATION.md**](SPECIFICATION.md) - Complete language specification
- [**BOOTSTRAP.md**](BOOTSTRAP.md) - Minimal feature set for self-hosting

## Roadmap

### Phase 1: Bootstrap Compiler (Current)
- [x] Lexer
- [ ] Parser
- [ ] Type checker
- [ ] C code generator

### Phase 2: Tuff Standard Library
- [ ] String, Vec, HashMap in Tuff
- [ ] File I/O wrappers
- [ ] Compile stdlib to C

### Phase 3: Incremental Migration
- [ ] Replace C utilities with Tuff versions
- [ ] Migrate parser to Tuff
- [ ] Migrate type checker to Tuff
- [ ] Migrate code generator to Tuff

### Phase 4: Self-Hosting
- [ ] Entire compiler written in Tuff
- [ ] Multi-generation stability testing

### Phase 5: Advanced Features
- [ ] Refinement types and compile-time proofs
- [ ] Generics
- [ ] Borrow checker
- [ ] LLVM backend
- [ ] JavaScript backend

## Contributing

The project is in early bootstrap phase. Contributions welcome once the basic compiler is functional!

## License

TBD

---

**Tuff**: **T**ype-safe, **U**nified, **F**ast, **F**lexible
