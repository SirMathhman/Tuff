# Function Handling Consistency: The Core Challenge

**The Problem:** Functions are not handled consistently.

Currently, the compiler has **three separate routing paths** for function calls:

1. **Statement-level recursive calls** → routed through `RecursiveFunctionCompiler` in `App.parseStatement()`
2. **Expression-level function calls** → routed through `FunctionCallSubstituter` in `parseExpressionWithRead()`
3. **Parameterized recursion** → detected in `RecursiveFunctionCompiler.compileRecursiveFunction()`

Each path has its own:

- **Detection logic** (different regex patterns, different conditions)
- **Register allocation** (different registers used, different limits)
- **Stack frame layout** (or lack thereof—some use registers, some use memory)
- **Dispatch timing** (some at parse time, some at call time)

**The Result:** A single function can be compiled differently depending on whether it's called from a statement or expression, bound to a variable or called directly, or has parameters or not.

**Updated (Jan 21, 2026)**: Parametric recursion ✅, tree recursion ✅, mutual cycles ✅ — but **all three paths remain separate and incompatible** ❌

Below are test cases that expose this inconsistency and **force unification**:

## 1. **Hybrid parametric + no-arg recursion** (routing conflict)

```tuff
fn sumThenMult(n : I32) =>
  if (n <= 0) 1
  else n + sumThenMult(n - 1) + (fn inner() => { let x = read I32; if (x <= 0) 0 else x + inner() }; inner())
```

**Why this is hard:**

- Mixes parametric recursion (`sumThenMult(n - 1)`) with no-arg pattern-based recursion (`inner()`)
- The `TreeRecursionCompiler` expects parametric form; the `RecursiveFunctionCompiler` pattern matcher expects no-arg form
- Routing decision happens in `App.parseStatement()` or `parseExpressionWithRead()`, but the nested function is inside an expression
- **Test need**: Forces a unified entry point and consistent dispatch logic across all three paths

**What would need to change:**

- Single recursion detection and routing layer that doesn't care whether the call is in statement or expression context
- Unified parameter/no-arg detection that works regardless of nesting depth
- Consistent frame layout for all recursive patterns (currently tree recursion and parametric use different conventions)

---

## 2. **Parameter forwarding across multiple recursion depths** (substitution explosion)

```tuff
fn fib3(a : I32, b : I32) =>
  if (a <= 0) b
  else fib3(a - 1, a + b)
```

**Why this is hard:**

- Currently only **single-parameter** recursion is supported (see `tryCompileParametricRecursion`)
- Multiple parameters require tracking **two** symbolic values through the loop
- The parametric compiler stores param in reg[1], but would need reg[1] and reg[2] for both params
- Mutual recursion cycles expect no parameters; adding parameters breaks the cycle detection
- **Test need**: Exposes the hard limit of register allocation in parametric recursion

**What would need to change:**

- Parameter substitution engine for 2+ parameters
- Register allocation strategy that scales to 4+ symbolic values
- Coordination with mutual recursion cycle detection (currently assumes no-arg)

---

## 3. **Tree recursion with parametric dispatch** (frame layout mismatch)

```tuff
fn treeMult(n : I32) =>
  if (n <= 1) 1
  else n * treeMult(n - 1) * treeMult(n - 1)
```

**Why this is hard:**

- Currently `TreeRecursionCompiler` expects the pattern: `fib(n-1) + fib(n-2)` (two _different_ recursive branches)
- This test uses the _same_ recursive call twice: `treeMult(n-1) * treeMult(n-1)`
- Frame layout assumes: `[ret_addr][n][first_result]` where first and second branches compute different values
- With identical calls, the second call overwrites the first result before combining
- **Test need**: Forces a more general tree recursion engine that handles arbitrary tree shapes, not just Fibonacci's specific pattern

**What would need to change:**

- Generic tree recursion framework that doesn't assume distinct first/second branches
- Dynamic register allocation for intermediate results on the call stack
- Work queue or explicit traversal order instead of hard-coded left-then-right pattern

---

## 4. **Cross-routing: expression-level recursive call with parametric form** (dispatch timing)

```tuff
let f = fn count(n : I32) => if (n <= 0) 0 else 1 + count(n - 1); (f(5) + 10)
```

**Why this is hard:**

- Parametric recursion detection happens in `RecursiveFunctionCompiler.compileRecursiveFunction()`, called from statement-level parsing
- This test defines the function **inside a let-expression**, then calls it in an arithmetic expression
- The expression parser (`parseExpressionWithRead`) doesn't have access to `RecursiveFunctionCompiler`
- So `count(5)` is parsed as a normal function substitution, not a parametric recursive call
- The function substitution engine (`FunctionCallSubstituter`) will infinitely expand `count(5)` → `if (5 <= 0) 0 else 1 + count(4)` → `if (5 <= 0) 0 else 1 + (if (4 <= 0) 0 else 1 + count(3))` ...
- **Test need**: Forces recursion detection to work at expression-parsing time, not just statement-parsing time

**What would need to change:**

- Move `RecursiveFunctionCompiler` detection into `parseExpressionWithRead()` or a utility it calls
- Unify the dispatch layer so function substitution checks for recursion before expanding
- Consistent early-exit for all three recursion paths

---

## 5. **Mutual recursion with parametric functions** (cycle detection + parameter tracking)

```tuff
fn a(n : I32) => if (n <= 0) 0 else n + b(n - 1);
fn b(n : I32) => if (n <= 0) 0 else n + a(n - 1);
a(5)
```

**Why this is hard:**

- Current mutual cycle detection in `tryParseMutualReadSumCycle()` assumes **no parameters**
- It looks for `let n = read TYPE; if (n <= 0) ...` pattern in each function
- With parameters, there's no `let` or `read`—the value comes from the argument
- The cycle detector would see parameters and bail out
- Routing parametric calls through the cycle detector would require rewriting parameter extraction logic
- **Test need**: Exposes the separation between three independent routing paths—cycle detection, parametric, pattern-based—that don't share infrastructure

**What would need to change:**

- Unified recursion analyzer that understands all three forms (parametric, no-arg with read, tree-recursive)
- Shared pattern representation that works for functions with or without parameters
- Generic cycle detection that works on symbolic parameter updates, not just hardcoded `read` operations

---

## 6. **Mixed tree recursion: parametric + two-recursive-call form** (stack frame protocol mismatch)

```tuff
fn fib2(n : I32) =>
  if (n <= 1) 1
  else fib2(n - 1) + fib2(n - 1)
```

**Why this is hard:**

- Matches tree recursion detection pattern (two recursive calls) _and_ parametric form (`fib2(n-1)`)
- Both `TreeRecursionCompiler` and parametric path in `RecursiveFunctionCompiler` could claim this
- But their stack frame layouts differ:
  - **Parametric**: stores param in reg[1], uses simple loop back to same frame
  - **Tree recursion**: allocates new frame for each call, stores return address + param + first result
- Early dispatch in `compileRecursiveFunction()` checks for tree recursion first, but the detection is fragile
- If parametric routing claims it first, the tree recursion compilation is skipped
- **Test need**: Forces a unified frame protocol that works for both patterns, or explicit priority rules in routing

**What would need to change:**

- Canonical stack frame layout for all recursive patterns (currently ad-hoc per compiler)
- Explicit dispatch priority that's documented and testable
- Shared code for register allocation and frame management across all three paths

---

## 7. **Dynamic dispatch: runtime call to a recursive function** (routing impossibility)

```tuff
let func = fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1);
func(10)
```

**Why this is hard:**

- Recursive function bound to a variable, then called through the variable
- Recursion routing happens at **compile time** during parsing
- The call `func(10)` is just a variable reference—the compiler has no way to know it's recursive until runtime
- Current routing in `parseExpressionWithRead()` checks function registry for recursion, but the function was stored as a string body, not analyzed for recursive structure
- Would need to either:
  - Analyze _all_ function bodies at registration time (breaks lazy evaluation)
  - Or keep parameterized recursion analysis with the function definition (extra metadata)
  - Or give up and use function substitution (infinite expansion bug)
- **Test need**: Exposes a fundamental architectural gap: recursion detection happens during expression parsing, but dynamic dispatch happens after variable binding resolution

**What would need to change:**

- Metadata attached to function definitions: is this tail-recursive? tree-recursive? parametric?
- Function registry stores not just `(name, body)` but also `(name, body, recursion_kind, frame_layout)`
- Recursion analysis happens during `FunctionHandler.parseFunctionDefinition()`, not during call site
- Dynamic dispatch uses metadata to choose the right compilation path

## Why These Cases Force Consistent Function Handling

Each test case **mixes concerns** across the three separate routing paths. They're all solvable individually, but solving them _all_ requires unification:

| Test                                | Why It Forces Unification                             |
| ----------------------------------- | ----------------------------------------------------- |
| **#1: Hybrid param + no-arg**       | Expression and statement paths must use same logic    |
| **#2: Multi-parameter recursion**   | All paths must share register allocation strategy     |
| **#3: Tree recursion variants**     | All paths must use canonical frame structure          |
| **#4: Expression-level parametric** | Same detection must work everywhere                   |
| **#5: Parametric mutual cycles**    | Cycle detection must be parameter-agnostic            |
| **#6: Mixed tree+parametric**       | All compilers must share consistent metadata          |
| **#7: Dynamic function dispatch**   | All functions must be analyzed consistently at define |

**The unified solution requires:**

1. **Single Function Registry** with metadata for every function:
   - `recursion_kind`: NONE, TAIL, TREE, or MUTUAL
   - `frame_layout`: register-based or memory-based
   - `register_requirements`: how many registers needed
   - `mutual_cycle_id`: which cycle this belongs to (if any)

2. **Unified Recursion Analyzer** (runs at function definition):
   - Detects recursion kind in a single pass
   - Determines frame layout and register needs
   - Stores metadata with function definition

3. **Unified Function Router** (runs at every function call):
   - Checks function metadata
   - Routes to appropriate compiler based on recursion kind
   - Same path whether called from statement or expression

4. **Shared Infrastructure**:
   - `FrameAllocator`: unified register and memory allocation
   - `RecursionDispatcher`: metadata-based routing
   - `SymbolicParameterSubstituter`: handles multi-parameter recursion

---

## Current Architecture: Why Functions Are Inconsistent

```
┌─ App.compile() ──────────────┐
│                              │
├─ parseStatement()  ─┬─> FunctionHandler.parseFunctionDefinition()
│                    │   (stores body as string, no recursion analysis)
│                    │
│                    └─> if (isRecursive) RecursiveFunctionCompiler.tryCompileRecursiveCall()
│                         (detects recursion at statement-level only)
│
└─ parseExpressionWithRead() ──┬─> FunctionCallSubstituter.substituteAllFunctionCalls()
                               │   (blindly expands; doesn't detect recursion)
                               │
                               ├─> FunctionHandler.parseFunctionCall()
                               │
                               └─> if (parametric) RecursiveFunctionCompiler.tryCompileParametricRecursion()
                                   (second chance; misses non-parametric recursion in expressions)
```

**The problem:** Recursion detection scattered across three locations with three different heuristics. The same function is treated differently depending on where it's called from.

**The fix:** Centralize recursion analysis in `FunctionHandler.parseFunctionDefinition()`, store metadata, and use a unified dispatcher for all function calls.

## Implementation Reality (Jan 21, 2026)

**What's been built (but inconsistently):**

| Component               | Statement Path                 | Expression Path                    | Metadata       |
| ----------------------- | ------------------------------ | ---------------------------------- | -------------- |
| **Detection**           | ✅ `RecursiveFunctionCompiler` | ❌ None (tries substitution first) | ❌ None        |
| **Parametric**          | ✅ Partial                     | ❓ After substitution fails        | ❌ Not stored  |
| **Tree recursion**      | ✅ `TreeRecursionCompiler`     | ❌ Not accessible                  | ❌ Not marked  |
| **Register allocation** | ✅ Hardcoded per compiler      | ❌ Varies per path                 | ❌ Not tracked |
| **Frame layout**        | ⚠️ Different per compiler      | ⚠️ Different per compiler          | ❌ Ad-hoc      |
| **Routing priority**    | Explicit                       | Implicit (substitution first)      | Missing        |

**Key Insight:** The VM has **4 registers** and **1024 words of memory**. Tree recursion uses memory (addr 500+) as a call stack, avoiding Call/Return instructions entirely. This _architecture works_, but the _routing logic_ to reach it is fragmented.

**To achieve consistent function handling:**

1. ❌ **Don't** fix each path independently (cascades complexity)
2. ✅ **Consolidate** detection, routing, and compilation into one flow
3. ✅ **Centralize** all recursion analysis at `FunctionHandler.parseFunctionDefinition()`
4. ✅ **Share** register allocation and frame management across all three compilers
5. ✅ **Route** all function calls (statement or expression) through unified dispatcher

**The payoff:** Once functions are handled consistently:

- **Test #7** (dynamic dispatch) becomes trivial—just read metadata
- **Tests #1, #6** (mixed recursion) work automatically
- **Test #2** (multi-parameter) scales naturally
- **Test #5** (parametric cycles) is supported
- **Test #4** (expression-level) works without special cases
- **Single implementation path** is far easier to maintain, test, and debug
