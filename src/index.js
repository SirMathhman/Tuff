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

// Shared utility: collect declared variable names and mutability for validation.
function collectVars(stmts, declSet, mutSet) {
  for (const s of stmts) {
    if (s.type === "let") {
      // Destructuring pattern: let { x, y } = expr → declare each field
      if (s.fields) {
        for (const f of s.fields) {
          declSet.add(f);
          if (s.mutable) mutSet.add(f);
        }
      } else {
        declSet.add(s.name);
        if (s.mutable) mutSet.add(s.name);
      }
    }
    // extern let { x, y } = moduleName → declare each field
    if (s.type === "extern_let") {
      for (const f of s.fields) {
        declSet.add(f);
      }
    }
    // Function definitions declare a callable name
    if (s.type === "fn_def") {
      declSet.add(s.name);
    }
    if (s.type === "block") collectVars(s.stmts, declSet, mutSet);
  }
}

// Shared utility: validate all varrefs are declared and assignments only to mutable vars.
function validateEach(stmts, declSet, mutSet) {
  for (const s of stmts) {
    if (s.type === "block") {
      const childDecl = new Set(declSet);
      const childMut = new Set(mutSet);
      collectVars(s.stmts, childDecl, childMut);
      validateEach(s.stmts, childDecl, childMut);
    } else if (s.type === "if_stmt") {
      const thenScope = { decl: new Set(declSet), mut: new Set(mutSet) };
      validateEach(s.thenBranch, thenScope.decl, thenScope.mut);
      if (s.elseBranch) {
        const elseScope = { decl: new Set(declSet), mut: new Set(mutSet) };
        validateEach(s.elseBranch, elseScope.decl, elseScope.mut);
      }
    } else if (s.type === "while_stmt") {
      const childDecl = new Set(declSet);
      const childMut = new Set(mutSet);
      validateEach(s.body, childDecl, childMut);
    } else if (s.type === "for_stmt") {
      // Validate range expressions against parent scope
      parser.validateRefs(s.from, declSet, mutSet);
      parser.validateRefs(s.to, declSet, mutSet);
      // The loop variable is implicitly declared and mutable within the for scope
      const childDecl = new Set(declSet);
      const childMut = new Set(mutSet);
      childDecl.add(s.variable);
      childMut.add(s.variable);
      validateEach(s.body, childDecl, childMut);
    } else {
      parser.validateRefs(s, declSet, mutSet);
    }
  }
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
  const declaredVars = new Set();
  const mutableVars = new Set();
  collectVars(stmts, declaredVars, mutableVars);
  validateEach(stmts, declaredVars, mutableVars);

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
  const declaredVars = new Set();
  const mutableVars = new Set();
  collectVars(stmts, declaredVars, mutableVars);

  // Add bare module names as valid variables so `let temp = lib` passes validation
  for (const modName of moduleObjectNames) {
    declaredVars.add(modName);
  }

  stmts.forEach((s) => validateModuleRefs(s, moduleExports));
  validateEach(stmts, declaredVars, mutableVars);

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

  // Phase 3: Collect declared vars — include destructured names from extern imports
  const declaredVars = new Set();
  const mutableVars = new Set();
  collectVars(stmts, declaredVars, mutableVars);

  // Add extern module names as valid variables so `extern let { x } = native` resolves
  for (const modName of externModuleNames) {
    declaredVars.add(modName);
  }

  // Validate variable references
  validateEach(stmts, declaredVars, mutableVars);

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
