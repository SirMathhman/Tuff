# Tuff Quality Module

The quality module provides advanced code quality analysis, including structural clone detection.

## Clone Detection

The clone detection system is inspired by PMD's CPD (Copy-Paste Detector). It uses a **token-based approach** to find duplicated code patterns across a module.

### How It Works

1. **AST Serialization**: Each expression and statement is serialized into a sequence of "IR tokens" that capture the structural essence of the code, abstracting away identifiers and literals.

2. **Hash-Based Detection**: Consecutive token sequences are hashed using a rolling hash algorithm. Sequences with the same hash are potential clones.

3. **Clone Reporting**: When a token sequence appears more than the configured threshold, a warning is emitted suggesting the developer extract the duplicated code into a function.

### Debugging / Performance

If clone detection seems slow (or you just want visibility into what it's doing), run Fluff in debug mode:

- `npm run lint -- --debug`

This prints noisy per-module clone detection stats like:

- `[fluff:clone] tokens=... windowSize=... windows=... mapCap=...`
- `[fluff:clone] groups=... reported=...`

Notes:

- Clone detection currently scans a **fixed window size** of `cloneMinTokens` (rather than trying many window sizes).
- Parameterized clone detection (Type II clones) is currently **disabled by default** because it is very expensive.

### Configuration

Clone detection is controlled via `build.json`:

```json
{
  "fluff": {
    "cloneDetection": "off" | "warning" | "error",
    "cloneMinTokens": 10,       // Minimum IR tokens for a clone (default: 10)
    "cloneMinOccurrences": 2    // Minimum occurrences to report (default: 2)
  }
}
```

### IR Token Types

The serialization produces tokens like:

- `INT`, `BOOL`, `STRING` — literal types
- `IDENT` — identifier (name abstracted)
- `BINARY_ADD`, `BINARY_SUB`, etc. — operators
- `CALL_BEGIN`, `CALL_END` — function call delimiters
- `BLOCK_BEGIN`, `BLOCK_END` — block delimiters
- `LET`, `ASSIGN`, `RETURN` — statement types
- `IF`, `ELSE`, `MATCH`, `WHILE`, `LOOP` — control flow

### Example

Given this code:

```tuff
fn helper_a() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}

fn helper_b() : I32 => {
  let x = 1;
  let y = 2;
  let z = x + y;
  z
}
```

With `cloneDetection: "warning"` and `cloneMinTokens: 5`, the linter will emit:

```
warning: code clone detected: 10 IR tokens duplicated 2 times; consider extracting to a function
```

### Design Philosophy

- **Structural equivalence**: Two code blocks are clones if they have the same structure, regardless of identifier names or literal values.
- **Configurable sensitivity**: Adjust `cloneMinTokens` to control how large a clone must be to trigger a warning.
- **Non-blocking**: Clone warnings are informational by default; set to `"error"` to fail the build on clones.

## Module Files

| File                   | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `clone_detection.tuff` | AST serialization, hash-based clone finding, warning emission |

## Future Enhancements

- **Cross-file clone detection**: Detect clones across multiple files in a project
- **Parameterized clones**: Detect clones that differ only in specific values (Type II clones)
- **Clone suppression comments**: Allow `// tuff-ignore:clone` to suppress specific warnings
