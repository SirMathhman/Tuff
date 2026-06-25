function Ok(value) {
  return { variant: "ok", value };
}

function Err(error) {
  return { variant: "err", error };
}

import { tokenize } from "./tokenizer.js";
import { parse, NodeType } from "./parser.js";
import { generate } from "./codegen.js";

// Collect exported names from an AST node
function collectExports(node) {
  const exports = [];
  if (!node.type) return exports;
  switch (node.type) {
    case NodeType.Program:
      for (const child of node.body) {
        exports.push(...collectExports(child));
      }
      break;
    case NodeType.ExportStatement:
      exports.push(node.name);
      break;
  }
  return exports;
}

// Compile Tuff entry module with native JS modules included verbatim.
export function compileModulesWithNative(
  tuffModuleNames,
  tuffSources,
  nativeModules,
) {
  // Collect all known identifiers for validation (tuff + native module names)
  const extraKnownIds = [
    ...Object.keys(tuffSources),
    ...Object.keys(nativeModules || {}),
  ];

  // Compile Tuff sources
  const compiledTuff = {};
  for (const [name, source] of Object.entries(tuffSources)) {
    if (!source && source !== "")
      return Err(`Missing source for module '${name}'`);

    const entryPoint = name === tuffModuleNames[0];
    const result = compileSourceToJS(source, {
      includePreamble: false,
      isEntryPoint: entryPoint,
      extraKnownIds,
    });
    if (result.variant === "err") return Err(result.error);

    compiledTuff[name] = result.value;
  }

  // Build wiring lines for Tuff module exports
  const exportWiringLines = [];
  for (const [name, info] of Object.entries(compiledTuff)) {
    if (info.exports.length > 0) {
      exportWiringLines.push(`_ctx.${name} = {};`);
      for (const expName of info.exports) {
        exportWiringLines.push(
          `_ctx.${name}.${expName} = _ctx.__exports.${expName};`,
        );
      }
    }
  }

  // Assemble final output: preamble → native modules → Tuff deps → wiring → entry module
  const jsParts = [];

  // Include native JS verbatim first (wrapped to register exports)
  for (const [name, js] of Object.entries(nativeModules || {})) {
    // Initialize _ctx[name] so transformed export statements can write directly to it
    jsParts.push(`_ctx.${name} = {};`);
    // Transform "export const/let/var X = ..." into "_ctx.NAME.X = ..." so it runs in a function body
    let transformedJs = js.replace(
      /export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g,
      `_ctx.${name}["$1"]`,
    );
    // Transform "export function NAME(..." into "_ctx.NAME['NAME'] = function NAME(..." so it runs in a function body
    transformedJs = transformedJs.replace(
      /export\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      `_ctx.${name}["$1"] = function $1(`,
    );
    jsParts.push(transformedJs);
  }

  // Run Tuff dependency modules (non-entry)
  const entryModule = tuffModuleNames[0];
  for (const name of Object.keys(compiledTuff)) {
    if (name !== entryModule) {
      jsParts.push(compiledTuff[name].code);
    }
  }

  // Wire exports after dependencies have run
  if (exportWiringLines.length > 0) {
    jsParts.push(exportWiringLines.join("\n"));
  }

  // Run entry module last
  for (const name of tuffModuleNames) {
    if (!compiledTuff[name]) return Err(`Unknown Tuff module '${name}'`);
    jsParts.push(compiledTuff[name].code);
  }

  const preamble = `var _ctx = {};
const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));`;
  return Ok([preamble, ...jsParts].join("\n"));
}

// Compile a single Tuff source to JS body (no preamble).
function compileSourceToJS(source, options = {}) {
  const { includePreamble = true, isEntryPoint } = Object.assign(
    { isEntryPoint: true },
    options,
  );

  const tokensResult = tokenize(source);
  if (tokensResult.variant === "err") return Err(tokensResult.error);

  const astResult = parse(tokensResult.value);
  if (astResult.variant === "err") return Err(astResult.error);

  // Validate identifiers against builtins and declared variables
  const knownIdentifiers = new Set(["read"]);
  // Module names that are native JS bindings — allow any method call on them
  const externModuleNames = new Set(options.extraKnownIds || []);
  for (const id of options.extraKnownIds || []) {
    knownIdentifiers.add(id);
  }
  const validateResult = validateIdentifiers(
    astResult.node,
    knownIdentifiers,
    externModuleNames,
  );
  if (!validateResult.ok) return Err(validateResult.error);

  const jsResult = generate(astResult.node, { includePreamble, isEntryPoint });
  if (jsResult.variant === "err") return Err(jsResult.error);

  return Ok({ code: jsResult.node, exports: collectExports(astResult.node) });
}

// Validate that all identifiers in the AST are known builtins or declared variables
// externModuleNames: set of module names bound to native JS — allow any method call on them
function validateIdentifiers(node, knownIds, externModuleNames = new Set()) {
  if (!node.type) return { ok: true };

  switch (node.type) {
    case NodeType.StructDeclaration:
      // extern let bindings register a known identifier + allow arbitrary method calls
      if (node.name === "extern_let" && node.bindingName) {
        knownIds.add(node.bindingName);
        externModuleNames.add(node.bindingName);
      }
      return { ok: true };
    case NodeType.TypeAlias:
      // Compile-time declarations don't reference unknown identifiers at runtime
      return { ok: true };
    case NodeType.FunctionDeclaration: {
      knownIds.add(node.name);
      const fnScope = new Set(knownIds);
      if (node.params) {
        for (const param of node.params) {
          // 'this' as a receiver is always valid, don't add it to knownIds
          // since codegen handles it specially
          if (param !== "this") {
            fnScope.add(param);
          }
        }
      }
      return validateIdentifiers(node.body, fnScope, externModuleNames);
    }
    case NodeType.Program:
      for (const child of node.body) {
        const result = validateIdentifiers(child, knownIds, externModuleNames);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.LetStatement:
      // Destructuring: register each binding name as a known identifier
      if (node.bindings) {
        for (const b of node.bindings) {
          knownIds.add(b);
          // Track mutable destructured variables for assignment validation
          if (node.mutable) {
            knownIds.add(`__mutable_${b}`);
          }
        }
      } else {
        knownIds.add(node.name);
        // Track mutable variables for assignment validation
        if (node.mutable) {
          knownIds.add(`__mutable_${node.name}`);
        }
      }
      return validateIdentifiers(node.value, knownIds, externModuleNames);
    case NodeType.IfExpression: {
      const condResult = validateIdentifiers(
        node.condition,
        knownIds,
        externModuleNames,
      );
      if (!condResult.ok) return condResult;
      const thenResult = validateIdentifiers(
        node.thenBranch,
        knownIds,
        externModuleNames,
      );
      if (!thenResult.ok) return thenResult;
      const elseResult = validateIdentifiers(
        node.elseBranch,
        knownIds,
        externModuleNames,
      );
      if (!elseResult.ok) return elseResult;
      return { ok: true };
    }
    case NodeType.BooleanLiteral:
      // Boolean literals are builtins, nothing to validate
      return { ok: true };
    case NodeType.ExternImportStatement:
      // Register each imported binding as a known identifier
      for (const b of node.bindings) {
        knownIds.add(b);
      }
      return { ok: true };
    case NodeType.AssignmentStatement: {
      // Direct this.x assignment — target must be a known mutable variable
      if (node.target) {
        const mutableKey = `__mutable_${node.target}`;
        if (!knownIds.has(mutableKey)) {
          return {
            ok: false,
            error: `Cannot assign to '${node.target}' (not declared as mutable)`,
          };
        }
      }
      // General expression-based assignment — validate target and value
      if (node.targetExpr) {
        const targetResult = validateIdentifiers(
          node.targetExpr,
          knownIds,
          externModuleNames,
        );
        if (!targetResult.ok) return targetResult;
      }
      return validateIdentifiers(node.value, knownIds, externModuleNames);
    }
    case NodeType.ExportStatement: {
      // Register exported function names as known identifiers
      if (node.isFunctionExport) {
        knownIds.add(node.name);
      }
      // For value exports, still validate the expression
      if (!node.isFunctionExport && node.value) {
        return validateIdentifiers(node.value, knownIds, externModuleNames);
      }
      // Validate function body for function exports
      if (node.isFunctionExport && node.value?.body) {
        const fnScope = new Set(knownIds);
        if (node.value.params) {
          for (const param of node.value.params) {
            if (param !== "this") {
              fnScope.add(param);
            }
          }
        }
        return validateIdentifiers(node.value.body, fnScope, externModuleNames);
      }
      return { ok: true };
    }
    case NodeType.ExpressionStatement:
      return validateIdentifiers(node.expression, knownIds, externModuleNames);
    case NodeType.Identifier:
      if (!knownIds.has(node.name)) {
        return { ok: false, error: `Unknown identifier: ${node.name}` };
      }
      return { ok: true };
    case NodeType.CallExpression:
      // Call on FQN path or dot expression: callee(args)
      if (node.callee) {
        const calleeResult = validateIdentifiers(
          node.callee,
          knownIds,
          externModuleNames,
        );
        if (!calleeResult.ok) return calleeResult;
      } else {
        // Builtins or user-declared functions
        if (!knownIds.has(node.name)) {
          return { ok: false, error: `Unknown function: ${node.name}` };
        }
      }
      for (const arg of node.arguments) {
        const result = validateIdentifiers(arg, knownIds, externModuleNames);
        if (!result.ok) return result;
      }
      return { ok: true };
    case NodeType.MethodCallExpression: {
      // Validate arguments and object expression regardless.
      for (const arg of node.arguments) {
        const result = validateIdentifiers(arg, knownIds, externModuleNames);
        if (!result.ok) return result;
      }
      const objResult = validateIdentifiers(
        node.object,
        knownIds,
        externModuleNames,
      );
      if (!objResult.ok) return objResult;

      // Only check method name against known IDs if the object is NOT an extern-bound module.
      // Extern modules (native JS bindings) can have arbitrary methods we can't statically know about.
      const isExternModule =
        node.object.type === NodeType.Identifier &&
        externModuleNames.has(node.object.name);
      if (!isExternModule && !knownIds.has(node.methodName)) {
        return { ok: false, error: `Unknown method: ${node.methodName}` };
      }
      return { ok: true };
    }
    case NodeType.BinaryExpression: {
      const leftResult = validateIdentifiers(
        node.left,
        knownIds,
        externModuleNames,
      );
      if (!leftResult.ok) return leftResult;
      return validateIdentifiers(node.right, knownIds, externModuleNames);
    }
    case NodeType.QualifiedPathExpression:
      // Validate the object part and property access (property is just a string)
      return validateIdentifiers(node.object, knownIds, externModuleNames);
    case NodeType.ThisExpression:
      // "this" is always valid — resolves to _ctx at runtime
      return { ok: true };
  }

  return { ok: true };
}

export function compileTuffToJS(source) {
  const result = compileSourceToJS(source, true);
  if (result.variant === "err") return Err(result.error);
  return Ok(result.value.code);
}

// Compile multiple modules and concatenate their generated JS.
export function compileModulesToJS(moduleNames, moduleSources) {
  // Collect all other module names so they're valid identifiers during validation
  const extraKnownIds = Object.keys(moduleSources);

  // First pass: compile all known sources (entry + implicit dependencies)
  const compiled = {};
  for (const [name, source] of Object.entries(moduleSources)) {
    if (!source && source !== "")
      return Err(`Missing source for module '${name}'`);

    // Only the first entry in moduleNames is the true entry point.
    const entryPoint = name === moduleNames[0];
    const result = compileSourceToJS(source, {
      includePreamble: false,
      isEntryPoint: entryPoint,
      extraKnownIds,
    });
    if (result.variant === "err") return Err(result.error);

    compiled[name] = result.value;
  }

  // Build wiring lines that copy exports from __exports into module namespace
  const exportWiringLines = [];
  for (const [name, info] of Object.entries(compiled)) {
    if (info.exports.length > 0) {
      exportWiringLines.push(`_ctx.${name} = {};`);
      for (const expName of info.exports) {
        exportWiringLines.push(
          `_ctx.${name}.${expName} = _ctx.__exports.${expName};`,
        );
      }
    }
  }

  // Collect all non-entry module names (explicit + implicit dependencies)
  const entryModule = moduleNames[0];
  const depModules = Object.keys(compiled).filter(
    (name) => name !== entryModule,
  );

  // Run dependency modules first, wire exports, then run entry module last
  const jsParts = [];
  for (const name of depModules) {
    jsParts.push(compiled[name].code);
  }
  if (exportWiringLines.length > 0) {
    jsParts.push(exportWiringLines.join("\n"));
  }
  // Run entry module last
  for (const name of moduleNames) {
    if (!compiled[name]) return Err(`Unknown module '${name}'`);
    jsParts.push(compiled[name].code);
  }

  // Check if any module has exports — need __exports namespace
  const hasExports = Object.values(compiled).some(
    (info) => info.exports.length > 0,
  );

  const preamble = `var _ctx = ${hasExports ? "{ __exports: {} }" : "{}"};
const tokens = stdIn.split(/\\s+/).map(t => parseInt(t, 10));`;
  return Ok([preamble, ...jsParts].join("\n"));
}
