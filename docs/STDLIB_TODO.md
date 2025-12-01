# Standard Library TODO

Requirements for Stage 1 self-hosting compiler implementation.

## String Operations

- `charAt(index: USize): U8` - Get character at index
- `substring(start: USize, end: USize): String` - Extract substring
- `indexOf(needle: String): I32` - Find first occurrence (-1 if not found)
- `length(): USize` - Get string length
- `equals(other: String): Bool` - String comparison
- `concat(other: String): String` - String concatenation
- `startsWith(prefix: String): Bool` - Check prefix
- `endsWith(suffix: String): Bool` - Check suffix
- `toI32(): I32` - Parse string to integer
- `fromI32(value: I32): String` - Convert integer to string

## Collections

### Vector<T>

- `new(): Vector<T>` - Create empty vector
- `push(value: T): Void` - Append element
- `pop(): T` - Remove and return last element
- `get(index: USize): T` - Get element at index
- `set(index: USize, value: T): Void` - Set element at index
- `length(): USize` - Get vector length
- `capacity(): USize` - Get allocated capacity
- `clear(): Void` - Remove all elements

### HashMap<K, V>

- `new(): HashMap<K, V>` - Create empty map
- `insert(key: K, value: V): Void` - Insert key-value pair
- `get(key: K): V | Void` - Get value by key (or Void if not found)
- `contains(key: K): Bool` - Check if key exists
- `remove(key: K): Void` - Remove key-value pair
- `length(): USize` - Get number of entries
- `clear(): Void` - Remove all entries

## File I/O

- `readFile(path: String): String` - Read entire file to string
- `writeFile(path: String, content: String): Void` - Write string to file
- `fileExists(path: String): Bool` - Check if file exists

## Error Handling

### Result<T, E>

- Union type: `type Result<T, E> = Ok(T) | Err(E)`
- Use with pattern matching via `is` operator

### Option<T>

- Union type: `type Option<T> = Some(T) | None`
- For nullable values

## Memory & Allocation

- Already have: pointers, arrays, ownership, lifetimes
- Need: `malloc(size: USize): *mut U8` - Allocate memory
- Need: `free(ptr: *mut U8): Void` - Free memory
- Consider: Reference counting helpers

## Utility

- `exit(code: I32): Void` - Already exists as extern
- `panic(message: String): Void` - Print error and exit
- `assert(condition: Bool, message: String): Void` - Runtime assertion
- `print(message: String): Void` - Print to stdout (already exists)
- `println(message: String): Void` - Print with newline

## Priority for Lexer

**Minimum to implement lexer:**

1. Vector<Token> - Store token list dynamically
2. String charAt/substring - Parse source character by character
3. HashMap<String, TokenType> - Keyword lookup table
4. panic() - Error reporting

**Can defer:**

- File I/O (bootstrap compiler reads file, passes string)
- Complex string operations (work around with manual loops)
- Result/Option (use exit() for now)
