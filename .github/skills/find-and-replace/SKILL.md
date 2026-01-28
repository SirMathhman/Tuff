---
name: find-and-replace
description: This skill provides a command-line tool for performing regex-based find and replace operations across files and directories. It's useful for bulk refactoring, pattern updates, and consistent text replacements throughout the codebase.
---

## Tool Location

```
.github/skills/find-and-replace/find_and_replace.py
```

## Usage

### Basic Syntax

```bash
python3 .github/skills/find-and-replace/find_and_replace.py <path> <pattern> <replacement> [--dry-run]
```

### Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `path` | File path or directory path to process (recurses into directories) | `src/`, `docs/LANGUAGE.md`, `.` |
| `pattern` | Regex pattern to find (supports all Python `re` patterns) | `fn\s+(\w+)`, `T\?` |
| `replacement` | Replacement string (supports backreferences like `\1`, `\2`) | `fn \1`, `Option<\1>` |
| `--dry-run` | Optional flag to preview changes without modifying files | `--dry-run` |

### Examples

#### 1. Simple String Replacement

Replace all occurrences of `foo` with `bar` recursively:

```bash
python3 .github/skills/find-and-replace/find_and_replace.py . "foo" "bar"
```

#### 2. Regex Pattern with Backreference

Replace `T?` with `Option<T>`:

```bash
python3 .github/skills/find-and-replace/find_and_replace.py src "(\w+)\?" "Option<\1>"
```

#### 3. Replace in Single File

Replace `old_name` with `new_name` in one file:

```bash
python3 .github/skills/find-and-replace/find_and_replace.py docs/LANGUAGE.md "old_name" "new_name"
```

#### 4. Dry Run (Preview Only)

See what would be changed without actually modifying files:

```bash
python3 .github/skills/find-and-replace/find_and_replace.py . "const " "let " --dry-run
```

#### 5. Complex Regex Pattern

Replace function declarations with camelCase names to PascalCase (for type names):

```bash
python3 .github/skills/find-and-replace/find_and_replace.py src "type (\w+)\(" "type \u\1("
```

## Features

- ✅ Processes single files or entire directory trees
- ✅ Full regex support (backreferences, character classes, groups, etc.)
- ✅ Dry-run mode to preview changes before applying
- ✅ Detailed statistics and error reporting
- ✅ Handles both UTF-8 and fallback encoding
- ✅ Skips binary files automatically (.pyc, .exe, .zip, etc.)
- ✅ Preserves file encoding

## Output Example

```
⚠ [DRY RUN] src/lexer.ts (3 replacement(s))
⚠ [DRY RUN] src/parser.ts (5 replacement(s))
✓ src/analyzer.ts (2 replacement(s))

============================================================
Files processed: 15
Files modified: 3
Total replacements: 10
```

## When to Use

- **Refactoring**: Rename functions, variables, or types across the codebase
- **Type Updates**: Replace old type syntax with new syntax (e.g., `T?` → `Option<T>`)
- **Pattern Fixing**: Apply consistent formatting or naming conventions
- **API Changes**: Update function signatures or parameter names globally
- **Documentation Updates**: Batch replace outdated terms or examples

## Tips and Best Practices

1. **Always dry-run first**: Use `--dry-run` to preview changes before committing them
   ```bash
   python3 .github/skills/find-and-replace/find_and_replace.py . "pattern" "replacement" --dry-run
   ```

2. **Escape special regex characters**: Use backslashes for regex metacharacters
   ```bash
   # To find literal "T?", escape the "?"
   python3 .github/skills/find-and-replace/find_and_replace.py . "T\?" "Option<T>"
   ```

3. **Use backreferences for capture groups**: Capture patterns and reuse them in replacement
   ```bash
   # Capture word characters and reuse them
   python3 .github/skills/find-and-replace/find_and_replace.py . "fn\s+(\w+)" "function \1"
   ```

4. **Test on a subdirectory first**: If unsure, test on a smaller directory before running globally
   ```bash
   python3 .github/skills/find-and-replace/find_and_replace.py src/ "pattern" "replacement" --dry-run
   ```

5. **Remember to commit changes**: After successful replacements, commit the changes to git
   ```bash
   git add -A && git commit -m "refactor: apply find-and-replace updates"
   ```

## Limitations

- Binary files are automatically skipped
- Regex follows Python `re` module syntax (not PCRE)
- Files are processed in-memory, so very large files should be tested first
- No undo capability; use git to revert if needed
