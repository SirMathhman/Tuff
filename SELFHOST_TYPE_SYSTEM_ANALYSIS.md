# Selfhost Compiler Type System Parsing Analysis

This document provides comprehensive context for implementing type system parsing in the selfhost compiler (`selfhost/tuffc.tuff`).

## 1. Bootstrap Compiler Type Parsing

### `parse_type_expr()` Function (src/parser.ts)

**Location:** Lines 680-738

**Function Signature:**

```typescript
private parseTypeExpr(): TypeExpr
```

**Logic:**
The parser builds TypeExpr AST nodes by:

1. **Tuple types** - `(T1, T2, ...)`

   - Opens with `(`, parses comma-separated TypeExpr items, closes with `)`
   - If followed by `=>`, becomes a function type instead

2. **Function types** - `(T1, T2, ...) => ReturnType`

   - After parsing tuple, checks for `=>` and parses return type
   - Result is `TypeFunction` with params and ret fields

3. **Slice types** - `*[T]`

   - Starts with `*`, followed by `[`, element type, `]`

4. **Array types** - `[T; init; len]`

   - Starts with `[`, element type, `;`, init count (number), `;`, length (number), `]`

5. **Named types with generics** - `Name<T1, T2, ...>`
   - Parses identifier as base TypeName
   - If followed by `<`, parses comma-separated generic arguments
   - Returns TypeGeneric wrapping the base

**AST Node Types Created:**

- `TypeName` - simple identifier like `I32`, `String`
- `TypeGeneric` - parameterized type like `Option<I32>`
- `TypeFunction` - function type like `(I32, String) => Bool`
- `TypeTuple` - tuple type like `(I32, String)`
- `TypeSlice` - slice type like `*[U8]`
- `TypeArray` - array type like `[U32; 3; 10]`

### Function Parameter Parsing (src/parser.ts)

**Location in `parseFnDecl()`: Lines 261-285**

```typescript
this.consume("lparen");
const params: ParamDecl[] = [];
while (!this.is("rparen") && !this.is("eof")) {
  const pStart = this.cur();
  const pName = this.consumeAnyIdent();
  let typeAnn: TypeExpr | undefined;
  if (this.is("colon")) {
    this.next();
    typeAnn = this.parseTypeExpr();
  }
  params.push(
    this.node("ParamDecl", pStart.start, this.prev().end, {
      name: pName.text,
      typeAnn,
    })
  );
  if (this.is("comma")) {
    this.next();
    continue;
  }
  break;
}
this.consume("rparen");
```

**Key Points:**

- Each parameter is: `identifier : TypeExpr`
- Type annotation is optional (not always present)
- Parameters are stored in `ParamDecl[]` array
- ParamDecl has `name: string` and `typeAnn?: TypeExpr`

### Return Type Parsing (src/parser.ts)

**Location in `parseFnDecl()`: Lines 287-291**

```typescript
let returnType: TypeExpr | undefined;
if (this.is("colon")) {
  this.next();
  returnType = this.parseTypeExpr();
}
```

**Key Points:**

- Return type comes after `)` in function signature
- Format: `)  : TypeExpr => body`
- Return type is optional

### Struct Field Parsing (Not yet in bootstrap, but in AST)

From `src/ast.ts`, structs would have fields with type annotations (not implemented yet in parser).

---

## 2. Current Selfhost Type Handling

### `skip_type_expr()` Function (selfhost/tuffc.tuff)

**Location:** Lines 1237-1260

```tuff
fn skip_type_expr(src, i) => {
  // Skip a type expression in places where we don't need semantics yet.
  // Stops before ',', ';', or '}' when not inside angle brackets.
  let mut k = skip_ws(src, i);
  let mut depth = 0;
  while (k < stringLen(src)) {
    let ch = stringCharCodeAt(src, k);
    if (ch == 60) { depth = depth + 1; k = k + 1; continue; } // '<'
    if (ch == 62) { // '>'
      if (depth > 0) { depth = depth - 1; }
      k = k + 1;
      continue;
    }
    if (depth == 0 && (ch == 44 || ch == 59 || ch == 125)) { yield k; } // ',', ';', '}'
    k = k + 1;
  }
  panic_at(src, k, "unterminated type")
}
```

**Purpose:** Skips past type expressions without parsing them semantically

- Tracks angle bracket depth to handle generics correctly
- Used when type syntax must be consumed but not interpreted
- Stops at comma, semicolon, or closing brace (at depth 0)

### `parse_param_list()` Function (selfhost/tuffc.tuff)

**Location:** Lines 1155-1179

```tuff
fn parse_param_list(src, i) => {
  // parses: '(' (ident (',' ident)*)? ')'
  let mut k = parse_keyword(src, i, "(");
  k = skip_ws(src, k);
  if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) { // ')'
    yield ParsedParams("", k + 1);
  }
  let mut out = "";
  let mut first = true;
  while (true) {
    let id = parse_ident(src, k);
    k = id.v1;
    if (first) { out = out + id.v0; } else { out = out + ", " + id.v0; }
    first = false;

    k = skip_ws(src, k);
    if (!(k < stringLen(src))) { panic_at(src, k, "expected ')' in param list"); }
    let c = stringCharCodeAt(src, k);
    if (c == 44) { // ','
      k = k + 1;
      continue;
    }
    if (c == 41) { // ')'
      yield ParsedParams(out, k + 1);
    }
    panic_at(src, k, "expected ',' or ')' in param list")
  }
  ParsedParams(out, k)
}
```

**Current Behavior:**

- **ONLY parses parameter names, NOT types**
- Format: `(ident, ident, ...)`
- Returns parameters as a comma-separated string
- **Does NOT handle type annotations** (e.g., `ident: Type`)

### `parse_fn_decl_named()` Function (selfhost/tuffc.tuff)

**Location:** Lines 995-1007

```tuff
fn parse_fn_decl_named(src, i, jsName, exportThis) => {
  let mut k = parse_keyword(src, i, "fn");
  let name = parse_ident(src, k);
  k = name.v1;
  let params = parse_param_list(src, k);
  k = params.v1;
  k = parse_keyword(src, k, "=>");
  let body = parse_main_body(src, k);
  k = body.v1;

  let exportKw = if (exportThis) "export " else "";
  let js = exportKw + "function " + jsName + "(" + params.v0 + ") {\n" + body.body + "return " + body.expr + ";\n}\n";
  ParsedFn(js, k, name.v0)
}
```

**Current Behavior:**

- Parses: `fn name(params) => body`
- **Does NOT parse return type annotation**
- Returns: `ParsedFn(js_code, position, function_name)`

### `parse_struct_decl()` Function (selfhost/tuffc.tuff)

**Location:** Lines 1262-1293

```tuff
fn parse_struct_decl(src, i) => {
  // struct Name { field: Type, ... }
  let mut k = parse_keyword(src, i, "struct");
  let name = parse_ident(src, k);
  k = name.v1;
  k = parse_keyword(src, k, "{");

  let fields = vec_new();

  while (true) {
    k = skip_ws(src, k);
    if (!(k < stringLen(src))) { panic_at(src, k, "expected '}'"); }
    if (stringCharCodeAt(src, k) == 125) { // '}'
      k = k + 1;
      break;
    }

    let field = parse_ident(src, k);
    k = field.v1;
    k = parse_keyword(src, k, ":");
    k = skip_type_expr(src, k);  // <-- SKIPS the type, doesn't parse it

    vec_push(fields, field.v0);

    k = skip_ws(src, k);
    if (k < stringLen(src)) {
      let ch = stringCharCodeAt(src, k);
      if (ch == 44 || ch == 59) { // ',' or ';'
        k = k + 1;
      }
    }
  }

  add_struct_def(name.v0, fields);
  ParsedStmt("", k)
}
```

**Current Behavior:**

- Parses struct declaration: `struct Name { field: Type, ... }`
- **Uses `skip_type_expr()` to consume types without interpreting them**
- Stores only field names (string array)
- Returns empty JS code (struct definitions are stored internally)

---

## 3. AST Type Definitions (src/ast.ts)

### TypeExpr Union Type

**Lines 51-64:**

```typescript
export type TypeExpr =
  | (NodeBase & { kind: "TypeName"; name: string })
  | (NodeBase & { kind: "TypeGeneric"; base: TypeExpr; args: TypeExpr[] })
  | (NodeBase & { kind: "TypeFunction"; params: TypeExpr[]; ret: TypeExpr })
  | (NodeBase & { kind: "TypeTuple"; items: TypeExpr[] })
  | (NodeBase & { kind: "TypeSlice"; elem: TypeExpr })
  | (NodeBase & {
      kind: "TypeArray";
      elem: TypeExpr;
      initialized: number;
      length: number;
    });
```

**TypeExpr Variants:**

1. **TypeName** - `{ kind: "TypeName", name: string }`
   - Example: `I32`, `String`, `Bool`
2. **TypeGeneric** - `{ kind: "TypeGeneric", base: TypeExpr, args: TypeExpr[] }`

   - Example: `Option<I32>`, `Result<String, Error>`
   - base is the generic type name
   - args is array of type arguments

3. **TypeFunction** - `{ kind: "TypeFunction", params: TypeExpr[], ret: TypeExpr }`

   - Example: `(I32, String) => Bool`
   - params is array of parameter types
   - ret is return type

4. **TypeTuple** - `{ kind: "TypeTuple", items: TypeExpr[] }`

   - Example: `(I32, String)`
   - items is array of element types

5. **TypeSlice** - `{ kind: "TypeSlice", elem: TypeExpr }`

   - Example: `*[U8]`
   - elem is element type

6. **TypeArray** - `{ kind: "TypeArray", elem: TypeExpr, initialized: number, length: number }`
   - Example: `[U32; 3; 10]`
   - elem is element type
   - initialized is number of initialized elements
   - length is total array length

### FnDecl Structure

**Lines 41-50:**

```typescript
export type FnDecl = NodeBase & {
  kind: "FnDecl";
  name?: string;
  isClass: boolean;
  typeParams: string[];
  params: ParamDecl[];
  returnType?: TypeExpr;
  body: BlockExpr;
};
```

**Fields:**

- `name?: string` - function name (optional for lambdas)
- `isClass: boolean` - whether declared with `class fn`
- `typeParams: string[]` - generic type parameter names like `["T", "U"]`
- `params: ParamDecl[]` - parameter declarations with types
- `returnType?: TypeExpr` - return type annotation (optional)
- `body: BlockExpr` - function body

### ParamDecl Structure

**Lines 53-58:**

```typescript
export type ParamDecl = NodeBase & {
  kind: "ParamDecl";
  name: string;
  typeAnn?: TypeExpr;
};
```

**Fields:**

- `name: string` - parameter name
- `typeAnn?: TypeExpr` - type annotation (optional)

---

## 4. Tests Showing Type Annotation Syntax

### From `tests/emit.test.ts`

**Class function with parameter types (Line 48-54):**

```typescript
test("emits this snapshot fields in class fn", () => {
  const { js, diagnostics } = compile(`
    class fn Point(x: I32, y: I32) => { }
    let p = Point(1, 2);
  `);
  expect(diagnostics.some((d) => d.severity === "error")).toBe(false);
  expect(js).toContain("return { x: x, y: y");
});
```

**Shows:**

- Parameter types: `x: I32, y: I32`
- Empty body after `=>`

### From LANGUAGE.md Examples

**Function with return type annotation:**

```tuff
fn add(a: I32, b: I32) : I32 => { a + b }
```

**Function with only parameter types:**

```tuff
fn sign(x: I32) : I32 => {
    if (x == 0) { yield 0; }
    if (x > 0) { yield 1; }
    -1
}
```

**Lambda with type annotations:**

```tuff
let add : (I32, I32) => I32 = (a: I32, b: I32) => { a + b };
```

**Variable with type annotation:**

```tuff
let myLocalVar : U32 = 100;
```

**Struct with field types:**

```tuff
struct Point {
    x : I32,
    y : I32
}
```

**Generic function:**

```tuff
fn first<T, U>(pair: Pair<T, U>) : T => {
    pair.first
}
```

**Generic struct:**

```tuff
struct Pair<T, U> {
    first : T,
    second : U
}
```

---

## 5. Key Patterns and Implementation Notes

### Type Annotation Syntax Rules

1. **Parameter type syntax:** `identifier : TypeExpr`

   - Example: `x: I32`, `name: String`

2. **Return type syntax:** `) : TypeExpr =>`

   - Comes after closing paren of parameters
   - Before `=>`
   - Example: `) : I32 =>`

3. **Variable type syntax:** `let name : TypeExpr = expr`

   - Colon between name and type
   - Example: `let x : U32 = 100`

4. **Type names (primitives):**

   - Unsigned: `U8`, `U16`, `U32`, `U64`
   - Signed: `I8`, `I16`, `I32`, `I64` (I32 is default)
   - Float: `F32`, `F64` (F32 is default)
   - Other: `Bool`, `String`, `Char`, `Void`

5. **Generic type syntax:** `Name<T1, T2, ...>`
   - Angle brackets contain comma-separated type arguments
   - Examples: `Option<I32>`, `Result<String, Error>`

### Hierarchy of Type Complexity

1. **Simple names:** `I32`, `Bool`
2. **Generic types:** `Option<I32>`, `Vec<String>`
3. **Nested generics:** `Option<Result<I32, String>>`
4. **Tuple types:** `(I32, String, Bool)`
5. **Function types:** `(I32, String) => Bool`
6. **Array types:** `[U32; 3; 10]`
7. **Slice types:** `*[U8]`

### What Needs Implementation in Selfhost

1. **`parse_type_expr()`** - Full type expression parser

   - Parse all TypeExpr variants
   - Handle precedence and nesting correctly
   - Build type AST (or at least string representations)

2. **Update `parse_param_list()`** - Add type annotation support

   - Extend from: `ident, ident, ...`
   - To: `ident: Type, ident: Type, ...`
   - Still return parameter string but preserve type info

3. **Update `parse_fn_decl_named()` and friends** - Add return type parsing

   - Look for `:` after `)`
   - Parse return type before `=>`
   - Store/emit return type information

4. **Update `parse_struct_decl()`** - Actually parse types instead of skipping

   - Instead of `skip_type_expr()`, properly parse field types
   - Store type information (could be as strings initially)

5. **Generic type parameters** - Add support for `<T, U, ...>`
   - Parse generic bounds in declarations
   - Handle generic arguments in types

---

## 6. Summary of Changes Needed

| Function                | Current              | Needed                                      |
| ----------------------- | -------------------- | ------------------------------------------- |
| `skip_type_expr()`      | Exists, skips types  | Keep as utility; add `parse_type_expr()`    |
| `parse_param_list()`    | Names only: `(a, b)` | With types: `(a: I32, b: String)`           |
| `parse_fn_decl_named()` | No return type       | Parse `: Type` after params                 |
| `parse_fn_decl2()`      | No return type       | Parse `: Type` after params                 |
| `parse_struct_decl()`   | Skips field types    | Actually parse field types                  |
| N/A                     | Doesn't exist        | Create `parse_type_expr()`                  |
| N/A                     | Doesn't exist        | Create type representation (strings or AST) |

---

## 7. Data Flow Example

**Input Tuff code:**

```tuff
fn add(x: I32, y: I32) : I32 => { x + y }
```

**Bootstrap parser flow:**

1. `parseFnDecl()` starts
2. Consumes `fn` keyword
3. Reads identifier: `add`
4. `parseTypeParamsOpt()` - none found
5. Consumes `(`
6. Loop for parameters:
   - Read `x`, then `:`, then `parseTypeExpr()` → TypeName("I32")
   - Store ParamDecl { name: "x", typeAnn: TypeName("I32") }
   - Read `,`
   - Read `y`, then `:`, then `parseTypeExpr()` → TypeName("I32")
   - Store ParamDecl { name: "y", typeAnn: TypeName("I32") }
   - Read `)` - exits loop
7. Consumes `)`
8. See `:`, so reads return type with `parseTypeExpr()` → TypeName("I32")
9. Consumes `=>`
10. Parses body expression

**Selfhost current flow (INCOMPLETE):**

1. `parse_fn_decl_named()` starts
2. Consumes `fn` keyword
3. Reads identifier: `add`
4. `parse_param_list()` reads only names: `add, b` (TYPE INFO LOST!)
5. Looks for `=>` - **misses return type completely**
6. Parses body

**Selfhost needed flow:**

1. `parse_fn_decl_named()` starts
2. Consumes `fn` keyword
3. Reads identifier: `add`
4. **Updated `parse_param_list()`** reads: `x: I32, y: I32`
5. **Check for `:` and parse return type** → `I32`
6. Consumes `=>`
7. Parses body
