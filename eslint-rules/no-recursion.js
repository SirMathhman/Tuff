// Reports any function that can reach itself through the calls in its file.
//
// Call graph edges, F -> G, mean F may invoke G:
// - a reference inside F resolves to G (a direct call, or passing G as a value);
// - G is lexically nested inside F (a closure may be invoked by F);
// - F calls one of its parameters, and G is a function that may be passed into
//   that parameter by some call site. This is found by a fixpoint over call
//   arguments, so passing functions through parameters does not hide cycles;
// - F calls a method as `x.name(...)` (or `this.name(...)`), and G is a method
//   whose key is `name`. Methods are matched by name only, so two unrelated
//   objects with a method of the same name can produce a false positive;
// - a variable initialised from another variable (`const g = f`) denotes the
//   same function as that variable.
// Scope analysis resolves names, so shadowing is handled. Only one file is
// examined; recursion that crosses files is not detected. Methods with computed
// keys (`o["m"]()`) are not matched.

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

function isFunction(node) {
  return FUNCTION_TYPES.has(node.type);
}

function enclosingFunction(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (isFunction(cur)) return cur;
  }
  return null;
}

// The function node a variable denotes, or null.
function functionForVariable(variable) {
  for (const def of variable.defs) {
    if (def.type === "FunctionName") return def.node;
    if (def.type === "Variable" && def.node.init && isFunction(def.node.init)) {
      return def.node.init;
    }
  }
  return null;
}

// The variable that `variable` is initialised from (`const g = f`), or null.
function aliasSource(variable, variableOf) {
  for (const def of variable.defs) {
    const init = def.type === "Variable" ? def.node.init : null;
    if (init && init.type === "Identifier" && variableOf.has(init)) {
      return variableOf.get(init);
    }
  }
  return null;
}

// Follows alias chains to the variable that holds the original value.
function resolveAlias(variable, variableOf) {
  let current = variable;
  const seen = new Set();
  while (!seen.has(current)) {
    seen.add(current);
    const next = aliasSource(current, variableOf);
    if (!next) break;
    current = next;
  }
  return current;
}

// For a parameter variable: the function that declares it and its position.
function parameterSlot(variable) {
  for (const def of variable.defs) {
    if (def.type === "Parameter") {
      const index = def.node.params.indexOf(def.name);
      if (index >= 0) return { fn: def.node, index };
    }
  }
  return null;
}

// The name a function is stored under as an object property or class method.
function methodName(fn) {
  const parent = fn.parent;
  if (
    parent &&
    (parent.type === "Property" || parent.type === "MethodDefinition") &&
    parent.value === fn &&
    !parent.computed &&
    parent.key.type === "Identifier"
  ) {
    return parent.key.name;
  }
  return null;
}

function functionName(fn) {
  if (fn.id) return fn.id.name;
  if (
    fn.parent &&
    fn.parent.type === "VariableDeclarator" &&
    fn.parent.id.type === "Identifier"
  ) {
    return fn.parent.id.name;
  }
  const method = methodName(fn);
  if (method) return method;
  return "<anonymous function>";
}

// Iterative search, so the rule itself does not recurse.
function reaches(start, target, edges) {
  const seen = new Set();
  const stack = [...(edges.get(start) || [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of edges.get(node) || []) stack.push(next);
  }
  return false;
}

function collectResolvedRefs(scopeManager) {
  const refs = [];
  for (const scope of scopeManager.scopes) {
    for (const ref of scope.references) {
      if (ref.resolved) refs.push(ref);
    }
  }
  return refs;
}

// Works out which functions each variable may denote, by propagating the
// functions passed as arguments into parameter slots until nothing changes.
function argumentFlow(refs, variableOf) {
  const slots = new Map();
  function slotsOf(fn) {
    if (!slots.has(fn))
      slots.set(
        fn,
        fn.params.map(() => new Set()),
      );
    return slots.get(fn);
  }

  function targetsOf(variable) {
    const resolved = resolveAlias(variable, variableOf);
    const fn = functionForVariable(resolved);
    if (fn) return [fn];
    const slot = parameterSlot(resolved);
    if (slot) return [...slotsOf(slot.fn)[slot.index]];
    return [];
  }

  function valuesOfArgument(arg) {
    if (isFunction(arg)) return [arg];
    if (arg.type === "Identifier" && variableOf.has(arg)) {
      return targetsOf(variableOf.get(arg));
    }
    return [];
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const ref of refs) {
      const call = ref.identifier.parent;
      if (
        !call ||
        call.type !== "CallExpression" ||
        call.callee !== ref.identifier
      ) {
        continue;
      }
      for (const target of targetsOf(ref.resolved)) {
        call.arguments.forEach((arg, i) => {
          if (i >= target.params.length) return;
          for (const value of valuesOfArgument(arg)) {
            const slot = slotsOf(target)[i];
            if (!slot.has(value)) {
              slot.add(value);
              changed = true;
            }
          }
        });
      }
    }
  }
  return targetsOf;
}

function callGraph({ functions, refs, targetsOf, methods, memberCalls }) {
  const edges = new Map();
  function addEdge(from, to) {
    if (!edges.has(from)) edges.set(from, new Set());
    edges.get(from).add(to);
  }

  for (const fn of functions) {
    const outer = enclosingFunction(fn);
    if (outer) addEdge(outer, fn);
  }
  for (const ref of refs) {
    const from = enclosingFunction(ref.identifier);
    if (!from) continue;
    for (const target of targetsOf(ref.resolved)) addEdge(from, target);
  }
  for (const call of memberCalls) {
    const from = enclosingFunction(call);
    if (!from) continue;
    for (const target of methods.get(call.callee.property.name) || []) {
      addEdge(from, target);
    }
  }
  return edges;
}

const noRecursion = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow functions that call themselves, directly or indirectly, within a file.",
    },
    schema: [],
    messages: {
      recursive:
        'Recursion is not allowed: "{{name}}" can reach itself through a call cycle.',
    },
  },
  create(context) {
    const functions = [];
    const methods = new Map(); // method name -> function nodes
    const memberCalls = []; // CallExpression nodes of the form x.name(...)

    return {
      ":function"(node) {
        functions.push(node);
        const name = methodName(node);
        if (name !== null) {
          if (!methods.has(name)) methods.set(name, []);
          methods.get(name).push(node);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ) {
          memberCalls.push(node);
        }
      },
      "Program:exit"() {
        const refs = collectResolvedRefs(context.sourceCode.scopeManager);
        const variableOf = new Map(
          refs.map((ref) => [ref.identifier, ref.resolved]),
        );
        const targetsOf = argumentFlow(refs, variableOf);
        const edges = callGraph({
          functions,
          refs,
          targetsOf,
          methods,
          memberCalls,
        });

        for (const fn of functions) {
          if (reaches(fn, fn, edges)) {
            context.report({
              node: fn,
              messageId: "recursive",
              data: { name: functionName(fn) },
            });
          }
        }
      },
    };
  },
};

export default noRecursion;
