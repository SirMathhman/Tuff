# Test Split Plan

## Current State

`test/index.test.ts` contains **122 tests** across 4 `describe` blocks. The `binary expressions` block is a ~90 test catch-all that mixes arithmetic, control flow, functions, pointers, arrays, structs, match, tuples, and error paths.

## Proposed Structure

```
test/
├── index.test.ts          # Re-export barrel + smoke test (5 tests)
├── literals.test.ts       # Number, boolean, string literals (25 tests)
├── arithmetic.test.ts     # +, -, *, /, precedence, associativity (15 tests)
├── comparison.test.ts     # <, >, ==, !=, <=, >= (10 tests)
├── logical.test.ts        # &&, || (5 tests)
├── control-flow.test.ts   # if/else, loop, break, while (20 tests)
├── assignment.test.ts     # let, mut, =, +=, immutability errors (15 tests)
├── typecheck.test.ts      # `is` operator, type widening, Void (10 tests)
├── functions.test.ts      # fn, call, params, return types (15 tests)
├── pointers.test.ts       # &, &mut, *, deref, mutability (10 tests)
├── arrays.test.ts         # [expr], index, bounds, pointer-to-array (10 tests)
├── structs.test.ts        # struct def, instantiation, field access (10 tests)
├── match.test.ts          # match/case, wildcard, no-match error (8 tests)
├── tuples.test.ts         # (a, b), tuple.N access (8 tests)
└── errors.test.ts         # Error positions, error kinds (10 tests)
```

## Migration Steps

### Phase 1: Create barrel file and new test files

1. Create each new test file with its `describe` block
2. Copy tests from `index.test.ts` into the appropriate file
3. Update `index.test.ts` to import all test files (barrel pattern)

### Phase 2: Update configuration

4. Update `bunfig.toml` to discover tests in `test/*.test.ts` (already works with glob)
5. Verify `bun test` still finds all tests
6. Verify coverage thresholds still pass

### Phase 3: Clean up

7. Remove duplicate `describe` blocks from old `index.test.ts`
8. Keep only a smoke test in `index.test.ts` to verify the barrel works
9. Update `AGENTS.md` with new test file structure

## Test File Mapping

| New File | Tests from `binary expressions` | Count |
|---|---|---|
| `literals.test.ts` | All from `number literals` + `empty/whitespace` | ~27 |
| `arithmetic.test.ts` | `1 + 2`, `1 + 2 + 3`, `2 + 3 - 4`, `2 * 3 - 4`, `2 + 3 * 4`, `(2 + 3) * 4`, `(2 + 3) * (1 + 2)`, `{ 2 + 3 } * 4`, `{ let x = 2 + 3; x } * 4`, `let y = { let x = 2 + 3; x } * 4; y`, `{ let a = 1; a } * 2`, `1 / 2` | ~12 |
| `comparison.test.ts` | `x < y`, `x > y`, `x == y`, `x != y`, `x <= y`, `x >= y` | ~6 |
| `logical.test.ts` | `x \|\| y`, `x && y` | ~2 |
| `control-flow.test.ts` | `if` expression, `if` statement, `else if`, `loop`, `break`, nested `loop`, `while` | ~12 |
| `assignment.test.ts` | `let x = 0; let x = 1`, `let x = 0; x = 1` (error), `let mut x = 1; x += 2`, `let mut x = 0U8; x = 0U16` (error), `let mut x = 0U8; x += 0U16` (error), `let mut x = false; x += true` (error) | ~8 |
| `typecheck.test.ts` | `5U8 is U8`, `100U8 is U8 is Bool`, `(100U8 is U8 && 100U8 is U8) is Bool`, `true is Bool`, `5U8 is U16`, `5 is I32`, `5 is U8`, `(100) is I32`, `(100 + 1U8) is U8`, `{ let x = 0; } is Void`, `(100U8 + 100I8) is I16`, `let x = 100; x is I32`, `loop { break 100U8; } is U8` | ~13 |
| `functions.test.ts` | `fn get()`, `fn add()`, `fn get() : U8 => 0U16` (error), `let get = 0; fn get()` (error), `fn get(); fn get()` (error), `fn accept(param : U8) => {} accept(0U16)` (error), `fn foo(x : U8, x : U16)` (error), `fn add(a, b); add(1)` (error), `fn get(); get(1)` (error), `fn get() => 0U16; let x : U8 = get()` (error) | ~10 |
| `pointers.test.ts` | `&x`, `&mut x`, `*ptr`, `*y = 1`, `*y += 2`, `let mut x = 0; let y = &x; *y = 3` (error), `&1` (error), `*5` (error), `let x = 1; &x[0]` (error) | ~9 |
| `arrays.test.ts` | `[1, 2, 3]`, `array[0]`, `array[0] = 1`, `array[0] += 2`, `&array; ptr[0]`, `&ptr0; ptr1[0]`, `x[99]` (error), `5[0]` (error) | ~8 |
| `structs.test.ts` | `struct Empty {}`, `struct Empty { x : I32 }`, `struct Empty { x, y }`, `struct Empty { x, x }` (error), `Point { x, y }; pt.x + pt.y`, `pt : Point = Point {...}`, `p.z` (error), `x.y` (error), `Foo { y : 1 }` (error), `Bar { x : 1 }` (error) | ~10 |
| `match.test.ts` | `match (3) { case 3 => 7; case _ => 4 }`, `match (5) { case 3 => 7; case _ => 4 }`, `match (2) { case 1 => 10; case 2 => 20; case 3 => 30 }`, `match (5) { case 3 => 7; case 2 => 8 }` (error) | ~4 |
| `tuples.test.ts` | `tuple.0 + tuple.1`, tuple not coercible, tuple index out of range, tuple access on non-tuple | ~4 |
| `errors.test.ts` | All from `error positions` + `undefinedIdentifier`, `let x = { let y = 100; }` (error), `let x = 100;` (void), `undefinedFn()`, pointer/array/struct not coercible | ~15 |

## Implementation Order

1. **`literals.test.ts`** — Move `empty/whitespace` + `number literals` blocks. Lowest risk, no cross-dependencies.
2. **`arithmetic.test.ts`** — Pure binary operator tests.
3. **`comparison.test.ts`** + **`logical.test.ts`** — Small, self-contained.
4. **`control-flow.test.ts`** — if/else/loop/while/break.
5. **`assignment.test.ts`** — let/mut/assign/augassign.
6. **`typecheck.test.ts`** — `is` operator tests.
7. **`functions.test.ts`** — fn/call tests.
8. **`pointers.test.ts`** — &/&mut/* tests.
9. **`arrays.test.ts`** — Array literal and indexing.
10. **`structs.test.ts`** — Struct definition and field access.
11. **`match.test.ts`** — Match expression tests.
12. **`tuples.test.ts`** — Tuple tests.
13. **`errors.test.ts`** — Error position and kind tests.
14. **`index.test.ts`** — Reduce to barrel file with smoke test.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Tests fail after split | Run `bun test` after each file is created to catch copy errors |
| Coverage drops | Some uncovered lines in test file may disappear; verify threshold |
| Import paths break | All files import from `../src` — consistent relative path |
| Test ordering changes | `bun:test` doesn't guarantee order; tests should be independent |

## Post-Migration Benefits

- **Faster test runs**: Can run `bun test test/arrays.test.ts` instead of the full suite
- **Clearer ownership**: Each file maps to one language feature
- **Easier reviews**: PRs for new features only touch one test file
- **Better test discovery**: File names tell you what's tested at a glance
- **Reduced merge conflicts**: Contributors work on different feature files
