# Security Concerns

This document describes the trust boundaries of Tuff, what untrusted input can reach, and the controls the architecture should have. Each control is marked as present or missing. This describes the target design, so a missing control is a gap to close, not a note about past work.

Related: [ARCHITECTURE.md](../ARCHITECTURE.md) for the design and its known problems, [language.md](language.md) for what a program may do, and [README.md](../README.md) for setup.

## What the interpreter is

Tuff is an embeddable interpreter. The embedding code calls `interpretTuff(source, hostValues, modules)` or `interpretModules(entry, sources, hostModules, actuals)`. The interpreter itself has no access to the file system, the network, environment variables, or processes. It contains no `eval` or dynamic code generation (enforced by the `no-eval`, `no-implied-eval`, and `no-new-func` lint rules).

Anything the program can do outside its own computation goes through a host function or a host value that the embedder declared.

## Trust boundaries

| Boundary       | Trusted side          | Untrusted side                                                   | Crossing                                         |
| -------------- | --------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| Program source | Interpreter           | Tuff source text, which may come from a user, a file, or a model | `interpretTuff`, `interpretModules`              |
| Module loading | Embedder's source map | Any module path a program imports                                | `ModuleLoader`, `sources` map                    |
| Host functions | Embedder's JavaScript | Arguments that a Tuff program computes                           | `callExternal`, `callHostFunction` (src/host.ts) |
| Host values    | Embedder              | The value the program reads with `declare let`                   | `hostValues` map                                 |
| Results        | Interpreter           | The host reads the returned number or error                      | return value                                     |

## What untrusted input can reach

- **Computation.** A program can run arithmetic, loops, recursion, and array and struct operations. This is bounded by the limits below, not by the language.
- **Host functions.** A program can call any host function the embedder declared, with arguments that are numbers or booleans. A program cannot call a host function that was not declared.
- **Host values.** A program can read any host value that was declared.
- **Modules.** A program can import any module that the loader resolves. The default loader returns nothing, so no modules are reachable unless the embedder supplies them.

The interpreter does not write to any host state except through host functions.

## Controls

| Control                                                | Purpose                                                                          | Status                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| No dynamic code execution                              | Source text is never run as JavaScript                                           | Present (lint rules)                                                                                |
| No file, network, or process access in the interpreter | The only effects are host calls                                                  | Present (verified in index.ts, modules.ts, src/)                                                    |
| Explicit host allowlist                                | A program reaches only the host functions and values it was given                | Present (`hostValues` map, `declare fn`/`declare let`)                                              |
| Argument type restriction for host calls               | Host functions receive only numbers and booleans                                 | Present (`callHostFunction`)                                                                        |
| Return type check for host calls                       | A host result that does not match the declared type is rejected                  | Present (`callHostFunction`, `returnType`)                                                          |
| Per-loop iteration limit                               | Stops a single loop from running forever                                         | Present (`MAX_LOOP_ITERATIONS`, value in [language.md](language.md#limits))                         |
| Call depth limit                                       | Stops unbounded recursion                                                        | Present (`MAX_CALL_DEPTH`, value in [language.md](language.md#limits))                              |
| Validate before effects                                | A program is fully checked for syntax before any host call runs                  | Missing. See Partial execution below                                                                |
| Global step budget                                     | Bounds total work across nested loops and branches                               | Missing. See Resource exhaustion below                                                              |
| Parse-time work bound                                  | Bounds the cost of parsing untaken branches                                      | Missing. See [ARCHITECTURE.md](../ARCHITECTURE.md#potential-problems) for the measurements          |
| Host exception boundary                                | A throwing host function becomes a structured error, not an escaped exception    | Missing. See [ARCHITECTURE.md](../ARCHITECTURE.md#potential-problems)                               |
| Module names as map keys                               | Module paths resolve only to the embedder's source map, never to the file system | Present (interpreter does no file access); the embedder's loader must still reject unexpected names |

## Partial execution

Evaluation is single-pass (ARCHITECTURE.md, Overview), so a host call runs as soon as the parser reaches it. A program that calls a state-changing host function and then has a syntax error has already changed state, and the error is returned as if the program had not run. An embedder must not treat an error result as "no effect".

Missing: a check-only pass that parses the whole program with host calls stubbed and reports any syntax error before the first real effect. Until then, the rule for embedders is to treat every error as possibly partial.

## Prompt injection

Tuff programs may be written by a model. A model can be influenced by text it reads, so a program that a model writes may do what an attacker asked. The architecture reduces the effect of this rather than trying to detect it:

- A program has no ambient authority. Its only effects are the host functions and values the embedder declared, so the embedder controls the blast radius by choosing what to declare.
- Host functions should be declared with the narrowest behavior that the task needs. Each declared host function is a capability.
- Host function results are not trusted by the interpreter. Their declared return type is checked, but the value itself is not validated beyond that. An embedder that exposes a host function with side effects must treat every call as an action the program requested.

Missing: a per-run capability description that the embedder can show to a reviewer before running a program.

## Data exposure

- A program can read every host value it was given. An embedder must not declare secrets as host values unless the program needs them.
- Error messages include names of host functions and values, and they are returned to the caller. An embedder that shows errors to a less-trusted party should filter them.

Missing: a rule that errors never include a host value's content, only its name and type.

## Unauthenticated state changes

The interpreter has no persistent state of its own. Every state change is a host function call. Because the interpreter does not authenticate the caller of a host function, any program that can reach a state-changing host function can change that state. The architecture requires that state-changing host functions are declared only to programs that are allowed to make that change, and the embedder authenticates the request before running the program.

Missing: a convention that host functions with side effects are named distinctly and listed separately, so a reviewer can see them.

## Resource exhaustion

Untrusted source can exhaust time and memory:

- Nested loops multiply the per-loop limit.
- Nested statement-level `if` branches are parsed exponentially often. The measurements are in [ARCHITECTURE.md](../ARCHITECTURE.md#potential-problems).
- Deeply nested expressions use JavaScript stack frames across the grammar's mutual recursion. 2000 nested parentheses still evaluate, so the stack is not exhausted at that depth, but no nesting limit exists and the failure point has not been measured.

The fixes are the global step budget, single-pass branch parsing, and a nesting limit on expressions. A host that runs untrusted programs should also run them in a worker with a time limit until the budget exists.

## Summary of gaps, in order of risk

1. Parse-time exponential cost in nested branches (denial of service from untrusted source).
2. No global step budget (denial of service from nested loops).
3. Host exceptions escape `interpretTuff`.
4. No expression nesting limit; the depth at which the JavaScript stack fails is unmeasured.
5. Partial execution: host calls run before a later syntax error is found, so an error does not mean nothing happened.
