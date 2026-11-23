# Tuff Architecture

The ideal architecture: a small, pure, layered interpreter whose failures are structured values, not exceptions or silent coercions.

## Definitions

### Program terms

- **Source**: the text of a Tuff program. Always untrusted.
- **Entry point**: `interpretTuff(source)`, the only public function.
- **Value**: a number, a sized integer, a boolean, a one-character string, an array, a record, a reference, or a function value. Every object-shaped value carries a `kind` tag, so its variant is read from the tag and never inferred from its properties. A number is a safe integer and is never negative zero. A sized integer has one of eight types (U8, U16, U32, U64, I8, I16, I32, I64), written with its suffix, such as `100U8` or `-5I32`; its value is exact and never equals a plain number. An array's element type is part of its type: `[[1], [2]]` is an array of arrays of numbers, and every element and every assignment must match it. A program evaluates to a number; a boolean result is 1 or 0, a string result is its Unicode code point, and a sized integer result is a number only when it lies within ±(2^53-1).
- **Struct**: a named record type declared at the start of a program, such as `struct Point { x : I32, y : I32 }`. Its name starts with a capital letter. A struct value is a record tagged with its struct name, and the tag survives every copy, field write, and move.
- **Function**: a named expression declared after the structs, such as `fn add(first : I32, second : I32) : I32 => first + second;`. Its parameters are sized integers, Bool, or function types, and its return type is a sized integer or Bool. A function sees its parameters, the structs, and the functions declared before it, never a caller's bindings.
- **Function value**: a declared function held as a value, made by `&name` and typed by a function type such as `&(I32, I32) => I32`. It captures the functions declared before its declaration and no bindings, so it is pure and cannot reach or change caller state.
- **Token**: a kind and its text. Kinds are punctuation, keyword, number, name, string, and unclosed string. A quoted literal is one string token; an unclosed quote is its own kind. Source spans come with the near-term item below.

### Bindings and scope

- **Binding**: a name paired with a value, introduced by `let`. `let mut` allows reassignment. A binding keeps its annotation for its whole life, so reassignment checks the annotation itself, not only the type of the value it replaces. An annotated array keeps its length.
- **Annotation**: an optional type after the name: a sized integer type, `Bool`, an array type `[Type; length]` such as `[Bool; 3]`, where the type is a sized integer or `Bool`, a function type `&(Type, ...) => Type` whose parameter and result types are scalar, or a declared struct name such as `Point`. Examples: `let x : U8 = 100U8;`, `let x : Bool = true;`, `let x : [Bool; 3] = [true, true, true];`, `let p : Point = Point { x : 1I32, y : 2I32 };`. The value must have exactly that type when the binding is made, and reassignment must keep it.
- **Scope**: the bindings visible at a point, innermost first. Inner names shadow outer ones.
- **Reference**: a borrow of a binding, read-only (`&x`) or writable (`&mut x`). It is a live alias of that binding. A reference may be stored only in a binding or array slot that lives no longer than its target, so it never outlives its target.
- **Block**: bindings followed by one result expression.

### Errors and purity

- **Result**: a tagged union, `ok` or `err`, used instead of throwing.
- **TuffError**: a structured enum stating what failed, where, why, and how to fix it.
- **Pure core**: no I/O, no dynamic code evaluation, no reads of ambient state.

## Structure

Dependency direction is strictly downward. No cycles exist; `madge --circular` in `lint` enforces this.

### Layers

1. Entry points: REPL and file runner. The only layer allowed to do I/O.
2. Public API: `interpretTuff` and its exported types, from `index.ts`. It composes the pipeline and nothing else.
3. Pipeline: the stage modules listed below. Each depends only on the layers beneath it.
4. Shared core (`errors.ts`): `Result`, `TuffError`, `ErrorWhere`. Depends on nothing else.

### Pipeline

1. `tokenizer.ts`: a character scanner that emits typed tokens, each with its kind and text.
2. `declarations/`: parses the declarations at the start of a program, in order: structs, then functions. Each parser takes the expression rule as a parameter, and reads `statements.ts` only for annotations. The directory keeps `src/` under its file cap.
3. `parser.ts` parses expressions by precedence, including calls; `statements.ts` parses statements and blocks.
4. `eval/evaluator.ts`: a fold over the AST. The outermost scope carries the struct and function tables that constructors, struct annotations, and calls read. `eval/values.ts` holds the value model and type checks; `eval/operators.ts` holds the operator tables. Cells change in place for assignment and moves until Future Work item 2 lands.

### Shared rules

- `conditions.ts` holds the `( expr )` condition rule. `parse-errors.ts` holds error constructors and position helpers.
- `ast.ts` holds AST types, so the evaluator depends on the AST rather than on the parser.

### Dependency rules

- Stage modules import only the core, `tokenizer.ts`, `parse-errors.ts`, `ast.ts`, and each other.
- A rule that would close a cycle receives the other rule as a parameter. No parser module imports the expression parser.
- The shape of a statement-level `if` is recognized by one function that statement-block detection, statement lists, and the body parser all share, so they cannot disagree about it.
- The binary operator set is declared once in `ast.ts`. The tokenizer, the parser, and the statement-or-expression rule all read that set, so no operator can be known to one and missing from another.

### Size limits

- No directory holds more than 10 files; `scripts/check-file-count.ts` enforces this in `lint`.
- Functions, files, and directories stay under the limits in `eslint.config.js`; exceeding one is a split signal.

### Tests

- Tests live beside their code (`*.test.ts`), exercising the public API first and the stages second.

## Recursion

Recursion is limited to the parser, the statement rules, and the evaluator over the AST. Mutual recursion is forbidden, within a file and across files.

### Passing rules as parameters

- A rule that would close a cycle receives the other rule as a parameter, as `blockBody` receives `parseExpr`.
- Each expression kind is evaluated by its own rule, and each rule receives `evaluate` as a parameter. The evaluator never runs during parsing.

### Acyclic calls

- A function body sees only earlier functions, so the call graph has no cycles and no call recurses. Call depth is bounded by the number of declared functions.

## Grammar

### Logical and comparison operators

- `||` binds loosest, then `&&`. Both short-circuit and take booleans.
- Comparisons `<`, `<=`, `>`, `>=`, `==`, and `!=` bind tighter than `&&`, do not chain, and yield booleans. Ordering takes two numbers or two sized integers of one type; equality takes two values of one type.

### Arithmetic and unary operators

- Bitwise `|` and `&` sit between `&&` and comparisons, and `<<` and `>>` between comparisons and `+ -`. Bitwise operands are 32-bit signed integers and a shift amount is from 0 to 31; otherwise the result is a BitwiseOutOfRange error. The `&` after an operand is bitwise-and, and at the start of an operand it is a reference.
- `+`, `-`, `*`, and `/` fold left to right, with `*` and `/` binding tighter. Division truncates toward zero, and a zero divisor is a DivisionByZero error.
- A sized integer takes `+`, `-`, `*`, `/`, `|`, `&`, `<<`, and `>>` at its own type. Its operands are not limited to 32 bits, but a shift amount is still from 0 to 31, and a negative shift amount is equally invalid. Results must stay within the type's range, or the result is IntegerOutOfRange, which names the type. Unary `-` needs a signed type; a `-` directly before a signed literal folds into it, so `-128I8` is valid. A sized integer never mixes with a number or another type, which is a TypeMismatch.
- `!` takes a following factor and a boolean, so `!!x` nests. A single unary `-` precedes a primary: a number, a name, a group, a block, or an if.

### Blocks and if

- `if (cond) a else b` takes a boolean condition and requires both branches; the else branch is a comparison, so arithmetic and shifts after it belong to the else branch, while `|`, `&`, `&&`, and `||` after it apply to the whole if.
- A `{` at statement position opens a statement block when its contents begin with a statement or an if statement, and the token after its `}` ends the statement.
- `while (cond) { body }` is a statement. It runs the body while the boolean condition holds, with no step limit yet. The body is a block or one unbraced statement other than `let`. The body's bindings end with each pass, and its changes to outer mut names persist.
- An `if` statement's then and else branches are each a block or one unbraced statement other than `let`, which may itself be an `if` or a `while`. The two branches may mix forms, as in `if (c) { x += 1; } else x += 2;`. An `if` that begins like an expression, such as `if (c) 1 else 2`, stays an expression.
- `x op= value;` on a mut name is the same as `x = x op value;`, for `+=`, `-=`, `*=`, and `/=`.

### Blocks as values

- A block used as a value ends in a final expression.
- A program made only of statements evaluates to 0.

### Names and numbers

- Names bind with `let`. Undeclared names and assignments to immutable names are errors. A `let` may annotate a sized integer type or `Bool`, as in `let x : U8 = 100U8;` or `let x : Bool = true;`; the value must have exactly that type, so a plain number is a TypeMismatch.
- Numbers are JavaScript doubles. Results above 2^53 are rejected, so precision is never lost silently.
- A sized literal such as `100U64` or `-128I8` is exact and must lie within its type's range, or the literal is IntegerOutOfRange. The suffix is case-sensitive, so `1u64` is an invalid term.

### Arrays

- An array literal `[a, b]` takes its element type from its elements, so `[[1], ['a']]` is an error. An empty literal `[]` is an error because it has no element type.
- `name = expr` and `name[i] = expr;` must keep the type of the target, at every depth.
- `array[i]` reads an element. Negative or out-of-range indexes are IndexOutOfRange errors.
- Indexing a name does not move it. Reading a whole array by name moves it, so a later use is a UseAfterMove error until the name is assigned again.
- A nested array read is a copy, so the copy can be changed without touching its source.
- Arrays cannot be compared or returned as a program result.
- `&x` borrows a declared name read-only and `&mut x` borrows it writably (only if `x` is mut). `*r` reads through a reference and `*r = v;` writes through a mutable one. Reading through a reference copies the value, so it never moves the target. A reference cannot be stored where its target would outlive it (ReferenceEscapes), and cannot be a program result or compared.

### Records

- A record literal `{ name : value, name : value }` has named fields, each holding any value. A field name is used once. A `{` followed by a name and `:` is a record, never a block.
- `pt.x` reads a field, and chains such as `pt.a.b` read nested fields. Reading a field copies any array in it. An unknown field is an UndefinedField error.
- `pt.x = value;` assigns a field when both the binding is mut and the struct declares that field mut, and the value must have the field's type. An anonymous record's fields cannot be assigned. The record is replaced, not changed in place, and a struct value keeps its struct name through the replacement.
- A record moves on whole-name use, as an array does, so a later use is a UseAfterMove error. Reading a field does not move it.
- A struct declaration `struct Point { x : I32, y : I32 }` starts the program and names a record type. Its name starts with a capital letter, and each field has a scalar or array type; a field marked `mut x : I32` may be assigned. A constructor `Point { x : 3I32, y : 4I32 }` builds one value with every field once and each field's type, and plain numbers do not convert to sized types.
- A let annotation `: Point` accepts only a value built by Point's constructor, so an anonymous record does not match. An undeclared struct name in an annotation is an InvalidTerm error, and an undeclared constructor is an UndefinedStruct error.
- Records cannot be compared or returned as a program result. Comparing them reports a TypeMismatch that names the record.

### Functions

- A program declares its functions after its structs and before its body. Each declaration is `fn name(p : Type, ...) : Type => expr;`. A parameter type is a sized integer, Bool, or a function type; a return type is a sized integer or Bool.
- A function type `&(Type, ...) => Type` takes scalar parameter types and a scalar result type. It nests: a parameter may itself be a function type, so `&(&(I32) => I32) => I32` is valid. Nested parsing receives the annotation rule as a parameter, so the parser has no mutual recursion.
- `&name` of a declared function that no binding shadows yields a function value. `&mut name` of a function is a TypeMismatch.
- A call `name(args)` first looks up a binding named `name` and calls the function value it holds, innermost binding first. Otherwise it calls the declared function of that name.
- A declared function's body runs in a fresh scope holding only the structs and the functions declared before it. A function value's body runs with the list of functions captured by its `&name`.
- A function value matches a function type when its parameter and result types are equal. A `mut` binding of a function type may be reassigned to any function value of that signature.
- Arguments must match each parameter's type exactly, and the argument count must match. The result must match the return type. A mismatch is a TypeMismatch, and an unknown name is an UndefinedName.
- Parameters are immutable bindings with their annotations. A body cannot call itself or a later function.

### Tokens

- Brackets, operators, `=`, `:`, `.`, and `;` are self-delimiting, so spacing never changes meaning.
- Spaces, tabs, and newlines separate tokens. `true` and `false` are booleans. A single-quoted literal such as `'a'` is a one-character string, with backslash escapes for backslash, single quote, newline, and tab; `==` and `!=` compare strings, and other operators reject them.
- The parser dispatches on token kind, never on token text. An unclosed quote reports as an unclosed string, never as a bad escape.

### Compatibility

- Number literals follow JavaScript number syntax. Widening the grammar is additive; narrowing it is breaking.

## Potential Problems

### Resource limits

- Very large sources and deeply nested expressions can exhaust time or the call stack.
- Nesting counts every nested construct against one limit of 1000 levels. Exceeding it is `NestingTooDeep`.

### References

- A read-only borrow observes later writes to its target, and no borrow excludes another, so aliasing is unrestricted.
- Storage checks compare the target with the holder's scope, not the scope of the store, so a block cannot leave a reference behind in an outer binding.

### Stack safety

- Operator chains fold with `reduce`, so their length never depends on the call stack.
- Exception-based failure paths creep in unless the Result pattern is enforced from the start.
- Call depth is bounded by the declared functions, so calls cannot exhaust the stack through recursion.

### Growth

- Dispatch functions grow with every new expression kind. Each kind should get its own rule instead.
- Each object-shaped value carries a `kind` tag that its type requires, so a new variant without a tag fails to compile instead of being misread by a property check.

## Security Concerns

Source is untrusted input. It arrives from the REPL, from files, and from a model that writes Tuff code.

### Code execution and host access

- No `eval`, `Function`, or dynamic import of anything derived from source.
- No filesystem, network, process, or global access. Host capabilities are passed in explicitly and absent by default.
- A function body is a pure expression over its parameters and earlier functions, so a call reads no caller state and performs no host access.
- A function value captures declared functions only, never a caller's bindings, so passing one cannot leak mutable state.

### Input tokens

- Operators are recognized only by the tokenizer's character scanner, so no source character can form a token outside the grammar.

### Output and limits

- Output is data only. Values are never rendered as markup or executed by the caller.
- Limits on source size, nesting depth, and evaluation steps keep hostile input from hanging or crashing the host.

### Known gaps

- Nesting depth is enforced. Source size and evaluation-step limits are not enforced yet.
- Model-driven prompt injection reaches the evaluator through source text. The host-capability whitelist must be designed before any host function exists.

### State changes

- The interpreter changes no state outside its own evaluation. Any future host function is an unauthenticated state change and needs an explicit capability grant.

## Future Work

### Near term

1. Add character spans to typed tokens, replacing the token-index `where` of each `TuffError`.
2. Track moves as state threaded through the fold instead of flags on cells, so the evaluator stays a pure fold.
3. Shrink `eval/evaluator.ts`, `parser.ts`, `statements.ts`, `errors.ts`, and `index.test.ts`, which are over their 500-line limit, and split `src/` into stage subdirectories before adding an eleventh file.
4. Split the tests by stage, beside their code, so each stage's `*.test.ts` covers its own rules and the public API file covers only the API.
5. Retire `U64OutOfRange`: one `IntegerOutOfRange` kind carries the type name and bounds for every sized type, U64 included.
6. Make every parser rule dispatch on token kind. Rules compare token text through `textAt` today.
7. Derive the annotation names, the `let` type check, and the `let` error hint from one declaration in `ast.ts`, instead of writing `Bool`, the type list, and `annotationName` by hand in several places.
8. Allow struct-typed fields, so a struct can name another struct as a field type.
9. Report a wrong argument count as an ArityMismatch and an unknown function as an UndefinedFunction, instead of reusing TypeMismatch and UndefinedName.

### Later

1. Add a REPL that prints `TuffError` values in full.
2. Tune size limits in `eslint.config.js`; they are warnings today.
3. Add resource limits (source size, depth, steps) as interpreter options with safe defaults.
4. Accept compound assignment on array elements and through references, as `a[0] += 1;` and `*r += 1;`.
5. Allow nested function types in parameters, and function types as return types and struct fields, parsing nested types with the annotation rule passed as a parameter.

## Performance

### Parsing and evaluation

- Tokenizing and parsing should be linear in source length. Avoid regular expressions with nested quantifiers.
- A field write rebuilds the record's field map, so its cost grows with the record's field count.
- Statement-block detection scans forward to the matching `}`, so nested blocks can cost source length times depth.

### Scope and loops

- Scope lookup walks bindings in order, so many `let` statements can make evaluation quadratic. A map by name avoids this.
- Each call builds a new root scope and each `&name` copies the list of earlier functions, so both cost time in the number of declared functions.
- Step limits will guard unbounded loops, which the language will eventually need.

### Arrays

- A nested read copies one level, so reading a row costs the row's length. Large grids may need a persistent structure.

### Measurement

- Real measurements should come from a profiler once the pipeline exists. No optimization is planned before then.
