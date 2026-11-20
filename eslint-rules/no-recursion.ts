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
// is examined. Methods with computed keys are not matched.
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

type Variable = TSESLint.Scope.Variable;
type Reference = TSESLint.Scope.Reference;

function isFunction(node: TSESTree.Node | undefined): node is FunctionNode {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  );
}

function enclosingFunction(node: TSESTree.Node): FunctionNode | undefined {
  let cur: TSESTree.Node | undefined = node.parent ?? undefined;
  while (cur) {
    if (isFunction(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

// The initialiser of a variable declaration, or undefined when there is none.
function initOf(variable: Variable): TSESTree.Expression | undefined {
  for (const def of variable.defs) {
    if (def.type === "Variable") {
      const { init } = def.node;
      return init ?? undefined;
    }
  }
  return undefined;
}

// The function node a variable denotes, or undefined.
function functionForVariable(variable: Variable): FunctionNode | undefined {
  for (const def of variable.defs) {
    if (def.type === "FunctionName") {
      const { node } = def;
      if (isFunction(node)) return node;
    }
  }
  const init = initOf(variable);
  if (isFunction(init ?? undefined)) return init as FunctionNode;
  return undefined;
}

// The variable that `variable` is initialised from (`const g = f`), or undefined.
function aliasSource(
  variable: Variable,
  variableOf: Map<TSESTree.Node, Variable>,
): Variable | undefined {
  const init = initOf(variable);
  if (init?.type === "Identifier") return variableOf.get(init);
  return undefined;
}

// Follows alias chains to the variable that holds the original value.
function resolveAlias(
  variable: Variable,
  variableOf: Map<TSESTree.Node, Variable>,
): Variable {
  let current = variable;
  const seen = new Set<Variable>();
  while (!seen.has(current)) {
    seen.add(current);
    const next = aliasSource(current, variableOf);
    if (next === undefined) break;
    current = next;
  }
  return current;
}

// The name a function is stored under as an object property or class method.
function methodName(fn: FunctionNode): string | undefined {
  const { parent } = fn;
  if (parent?.type === "Property" || parent?.type === "MethodDefinition") {
    const { key, value, computed } = parent;
    if (value === fn && !computed && key.type === "Identifier") return key.name;
  }
  return undefined;
}

function functionName(fn: FunctionNode): string {
  const { id, parent } = fn;
  if (id) return id.name;
  if (parent?.type === "VariableDeclarator") {
    const { id: declared } = parent;
    if (declared.type === "Identifier") return declared.name;
  }
  return methodName(fn) ?? "<anonymous function>";
}

// Iterative search, so the rule itself does not recurse.
function reaches(
  start: FunctionNode,
  target: FunctionNode,
  edges: Map<FunctionNode, Set<FunctionNode>>,
): boolean {
  const seen = new Set<FunctionNode>();
  const stack = [...(edges.get(start) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of edges.get(node) ?? []) stack.push(next);
  }
  return false;
}

function collectResolvedRefs(
  scopeManager: TSESLint.Scope.ScopeManager,
): Reference[] {
  const refs: Reference[] = [];
  for (const scope of scopeManager.scopes) {
    for (const ref of scope.references) {
      if (ref.resolved) refs.push(ref);
    }
  }
  return refs;
}

// The functions a call by name may invoke, or [] for anything else.
function directTargets(
  variable: Variable,
  variableOf: Map<TSESTree.Node, Variable>,
): FunctionNode[] {
  const fn = functionForVariable(resolveAlias(variable, variableOf));
  return fn ? [fn] : [];
}

// The name of the method called by `x.name(...)`, or undefined for other calls.
function calledMethodName(call: TSESTree.CallExpression): string | undefined {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.computed) return undefined;
  const { property } = callee;
  return property.type === "Identifier" ? property.name : undefined;
}

interface CallGraphInput {
  functions: FunctionNode[];
  refs: Reference[];
  variableOf: Map<TSESTree.Node, Variable>;
  methods: Map<string, FunctionNode[]>;
  memberCalls: TSESTree.CallExpression[];
}

function callGraph({
  functions,
  refs,
  variableOf,
  methods,
  memberCalls,
}: CallGraphInput): Map<FunctionNode, Set<FunctionNode>> {
  const edges = new Map<FunctionNode, Set<FunctionNode>>();
  const addEdge = (from: FunctionNode, to: FunctionNode): void => {
    const set = edges.get(from) ?? new Set<FunctionNode>();
    set.add(to);
    edges.set(from, set);
  };

  for (const fn of functions) {
    const outer = enclosingFunction(fn);
    if (outer) addEdge(outer, fn);
  }
  for (const ref of refs) {
    const { identifier } = ref;
    const call = identifier.parent;
    if (call?.type !== "CallExpression" || call.callee !== identifier) continue;
    const from = enclosingFunction(identifier);
    if (!from || !ref.resolved) continue;
    for (const target of directTargets(ref.resolved, variableOf)) {
      addEdge(from, target);
    }
  }
  for (const call of memberCalls) {
    const from = enclosingFunction(call);
    const name = calledMethodName(call);
    if (!from || name === undefined) continue;
    for (const target of methods.get(name) ?? []) addEdge(from, target);
  }
  return edges;
}

const noRecursion: TSESLint.RuleModule<string, []> = {
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
  defaultOptions: [],
  create(context) {
    const functions: FunctionNode[] = [];
    const methods = new Map<string, FunctionNode[]>();
    const memberCalls: TSESTree.CallExpression[] = [];

    return {
      ":function"(node: FunctionNode) {
        functions.push(node);
        const name = methodName(node);
        if (name !== undefined) {
          const list = methods.get(name) ?? [];
          list.push(node);
          methods.set(name, list);
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (calledMethodName(node) !== undefined) memberCalls.push(node);
      },
      "Program:exit"() {
        const { sourceCode } = context;
        const { scopeManager } = sourceCode;
        if (!scopeManager) return;
        const refs = collectResolvedRefs(scopeManager);
        const variableOf = new Map<TSESTree.Node, Variable>();
        for (const ref of refs) {
          if (ref.resolved) variableOf.set(ref.identifier, ref.resolved);
        }
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
