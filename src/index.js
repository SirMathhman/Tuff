import { tokenize } from "./tokenizer";
import parser from "./parser";
import { init, emitExpr, emitStmt } from "./emitter";

export default compileTuffToJS;
export { compileAllTuffToJSBundled, compileAllTuffWithExtern };

// Helper: tokenize source text then parse all statements until EOF.
function _parseStatements(source) {
  parser.tokens = tokenize(source);
  parser.pos = 0;

  const stmts = [];
  while (parser.pos < parser.tokens.length) {
    stmts.push(parser.parseStatement());
  }
  return stmts;
}

// Check if source type can be widened to target type.
// Target may be a single string or an array of strings (union).
function isWideningOk(source, target) {
  // If target is a union, succeed if any member matches
  if (Array.isArray(target))
    return target.some((t) => _isWideningOk(source, t));
  return _isWideningOk(source, target);
}

function _isWideningOk(source, target) {
  // Exact match is always fine
  if (source === target) return true;

  const decl = target.toUpperCase();
  const init = source.toUpperCase();

  // Widening unsigned: U8 → U16, U8 → U32, U16 → U32
  const widenOk = new Set(["U8_U16", "U8_U32", "U16_U32"]);
  if (widenOk.has(`${init}_${decl}`)) return true;

  // Widening signed: I8 → I16, I8 → I32, I16 → I32
  const widenSigned = new Set(["I8_I16", "I8_I32", "I16_I32"]);
  if (widenSigned.has(`${init}_${decl}`)) return true;

  return false;
}

// Check type compatibility between declared type and initializer literal suffix.
// typeName may be a string (single type) or an array (union).
function checkTypeCompatibility(stmt, varTypes) {
  const decl = stmt.typeName; // already uppercase from _parseTypeAnnotation
  // Determine the source type from the initializer
  let initType = null;
  if (stmt.init?.suffix) {
    initType = stmt.init.suffix.toUpperCase();
  } else if (stmt.init?.type === "varref" && varTypes.has(stmt.init.name)) {
    initType = varTypes.get(stmt.init.name);
  } else if (stmt.init?.type === "nulllit") {
    initType = TYPE_NULL;
  }

  // No annotation or no known source type → OK
  if (!decl || !initType) return;

  if (!isWideningOk(initType, decl)) {
    const srcLabel =
      stmt.init?.suffix ?? `${stmt.init.name}:${varTypes.get(stmt.init.name)}`;
    throw new Error(
      `Type mismatch: cannot assign ${srcLabel} to variable of type ${Array.isArray(decl) ? decl.join(" | ") : decl}`,
    );
  }
}

// Infer the type of an initializer expression (returns uppercase type string or null).
function inferInitType(init, varTypes) {
  if (!init) return null;
  if (init.suffix) return init.suffix.toUpperCase();
  if (init.type === "varref" && varTypes.has(init.name))
    return varTypes.get(init.name);
  if (init.type === "nulllit") return TYPE_NULL;
  // Default: untyped number → treat as generic, no constraint
  return null;
}

// Built-in function return types
const builtinReturnTypes = new Map([
  ["read", null], // untyped int
  ["readBool", "BOOL"],
]);

// Canonical type names used by the checker (uppercase)
const TYPE_NULL = "NULL";

// Infer the type of an arbitrary expression node (returns uppercase type string or null).
function inferExprType(node, varTypes, fnSignatures) {
  if (!node || typeof node !== "object") return null;
  // Literal with suffix
  if (node.suffix) return node.suffix.toUpperCase();
  // Variable reference
  if (node.type === "varref" && varTypes.has(node.name))
    return varTypes.get(node.name);
  // Boolean literal
  if (node.type === "boolit") return "BOOL";
  // Null literal
  if (node.type === "nulllit") return TYPE_NULL;
  // Ref expression: &x → *T where T is the type of x
  if (node.type === "ref") {
    const innerType = inferExprType(node.expr, varTypes, fnSignatures);
    return innerType ? `*${innerType}` : null;
  }
  // Built-in call
  if (node.type === "call" && builtinReturnTypes.has(node.name)) {
    return builtinReturnTypes.get(node.name);
  }
  // User function call — use declared return type
  if (
    node.type === "call" &&
    !node.name.includes("::") &&
    fnSignatures.has(node.name)
  ) {
    const sig = fnSignatures.get(node.name);
    return sig.returnType ? sig.returnType.toUpperCase() : null;
  }
  // Negation of a typed expression preserves the inner type
  if (node.type === "negate")
    return inferExprType(node.operand, varTypes, fnSignatures);
  // Default: untyped → no constraint
  return null;
}

// Shared utility: collect declared variable names, mutability, and inferred types for validation.
function collectVars(
  stmts,
  declSet,
  mutSet,
  varTypes = new Map(),
  fnSignatures = new Map(),
) {
  for (const s of stmts) {
    if (s.type === "let") {
      // Type compatibility check — uses current varTypes which includes prior declarations
      checkTypeCompatibility(s, varTypes);

      // Destructuring pattern: let { x, y } = expr → declare each field
      if (s.fields) {
        for (const f of s.fields) {
          declSet.add(f);
          if (s.mutable) mutSet.add(f);
        }
      } else {
        declSet.add(s.name);
        if (s.mutable) mutSet.add(s.name);
        // Track inferred type: explicit annotation wins, otherwise infer from initializer
        // typeName is already uppercase from _parseTypeAnnotation (string or array)
        const varType = s.typeName ?? inferInitType(s.init, varTypes);
        varTypes.set(s.name, varType);
      }
    }
    // extern let { x, y } = moduleName → declare each field
    if (s.type === "extern_let") {
      for (const f of s.fields) {
        declSet.add(f);
      }
    }
    // Function definitions declare a callable name + track param types
    if (s.type === "fn_def") {
      declSet.add(s.name);
      const paramTypes = [];
      for (const p of s.params || []) {
        if (typeof p === "string" && p.includes(":")) {
          paramTypes.push(p.split(":")[1].toUpperCase());
        } else {
          paramTypes.push(null);
        }
      }
      fnSignatures.set(s.name, {
        paramTypes,
        returnType: s.returnType || null,
      });
    }
    if (s.type === "block")
      collectVars(s.stmts, declSet, mutSet, varTypes, fnSignatures);
  }
}

// Shared utility: validate all varrefs are declared and assignments only to mutable vars.
function validateEach(
  stmts,
  declSet,
  mutSet,
  fnSignatures = new Map(),
  varTypes = new Map(),
) {
  for (const s of stmts) {
    if (s.type === "block") {
      const childDecl = new Set(declSet);
      const childMut = new Set(mutSet);
      collectVars(s.stmts, childDecl, childMut, varTypes, fnSignatures);
      validateEach(s.stmts, childDecl, childMut, fnSignatures, varTypes);
    } else if (s.type === "if_stmt") {
      const thenDecl = new Set(declSet);
      const thenMut = new Set(mutSet);
      validateEach(s.thenBranch, thenDecl, thenMut, fnSignatures, varTypes);
      if (s.elseBranch) {
        const elseDecl = new Set(declSet);
        const elseMut = new Set(mutSet);
        validateEach(s.elseBranch, elseDecl, elseMut, fnSignatures, varTypes);
      }
    } else if (s.type === "while_stmt") {
      const whileDecl = new Set(declSet);
      const whileMut = new Set(mutSet);
      validateEach(s.body, whileDecl, whileMut, fnSignatures, varTypes);
    } else if (s.type === "for_stmt") {
      // Validate range expressions against parent scope
      parser.validateRefs(s.from, declSet, mutSet);
      parser.validateRefs(s.to, declSet, mutSet);
      // The loop variable is implicitly declared and mutable within the for scope
      const forDecl = new Set(declSet);
      const forMut = new Set(mutSet);
      forDecl.add(s.variable);
      forMut.add(s.variable);
      validateEach(s.body, forDecl, forMut, fnSignatures, varTypes);
    } else {
      parser.validateRefs(s, declSet, mutSet);
    }
  }
}

// Validate function call arguments against declared parameter types.
function _validateCallArgs(node, varTypes, fnSignatures) {
  if (!node || typeof node !== "object") return;

  // Check this node if it's a call with typed params
  if (node.type === "call" && !node.name.includes("::")) {
    const sig = fnSignatures.get(node.name);
    if (sig && sig.paramTypes) {
      for (
        let i = 0;
        i < Math.min(sig.paramTypes.length, node.args?.length);
        i++
      ) {
        const paramType = sig.paramTypes[i];
        if (!paramType) continue;
        const argExpr = node.args[i];
        const argType = inferExprType(argExpr, varTypes, fnSignatures);
        // If argument has a known type and it's incompatible with the parameter
        if (argType && !isWideningOk(argType, paramType)) {
          throw new Error(
            `Type mismatch: cannot pass ${argType} to parameter of type ${paramType}`,
          );
        }
      }
    }
  }

  // Recurse into children
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child))
      child.forEach((c) => _validateCallArgs(c, varTypes, fnSignatures));
    else if (child && typeof child === "object")
      _validateCallArgs(child, varTypes, fnSignatures);
  }
}

// Top-level compile entry — collects vars then validates
function _compileValidate(stmts, extraDecl = new Set()) {
  const declaredVars = new Set();
  const mutableVars = new Set();
  const varTypes = new Map();
  const fnSignatures = new Map();
  for (const n of extraDecl) declaredVars.add(n);
  collectVars(stmts, declaredVars, mutableVars, varTypes, fnSignatures);
  validateEach(stmts, declaredVars, mutableVars, fnSignatures, varTypes);

  // Validate function call arguments against parameter types
  stmts.forEach((s) => _validateCallArgs(s, varTypes, fnSignatures));
}

// Shared utility: collect ref-related info from AST nodes into provided sets/map.
function collectRefInfo(stmts) {
  const refTargetVars = new Set();
  const refHolderVars = new Set();
  const refTargetArrayVars = new Set();
  const arrayRefHolders = new Set();
  const sliceViewHolders = new Map();

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ref" && node.expr?.type === "varref") {
      refTargetVars.add(node.expr.name);
    }
    const isLetLike = node.type === "let" || node.type === "out_let";
    if (
      isLetLike &&
      (node.init?.type === "array" || node.init?.type === "index")
    ) {
      refTargetArrayVars.add(node.name);
    }
    if (isLetLike && node.init?.type === "ref") {
      refHolderVars.add(node.name);
      if (
        node.init.expr?.type === "varref" &&
        refTargetArrayVars.has(node.init.expr.name)
      ) {
        arrayRefHolders.add(node.name);
      }
      if (
        node.init.expr?.type === "slice" &&
        node.init.expr.target?.type === "varref"
      ) {
        const baseName = node.init.expr.target.name;
        const startOffset =
          node.init.expr.from?.type === "numlit"
            ? Number(node.init.expr.from.value)
            : 0;
        arrayRefHolders.add(node.name);
        sliceViewHolders.set(node.name, { baseVar: baseName, startOffset });
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object") walk(child);
    }
  }

  stmts.forEach(walk);
  return {
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  };
}

// Shared utility: emit JS for a list of statements; last non-block is returned.
function emitTop(stmts) {
  let js = "";
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (i === stmts.length - 1 && s.type !== "block" && s.type !== "fn_def") {
      js += `return(${emitExpr(s)});\n`;
    } else {
      js += `${emitStmt(s)};\n`;
    }
  }
  return js;
}

function compileTuffToJS(source) {
  if (source.trim() === "") return "return 0;";

  const stmts = _parseStatements(source);

  // Collect and validate variables using shared utilities
  _compileValidate(stmts);

  // Collect ref info and initialize emitter
  const {
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  } = collectRefInfo(stmts);

  init(
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  );

  let js = "let ri=0;\n" + emitTop(stmts);
  return js;
}

// Compile multiple modules, collect exports from non-entry modules as globals, then bundle everything.
function compileAllTuffToJSBundled(sources, entryName) {
  if (!(entryName in sources))
    throw new Error(`Missing source for "${entryName}"`);

  // Phase 1: Parse all modules and collect exports (out let / out fn)
  const moduleExports = {}; // moduleName -> [{name, mutable}, ...]
  const moduleStmts = {}; // moduleName -> [stmt, ...]

  for (const [modName, source] of Object.entries(sources)) {
    if (source.trim() === "") {
      moduleExports[modName] = [];
      moduleStmts[modName] = [];
      continue;
    }

    const stmts = _parseStatements(source);

    // Collect exports from this module
    const exports_ = [];
    for (const s of stmts) {
      if (s.type === "out_let") {
        exports_.push({ name: s.name, mutable: s.mutable ?? false });
      } else if (s.type === "out_fn") {
        exports_.push({ name: s.name, isFn: true });
      }
    }

    moduleExports[modName] = exports_;
    moduleStmts[modName] = stmts;
  }

  // Phase 2: Build preamble — declare all cross-module exports as globals (__mod_module_name)
  let preamble = "";
  for (const [modName, exports_] of Object.entries(moduleExports)) {
    for (const exp of exports_) {
      const globalName = `__mod_${modName}_${exp.name}`;
      if (exp.isFn) {
        // We'll emit the function body inline later; just declare a placeholder here.
        preamble += `${globalName}=undefined;\n`;
      } else {
        preamble += `${globalName}=undefined;\n`;
      }
    }
  }

  // Also create module objects for bare module references (e.g., `let temp = lib; temp.x`)
  const moduleObjectNames = new Set();
  for (const modName of Object.keys(moduleExports)) {
    if (modName === entryName) continue;
    preamble += `${modName}={};\n`;
    moduleObjectNames.add(modName);
  }

  // Phase 3: For each non-entry module, compile its export statements into the preamble
  for (const [modName, stmts] of Object.entries(moduleStmts)) {
    if (modName === entryName) continue;

    const {
      refTargetVars,
      refHolderVars,
      refTargetArrayVars,
      arrayRefHolders,
      sliceViewHolders,
    } = collectRefInfo(stmts);

    init(
      refTargetVars,
      refHolderVars,
      refTargetArrayVars,
      arrayRefHolders,
      sliceViewHolders,
    );

    // Emit export statements into preamble globals
    for (const s of stmts) {
      if (s.type === "out_let") {
        const globalName = `__mod_${modName}_${s.name}`;
        const initVal = emitExpr(s.init);
        preamble += `${globalName}=${initVal};\n`;
      } else if (s.type === "out_fn") {
        const params = s.params.join(",");
        const bodyJs = emitExpr(s.body);
        const globalName = `__mod_${modName}_${s.name}`;
        preamble += `${globalName}=function(${params}){return(${bodyJs})};\n`;
      } else if (s.type === "let" || s.type === "fn_def") {
        // Internal declarations needed by exports — emit them too
        preamble += `${emitStmt(s)};\n`;
      }
    }

    // Populate module object with export properties so bare module refs work: `lib.x`
    const modExports = moduleExports[modName];
    for (const exp of modExports) {
      const globalName = `__mod_${modName}_${exp.name}`;
      preamble += `${modName}.${exp.name}=${globalName};\n`;
    }
  }

  // Phase 4: Compile the entry module normally, but replace __mod_ globals in emitted code
  const entrySource = sources[entryName];
  if (entrySource.trim() === "") return "return 0;";

  const stmts = _parseStatements(entrySource);

  // Validate module refs resolve to known exports
  function validateModuleRefs(node, allExports) {
    if (!node || typeof node !== "object") return;
    if (
      (node.type === "module_ref" || node.type === "call") &&
      node.name?.includes("::")
    ) {
      const [modName] = node.name.split("::");
      if (!(modName in allExports)) {
        throw new Error(`Unknown module: ${modName}`);
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(validateModuleRefs, [allExports]);
      else if (child && typeof child === "object")
        validateModuleRefs(child, allExports);
    }
  }

  // Collect and validate variables using shared utilities (including bare module refs)
  _compileValidate(stmts, new Set(moduleObjectNames));

  // Add bare module names as valid variables so `let temp = lib` passes validation
  stmts.forEach((s) => validateModuleRefs(s, moduleExports));

  // Collect ref info for entry module (reuse shared utility)
  const {
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  } = collectRefInfo(stmts);

  init(
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  );

  // Emit entry module — last non-block statement is returned
  let entryJs = emitTop(stmts);
  return "let ri=0;\n" + preamble + entryJs;
}

// Compile Tuff sources with raw JS extern modules. Externs are injected as-is into the preamble,
// and `extern let { x } = moduleName` imports bind destructured names from those modules.
function compileAllTuffWithExtern(sources, externs, entryName) {
  if (!(entryName in sources))
    throw new Error(`Missing source for "${entryName}"`);

  // Phase 1: Inject raw JS extern modules into preamble (strip 'export' for script context)
  let preamble = "";
  const externModuleNames = new Set();
  for (const [modName, jsCode] of Object.entries(externs || {})) {
    preamble += `${jsCode.replace(/\bexport\b/g, "")}\n`;
    externModuleNames.add(modName);
  }

  // Phase 2: Parse entry module
  const entrySource = sources[entryName];
  if (entrySource.trim() === "") return "return 0;";

  parser.tokens = tokenize(entrySource);
  parser.pos = 0;

  const stmts = [];
  while (parser.pos < parser.tokens.length) {
    stmts.push(parser.parseStatement());
  }

  // Phase 3: Collect and validate variables using shared utilities
  _compileValidate(stmts, externModuleNames);

  // Collect ref info and initialize emitter
  const {
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  } = collectRefInfo(stmts);

  init(
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
    sliceViewHolders,
  );

  // Emit entry module — skip extern_let statements (they're compile-time only)
  let js = "";
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (s.type === "extern_let") continue; // no runtime emission needed
    if (i === stmts.length - 1 && s.type !== "block" && s.type !== "fn_def") {
      js += `return(${emitExpr(s)});\n`;
    } else {
      js += `${emitStmt(s)};\n`;
    }
  }

  return "let ri=0;\n" + preamble + js;
}
