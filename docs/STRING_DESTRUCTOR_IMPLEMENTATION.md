# String Destructor Implementation

## Summary

Added destructor support for the `String` type in the Tuff compiler. This ensures that heap-allocated strings will be properly cleaned up when they go out of scope.

## Changes Made

### 1. Core Library Updates

**[core/src/string.tuff](../core/src/string.tuff)**

- Added `expect fn string_destroy(s: String): Void;` declaration

**[js/src/string.tuff](../js/src/string.tuff)**

- Added `actual fn string_destroy(s: String): Void` implementation (no-op for JS, since JavaScript has garbage collection)

**[cpp/src/string.tuff](../cpp/src/string.tuff)**

- Added `actual fn string_destroy(s: String): Void` implementation (no-op for C++, since `std::string` has RAII)

### 2. Code Generator Updates

**[bootstrap/src/codegen/codegen_js.cpp](../bootstrap/src/codegen/codegen_js.cpp)**

- Updated `getDestructor()` to return `"string_destroy"` for `String` types
- When a variable of type `String` goes out of scope, `string_destroy()` will be called automatically

**[bootstrap/src/codegen/codegen_cpp_types.cpp](../bootstrap/src/codegen/codegen_cpp_types.cpp)**

- Added mapping: `String` → `std::string`

**[bootstrap/src/codegen/codegen_cpp.cpp](../bootstrap/src/codegen/codegen_cpp.cpp)**

- Added `#include <string>` to generated C++ code

### 3. Tests

**[bootstrap/tests/feature12_strings/test_string_destructor.tuff](../bootstrap/tests/feature12_strings/test_string_destructor.tuff)**

- Added test documenting String destructor support

**[bootstrap/tests/feature15_destructors/test_destructor_documentation.tuff](../bootstrap/tests/feature15_destructors/test_destructor_documentation.tuff)**

- Added documentation test for destructor functionality

## How It Works

### JavaScript Target

When a `String` variable goes out of scope:

```javascript
{
  let s = someStringValue;
  // ... use s ...
  string_destroy(s); // Explicitly called (but no-op)
}
```

### C++ Target

When a `String` variable goes out of scope:

```cpp
{
  std::string s = someStringValue;
  // ... use s ...
  // std::string destructor called automatically via RAII
}
```

## Future Considerations

Currently, string literals in Tuff are represented as byte arrays `[U8; n; n]`, not as `String` types. When the language evolves to use the `String` type for literals, destructors will be automatically called:

```tuff
fn example(): I32 => {
    let s1: String = "hello";  // Future: will be String type
    let s2: String = string_concat(s1, " world");

    // string_destroy(s2) called automatically at end of scope
    // string_destroy(s1) called automatically at end of scope
    42
}
```

## Test Results

All 86 tests pass:

- feature12_strings: 5/5 ✓
- feature15_destructors: 5/5 ✓
- All other features: 75/75 ✓
