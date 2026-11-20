// Reports any function that can reach itself through the calls in its file.
//
// Call graph edges, F -> G, mean F may invoke G:
// - a reference inside F resolves to G (a direct call, or passing G as a value);
// - G is lexically nested inside F (a closure may be invoked by F);
// - F calls one of its parameters, and G is a function that may be passed into
//   that parameter by some call site. This is found by a fixpoint over call
//   arguments, so passing functions through parameters does not hide cycles.
// Scope analysis resolves names, so shadowing is handled. Only one file is
// examined; recursion that crosses files is not detected.

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

function functionName(fn) {
  if (fn.id) return fn.id.name;
  if (
    fn.parent &&
    fn.parent.type === "VariableDeclarator" &&
    fn.parent.id.type === "Identifier"
  ) {
    return fn.parent.id.name;
  }
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
    const edges = new Map();

    function addEdge(from, to) {
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from).add(to);
    }

    return {
      ":function"(node) {
        functions.push(node);
        const outer = enclosingFunction(node);
        if (outer) addEdge(outer, node);
      },
      "Program:exit"() {
        const refs = [];
        for (const scope of context.sourceCode.scopeManager.scopes) {
          for (const ref of scope.references) {
            if (ref.resolved) refs.push(ref);
          }
        }

        // slotsOf(fn)[i]: the functions that may be passed as argument i of fn.
        const slots = new Map();
        function slotsOf(fn) {
          if (!slots.has(fn))
            slots.set(
              fn,
              fn.params.map(() => new Set()),
            );
          return slots.get(fn);
        }

        // Functions a variable may denote at this point of the analysis.
        function targetsOf(variable) {
          const fn = functionForVariable(variable);
          if (fn) return [fn];
          const slot = parameterSlot(variable);
          if (slot) return [...slotsOf(slot.fn)[slot.index]];
          return [];
        }

        const variableOf = new Map(
          refs.map((ref) => [ref.identifier, ref.resolved]),
        );
        function valuesOfArgument(arg) {
          if (isFunction(arg)) return [arg];
          if (arg.type === "Identifier" && variableOf.has(arg))
            return targetsOf(variableOf.get(arg));
          return [];
        }

        // Fixpoint: keep propagating argument values into parameter slots.
        let changed = true;
        while (changed) {
          changed = false;
          for (const ref of refs) {
            const call = ref.identifier.parent;
            if (
              !call ||
              call.type !== "CallExpression" ||
              call.callee !== ref.identifier
            )
              continue;
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

        for (const ref of refs) {
          const from = enclosingFunction(ref.identifier);
          if (!from) continue;
          for (const target of targetsOf(ref.resolved)) addEdge(from, target);
        }

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
