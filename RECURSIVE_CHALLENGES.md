# Recursive Function Compilation: Critical Challenges

**Updated**: Parametric recursion is now supported! See challenge #1 below.

The current recursive compiler is **pattern-matched and register-constrained**. Here are the recursive patterns that would genuinely challenge or break it:

## 1. **Functions with parameters** (highest priority challenge)

```tuff
fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1)
```

**Status**: ✅ IMPLEMENTED!

- Supports single-parameter functions with `if (param <= 0) base else param + funcName(param - 1)` pattern
- Generates iterative loop: `result=0; n=start; loop { if n<=0 break; result+=n; n=n-1 }; return result`
- Works for `+` operator (and other operators via dispatch) with parameter updates of `n - 1` or `n + 1`
- Test case: `fn sum(n : I32) => if (n <= 0) 0 else n + sum(n - 1); sum(5)` evaluates to 15 ✅
- Registers allocated: reg[0]=accumulator, reg[1]=parameter, reg[2]=temp, reg[3]=unused

---

## 2. **Multiple reads in one iteration** (serious challenge)

```tuff
fn sumPairs() => {
  let x = read I32;
  let y = read I32;
  if (x <= 0) 0 else x + y + sumPairs()
}
```

**Why it breaks:**

- The pattern regex is hardcoded: `let VAR = read TYPE; if (VAR <= 0) ... else VAR OP callee()`
- This assumes exactly _one_ read per iteration; multiple reads break the pattern match.
- The accumulator loop assumes the input value is immediately checked; a second read before the check doesn't fit.

**What's missing:**

- Variable tracking across multiple statements in the loop body
- Conditional logic based on _multiple_ input values (not just one)
- Register allocation for multiple intermediate values

---

## 3. **Accumulator with different operation** (moderate challenge)

```tuff
fn product() => {
  let n = read I32;
  if (n <= 0) 1 else n * product()  // multiply, not add!
}
```

**Why it breaks (partially):**

- The regex _does_ capture the operator (`[+\\-*/]`), but the loop generation is **hardcoded to use `+=`**:
  ```java
  instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 3L));
  ```
- Multiplication would require:
  - `reg[0] *= reg[3]` (which means a `Mul` instruction instead of `Add`)
  - _Different base case:_ `1` instead of `0` (for multiplication identity)

**Current state:** Partially detected but not compiled correctly.

---

## 4. **Conditional recursion with complexity** (moderate-to-high challenge)

```tuff
fn fibonacci(n : I32) =>
  if (n <= 1) 1 else fibonacci(n - 1) + fibonacci(n - 2)
```

**Why it breaks:**

- **Two recursive calls** in the same branch—impossible to compile to a single loop.
- Even without parameters, the structure `fib(n-1) + fib(n-2)` requires **two function invocations in parallel**, which cannot be expressed as a sequential loop.
- This is a _tree-recursive_ pattern, not tail-recursive.

**What would be needed:**

- Memoization (cache results)
- Or explicit work queue / stack (not available in current VM)
- Or accept exponential runtime and use real recursion (dangerous—can overflow the call stack, though the current implementation avoids calling functions by substitution)

---

## 5. **Mutual recursion with different operators** (moderate challenge)

```tuff
fn a() => { let n = read I32; if (n <= 0) 0 else n + b() };
fn b() => { let n = read I32; if (n <= 0) 0 else n * a() };  // multiply!
```

**Why it breaks:**

- The mutual cycle detector enforces **same operator and base value** across all functions.
- With `a()` using `+` and `b()` using `*`, the cycle is incompatible.
- The generated loop assumes a single accumulator operation; switching operators mid-cycle requires conditional logic.

**Current state:** Explicitly rejected in `tryParseMutualReadSumCycle`:

```java
if (!"+".equals(pattern.op())) {
    return null;
}
```

---

## 6. **Recursion in conditional branches** (high challenge)

```tuff
fn search(n : I32) =>
  let m = read I32;
  if (m == n) 1 else (if (m <= 0) 0 else search(n))
```

**Why it breaks:**

- Recursion is nested _inside_ conditional logic, not the direct form.
- The detector looks for `if (VAR <= 0) BASE else VAR OP funcName()` as the entire body.
- Nested recursion in branches requires backtracking through parsed conditions.

**What's missing:**

- Parser for recursion _within_ `if` branches
- Unrolling conditional jumps with loops
- Handling function calls that aren't at the top level of the condition

---

## 7. **Side effects before recursion** (moderate challenge)

```tuff
fn sumWithOutput() => {
  let n = read I32;
  if (n > 0) { output n; n + sumWithOutput() } else 0
}
```

**Why it breaks:**

- The pattern assumes the body is purely `let` + `if` + arithmetic.
- Any _statement_ (like `output`) before the recursion breaks the regex.
- The iterative loop has no place to emit side effects—they'd execute every iteration.

**Current state:** Silently fails pattern match, falls back to normal path (which infinite-substitutes and fails).

---

## 8. **Indirect recursion without a cycle** (edge case)

```tuff
fn even(n : I32) => if (n <= 0) 1 else odd(n - 1);
fn odd(n : I32) => if (n <= 0) 0 else even(n - 1);
```

**Why it breaks:**

- Only true mutual _cycles_ (A→B→C→A) are handled.
- This is "binary recursion" (even ↔ odd), which is a cycle of length 2.
- **Actually, this should work!** (The cycle detector allows it.) But it will fail because of the parameterized calls (`even(n - 1)`).

---

## Why These Cases Are Hard

| Challenge               | Root Cause                                    | Fix Complexity                                            |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------- |
| **Parameters**          | Regex assumes `()` exactly                    | High—requires parameter substitution engine               |
| **Multiple reads**      | Pattern is single-read                        | High—need loop state machine                              |
| **Different operators** | Hardcoded `+=` in loop generation             | Medium—conditional operation selection                    |
| **Tree recursion**      | Single-loop can't branch                      | Very High—need explicit stack or memoization              |
| **Complex conditions**  | Regex looks for specific shape                | High—need full expression parser inside recursive context |
| **Side effects**        | Loop assumes pure computation                 | Medium—statement execution during iteration               |
| **Indirect recursion**  | Limited to cycles; parameters block it anyway | Depends on parameters                                     |

---

## The Fundamental Limit

**The implementation is tightly coupled to a specific pattern: "read one value, check if ≤0, accumulate with +, recurse."**

Breaking out of this pattern requires:

1. **Symbolic argument handling** (needed for `sum(n-1)`)
2. **Operator-agnostic loop generation** (needed for `*`, `/`, etc.)
3. **State machine in the loop** (needed for multiple reads or conditions)
4. **Register allocation beyond 4 regs** (needed for complex expressions)
5. **Explicit stack or memoization** (needed for tree recursion)

The current VM has exactly **4 registers** and **no call stack**, so supporting true parametric recursion would require either:

- Using memory as a call stack (feasible but requires careful design)
- Or accepting that recursion _without_ parameters is the limit
