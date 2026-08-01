# Tuff `this` Semantics — Specification

## 0. Foundational principle

All "classes" are functions that return `this`. There is no separate class
system. A **constructor** is just a function whose body constructs and
returns its own instance; a nested function is an **inner class** for free,
with no special syntax, purely by virtue of where it is lexically declared.

`this` is not a magic runtime-bound keyword (as in JS) and not an explicit
conventional parameter (as in Python). It is a **name resolved entirely by
lexical nesting depth at compile time**, referring to a chain of implicit
struct-like frames produced by constructor calls.

There is exactly one frame that is never constructed by anything: **true
global**. It has no fields, no instance, and is not reachable by name. Every
piece of code a person actually writes — including top-level `let`/`fn`
declarations — lives inside an **implicit module frame** (`Module`), which is
itself a constructor-like frame one level *inside* true global. This is the
load-bearing fact that makes the rest of the system consistent: there is no
user-reachable "depth 0."

---

## 1. Nesting depth and frames

- Depth 1 = top level of the file (the implicit `Module` frame). Every
  top-level `let` becomes a field of `Module`; every top-level `fn` is a
  function declared inside `Module`.
- Depth 2 = a function declared directly inside a depth-1 function.
- Depth D = a function nested D−1 levels inside `Module`.

Each depth ≥ 1 corresponds to a real constructed frame with an instance and
potential fields. Depth 0 (true global) is not a frame — it is the boundary
where the recursion terminates. Nothing is ever "at" depth 0; it is only ever
referred to as the thing you fail to climb into.

---

## 2. Bare `this`

At nesting depth D (D ≥ 1), bare `this` refers to the **innermost enclosing
function's own instance** — i.e., the frame belonging to the function whose
body you are currently inside. This includes the file itself: at top level
(D=1), bare `this` is the `Module` instance, and `this.x` is field access on
`Module`, which is indistinguishable in practice from "look up variable `x`
in scope" (the original informal description of top-level `this`) but is now
understood as ordinary field access rather than a special case.

Nested functions do **not** inherit the outer function's `this` by default.
Each function, at whatever depth, has its own `this` referring to its own
instance. This is the opposite of JS's default (where nested plain functions
rebind `this` and arrow functions had to be added specifically to opt out of
that) — in Tuff, *reaching inward* to your own frame is the default, and
*reaching outward* is the thing that requires explicit syntax.

---

## 3. `this.this` — the climb operator

`this.this` is not special syntax — it is **ordinary field access**, where
`this` happens to be the name of a compiler-synthesized field that points to
the enclosing frame. `this.this^k` (a chain of k such accesses) climbs k
frames outward from the current function's own frame.

**Validity rule:** at nesting depth D, a chain `this.this^k` is well-typed
iff `k < D`. This is because `this` alone (k=0) names your own frame — one of
the D frames that exist from your position outward. It takes k hops to name
the frame the current function is a member of, and that frame is D−1 steps
from the enclosing edge of user-reachable structure (Module is always
reachable as an ancestor; true global, one step further, is not). Concretely:

- k=0 → your own instance. Always valid at any D ≥ 1.
- k=1 → the immediate enclosing frame. Valid iff D ≥ 2.
- k=D−1 → `Module`, the outermost real frame. Always valid.
- k=D → attempts to climb past `Module` into true global, which was never
  constructed and has no fields. **Compile error.**

This is a purely static check — nesting depth is known at compile time, so
`k < D` is decidable with no runtime component, and there is no saturation or
clamping behavior at the boundary. Overshooting by any amount is a single
uniform compile error class: "no such field, because there was no frame
there to have one."

**Example (this was the case that pinned the rule down):**

```
let mut counter = 0;
fn add() => {
  this.this.counter += 1;
}
add()
counter
```

Here `add` sits at depth 2 (nested one level inside the implicit `Module`
frame at depth 1). Its body climbs k=1 (`this.this`), which is valid since
D=2 > 1, landing on `Module`, whose field `counter` is mutated. This
type-checks and works.

By contrast:

```
let x = 0;
this.this
```

This is top-level code, D=1. `this` alone (k=0) names `Module`. `this.this`
(k=1) requires D ≥ 2, which fails — there is no frame beyond `Module` to
climb into. **Compile error**, and it is the *same* error class as any other
over-climb, not a distinct "top level is special" case.

---

## 4. Methods vs. constructors

A function whose parameter list includes a `this`-typed parameter is a
**method**. A function is a **constructor** iff the token `this` is
mentioned somewhere in its body — bare, as `this.field`, or wrapped in one
or more single-argument constructor calls applied to it (e.g. `Ok(this)`,
recursively — the wrapper itself following this same definition).

This mention does not need to occur on every reachable return path. A
constructor may have branches that return something else entirely (an error
value, a propagated `?`, etc.) — those paths simply aren't constructions of
`this`, and the function is still classified a constructor overall because
at least one reachable path does mention `this`. If `this` is never
mentioned anywhere in the body, the function is not a constructor at all
(just an ordinary function), regardless of what it returns.

```
fn Socket() : Result<Socket, IOError> => {
  let connection = trySomeConnection()?;
  Ok(this)
}
```

`Socket` is a constructor: `this` appears wrapped in `Ok(...)` on the success
path. The `?`-propagation early-return on failure doesn't construct `this`
at all — it isn't required to. Whether a `this` instance is conceptually
"alive" from function entry or only from the point of first mention has no
observable effect and is left to codegen (§7).

A nested constructor may still take a receiver referring to an *outer*
frame, written using the climb chain as a type: `&this.this`,
`&mut this.this`, or with an explicit lifetime, e.g.
`this.this : &t mut Outer`.

**Method-ness and constructor-ness are independent axes, not mutually
exclusive categories.** "Method" asks whether the parameter list includes a
`this`-typed parameter — a receiver belonging to *some* frame, reached via
any `this.this^k`, not necessarily the function's own frame. "Constructor"
asks whether the body mentions the function's *own* `this` (§4, possibly
wrapped). These are facts about two different frames — an incoming receiver
parameter versus an outgoing self-construction — so a function can be
neither, either, or both:

- `add(&mut, amount: I32) => { value += amount }` — takes a receiver
  (Counter's `this`, via the `&mut` shorthand), but its body never mentions
  its own `this`. Method, not constructor.
- `Counter() => { let mut value = 0; this }` — no receiver parameter at all.
  Constructor, not method.
- `Inner(&this.this) => { let field = 100; this }` — takes a receiver
  (Outer's `this`, explicitly) **and** its body constructs and returns its
  own `this`. **Both simultaneously.** This is the general shape of an
  inner class with an explicit receiver: a method with respect to the outer
  frame it's handed, and a constructor with respect to the frame it builds.

**Dot-call availability is independent of this classification.** Any
function — method, constructor, capturing or not — declared inside another
function's body is reachable via `.name(...)` off an instance of the
enclosing frame, purely because of lexical nesting position. There is no
separate "is this a member" check; membership *is* lexical position.

---

## 5. Fields: which locals become instance members

There is no public/private distinction in the language. Because of this,
**every `let` declared directly at a constructor's top-level body scope
becomes a field of the resulting instance** — unconditionally. This applies
whether or not the field is ever written as `this.field` explicitly; a bare
local declared at that scope simply *is* a field, reachable three ways that
all name the same thing: bare name from inside (with auto-climbing through
`this.this^k` when referenced from a nested function), `this.field` from
inside, and `instance.field` from outside after construction.

**Locals declared inside a nested block within that body — an `if`, a loop,
a match arm, etc. — are not promoted.** They remain ordinary block-scoped
locals, invisible outside the block and never attached to the instance:

```
fn Thing() => {
  if cond {
    let temp = compute()   // NOT a field of Thing — block-scoped only
  }
  this
}
```

This keeps field-membership a simple static fact (what's declared at the
constructor's own top-level body scope) rather than requiring control-flow
analysis to determine which fields might or might not have been initialized
on a given path.

**Consequence for capture:** what looks like a nested function "capturing"
an enclosing local (as in `add` referencing `counter` in §9 below) is not a
separate closure-capture mechanism distinct from `this.this` field access —
`counter`, being declared at `Counter`'s top-level body scope, already *is*
a field of `Counter`'s instance. A bare reference to it from a nested
function is exactly the same mechanism as an explicit `this.this.counter`,
just with the climb inserted automatically by lexical name resolution
instead of written out. Capture and the climb operator were never two
systems — capture is what the climb operator looks like when the compiler
supplies it implicitly.

---

## 6. Hoisting vs. closures

A nested function that references no state from any enclosing frame (no
`this.this^k` for any k ≥ 1, and no bare reference to an enclosing
top-level-scoped local, which per §5 is the same thing) is **hoisted**:
compiled as a fully free, top-level function with no implicit outer
parameter, and `.name()` call syntax on it compiles to a plain direct call.

A nested function that does reference enclosing state is a **closure**: it
receives an implicit reference to (some part of) the enclosing frame as an
extra parameter, threaded in automatically at each call site.

This is the same underlying analysis as capture-checking in any closure
implementation, and it now also *is* the mechanism that decides which
`this.this` fields need to exist at all (see §7) — one analysis pass serving
both purposes, rather than two separate mechanisms for "is this a closure"
and "does this class have this field."

---

## 7. What actually gets materialized (semantics vs. codegen)

The compiler **must** statically prove, for every `this.this^k` chain that
appears anywhere in the program, that a real path of frames exists
connecting the point of use back to the frame k levels out. This is a
required, non-optional part of type-checking, and it is necessarily
**transitive**: if a deeply nested function needs `this.this.this` reaching
back two frames, every intermediate ancestor frame between it and that
target must be able to supply the connection, even if that ancestor's own
body never itself references `this.this`.

What the compiler is **not** required to do is materialize that chain as any
particular runtime representation. The specification only constrains
*provable reachability at compile time* — not struct layout, not whether a
field literally exists in memory, not calling convention. A field that
nothing outside the compiler's own reachability bookkeeping ever reads is
free to be elided entirely in codegen, forwarded straight through without
ever being named, or represented however the backend prefers. Two different
builds of the same source (e.g. debug vs. release) are explicitly permitted
to disagree on internal frame layout, as long as both correctly satisfy every
reachability obligation the type checker proved.

**Consequence for demand-driven field synthesis:** a frame only carries the
minimum implicit outer-reference machinery actually demanded by itself or
anything nested inside it — never blanket-threaded "just in case." Two
sibling nested functions at the same depth can have completely different
outer-reference needs (one may need `this.this`, the other nothing at all)
with no cost imposed on the one that doesn't use it.

**Open item, deliberately left as a live design decision:** whether frame
layout should ever be treated as a stable ABI (e.g. for separate compilation
across modules) is not settled by the semantics above. The semantics only
fix what function *signatures* (parameter and return types) must mean;
internal frame representation is explicitly not part of that contract unless
a future decision makes it so.

---

## 8. Mutability of `this.this`

`this.this` defaults to an immutable reference (`&Outer`) to the enclosing
frame. `&mut this.this` (optionally with an explicit lifetime, e.g.
`this.this : &t mut Outer`) is available when the nested function needs to
mutate enclosing state.

There is **no special-cased borrow-checking behavior for `this.this`** — it
follows the same linear/affine reference rules as any other `&mut` in the
language. A mutable outer reference is *threaded*, not reacquired per call:
if a chain of calls each takes `&t mut Outer` and returns `&t mut Outer`
under a shared lifetime `t`, it is the same reference being moved through
each call in sequence, not a series of independent short-lived borrows. This
is what makes chained mutation (`Counter().add().add().add()`) sound: each
`add()` receives the live mutable reference, mutates through it, and returns
it onward for the next call to receive.

A consequence of ordinary linear borrow rules applying here with no
exception: a function that returns a *value* derived from the reference
(rather than the reference itself) ends the borrow at that point, so
interleaving a read-only call into a mutation chain works exactly when
ordinary borrow-checking would allow it, and fails exactly when it wouldn't
— no additional rule is needed to reason about `this.this` specifically.

---

## 9. Function pointers vs. closures: `::` vs. `.`

**Receiver shorthand.** In a receiver-type position, a bare `&` or `&mut`
(with no explicit type written) is shorthand for `this.this : &Outer` /
`this.this : &mut Outer` — since a receiver-type position can only ever mean
"the enclosing frame, reached via `this.this`," there's nothing ambiguous
lost by omitting the explicit spelling:

```
fn add(&mut, amount: I32) => {
  value += amount   // resolves to this.this.value, per §5 — `add` has no
                     // local named `value`, so name resolution climbs to
                     // Counter's field of that name through the receiver
}
```

**`::` is the ordinary namespace operator**, not a special member-access
rule. `Counter::add` is just namespace-qualified lookup of `add` without
binding any particular instance to it — and per the C-compilation model
(§7), a receiver was always just an implicit leading parameter, so naming
the function *without* an instance necessarily surfaces that parameter
explicitly:

```
let fp : &(&mut Counter, I32) => I32 = Counter::add;
fp(&mut c, 100)   // receiver passed explicitly
```

**`.` is the operator that performs receiver-binding.** `c.add` evaluates to
a closure with the receiver already bound to `c`, and the receiver
disappears from the callable's parameter list — the leftover bare `&mut` in
its type is not a parameter slot but a **capture-mode marker**, recording
that the closure holds a mutable reference to whatever it closed over:

```
let closure : (&mut, I32) => I32 = c.add;
closure(200)   // only the real argument is passed; receiver is already bound
```

**Borrow timing.** The borrow for a bound closure begins at the point of
binding, not at first call — `let closure = c.add;` locks `c` exactly as
`let r = &mut c;` would, for as long as `closure` is alive, whether or not
it is ever invoked. This is not a special case; it is the same rule as §8
applied to a reference that happens to live inside a closure rather than a
bare variable.

**A bound closure holds at most one implicit reference**, regardless of how
deep the function was originally nested. This is not a separate assumption
— it follows from the transitivity requirement in §7: if a function needs to
reach k frames out, that need forces every intermediate ancestor frame to
carry a connection to the next one, so a closure only ever needs to hold a
reference to its *immediate* enclosing frame and walk any further hops
through fields already reachable from that single reference, rather than
capturing a separate reference per hop.

---

## 10. Full worked example

```
fn Counter() => {
  let mut counter = 0;
  fn add() => {
    counter += 1;
    this.this
  }
  this
}
Counter().add().add().add().counter   // => 3
```

- `Counter` — depth 1 (top-level), no `this` param, constructor. Body
  declares local `counter` (which, per §5, is a field of `Counter`'s
  instance), declares nested `add`, returns `this` (Counter's own instance).
- `add` — depth 2, nested inside `Counter`. No `this` param → constructor for
  its own (trivial) frame. Its bare reference to `counter` resolves, per §5,
  to the same field access as `this.this.counter` would — the climb is just
  inserted implicitly by name resolution rather than written explicitly.
  Separately, its `this.this` climbs k=1 to reach and return `Counter`'s
  instance. Because it references `Counter`'s field, `add` is a **closure**,
  not hoisted — a fresh one is bound per `Counter()` call.
- Each `.add()` call returns `this.this` = the same `Counter` instance,
  so the chain keeps landing on Counter and `.add()` remains callable at
  each step. Had `add` returned bare `this` instead, the chain would break
  after one call (`this` would be `add`'s own instance, not Counter's).
- Final `.counter` reads the field off the returned `Counter` instance:
  `3`.

---

## 11. Inner classes fall out for free

```
fn Outer() => {
  fn Inner() => {
    let field = 100
    this
  }
  this
}
Outer().Inner().field   // => 100
```

`Inner` never references `this.this` or any state from `Outer`, so it is
**hoisted** (compiled as a free top-level function) despite being lexically
declared inside `Outer`. It remains reachable as `.Inner()` purely because of
its lexical position — dot-call availability and hoisting status are
orthogonal (§4, §6). No `Outer.this`-style disambiguation syntax (as in Java)
is needed, because nesting position alone establishes the inner-class
relationship; explicit outer-reference syntax (`this.this`) is only needed
when the inner constructor *also* wants to reach back out, which this
example doesn't.

---

## 12. Explicit receiver typing

```
fn Outer(&this.this) => {
  fn Inner(&this.this) => {
    let field = 100
    this
  }
  this
}
Outer().Inner().field   // => 100
```

Receiver-type positions (`&this.this` as a parameter type) are evaluated
using the same climb rule as any other use, from the declaration site's own
nesting depth. For `Outer` (depth 1, sitting directly inside `Module`),
`this.this` resolves to `Module` — a valid but essentially inert receiver in
this case, since it names a fact that was already implicitly true. For
`Inner` (depth 2), `this.this` resolves to `Outer`, giving it an explicit,
typed handle on the enclosing instance. Both remain constructors (their
bodies still return their own `this`); per §4, taking this explicit receiver
also makes each of them a **method** at the same time — the explicit
receiver doesn't reclassify away constructor-ness, it just adds method-ness
alongside it, making the default implicit connection (§9) into an explicit,
named parameter.
