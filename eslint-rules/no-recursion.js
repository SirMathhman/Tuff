// Reports functions that call themselves through a chain of direct calls
// within one file. Recursion that closes only through a parameter (passing a
// function as an argument and calling the parameter) is allowed.
//
// Call graph edges, F -> G, mean F directly calls G:
// - F calls a function by name, `G(...)`, where G is a function declaration,
//   or a variable initialised with a function (aliases such as `const g = f`
//   are followed);
// - F calls a method as `x.name(...)` or `this.name(...)`, and G is a method
//   named `name`. Methods are matched by name only, so two unrelated objects
//   with a method of the same name can produce a false positive;
// - G is lexically nested inside F (a closure defined in F may be called by F).
// Passing a function as a value is not an edge, and calling a parameter is not
// an edge. Scope analysis resolves names, so shadowing is handled. Only one file
// is examined. Methods with computed keys (`o["m"]()`) are not matched.

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

// The initialiser of a variable declaration, or null.
function initOf(def) {
  if (def.type !== "Variable") return null;
  const { node } = def;
  return node.init ?? null;
}

// The function node a variable denotes, or null.
function functionForVariable(variable) {
  for (const def of variable.defs) {
    if (def.type === "FunctionName") return def.node;
    const init = initOf(def);
    if (init && isFunction(init)) return init;
  }
  return null;
}

// The variable that `variable` is initialised from (`const g = f`), or null.
function aliasSource(variable, variableOf) {
  for (const def of variable.defs) {
    const init = initOf(def);
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

// The name a function is stored under as an object property or class method.
function methodName(fn) {
  const { parent } = fn;
  if (!parent) return null;
  if (
    (parent.type === "Property" || parent.type === "MethodDefinition") &&
    parent.value === fn &&
    !parent.computed
  ) {
    const { key } = parent;
    if (key.type === "Identifier") return key.name;
  }
  return null;
}

function functionName(fn) {
  const { id } = fn;
  if (id) return id.name;
  const { parent } = fn;
  if (parent && parent.type === "VariableDeclarator") {
    const { id } = parent;
    if (id.type === "Identifier") return id.name;
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

// The functions a call by name may invoke, or [] for anything else.
function directTargets(variable, variableOf) {
  const fn = functionForVariable(resolveAlias(variable, variableOf));
  return fn ? [fn] : [];
}

// The name called by a method-call expression `x.name(...)`, or null.
function calledMethodName(call) {
  const { callee } = call;
  const { property } = callee;
  return property.name;
}

function callGraph({ functions, refs, variableOf, methods, memberCalls }) {
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
    const { identifier } = ref;
    const call = identifier.parent;
    if (!call || call.type !== "CallExpression" || call.callee !== identifier) {
      continue;
    }
    const from = enclosingFunction(identifier);
    if (!from) continue;
    for (const target of directTargets(ref.resolved, variableOf)) {
      addEdge(from, target);
    }
  }
  for (const call of memberCalls) {
    const from = enclosingFunction(call);
    if (!from) continue;
    for (const target of methods.get(calledMethodName(call)) || []) {
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
        "Disallow functions that call themselves through direct calls within a file.",
    },
    schema: [],
    messages: {
      recursive:
        'Recursion is not allowed: "{{name}}" can reach itself through a chain of direct calls.',
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
        const { callee } = node;
        if (callee.type === "MemberExpression" && !callee.computed) {
          const { property } = callee;
          if (property.type === "Identifier") memberCalls.push(node);
        }
      },
      "Program:exit"() {
        const { sourceCode } = context;
        const refs = collectResolvedRefs(sourceCode.scopeManager);
        const variableOf = new Map(
          refs.map((ref) => [ref.identifier, ref.resolved]),
        );
        const edges = callGraph({
          functions,
          refs,
          variableOf,
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
