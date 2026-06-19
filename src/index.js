const { tokenize } = require("./tokenizer");
const parser = require("./parser");
const emitter = require("./emitter");

module.exports = { compileTuffToJS };

function compileTuffToJS(source) {
  if (source.trim() === "") return "return 0;";

  parser.tokens = tokenize(source);
  parser.pos = 0;

  // Parse a sequence of statements separated by ;
  const stmts = [];
  while (parser.pos < parser.tokens.length) {
    stmts.push(parser.parseStatement());
  }

  // Collect declared variable names and mutability for validation
  function collectVars(stmts, declSet, mutSet) {
    for (const s of stmts) {
      if (s.type === "let") {
        declSet.add(s.name);
        if (s.mutable) mutSet.add(s.name);
      }
      if (s.type === "block") collectVars(s.stmts, declSet, mutSet);
    }
  }
  const declaredVars = new Set();
  const mutableVars = new Set();
  collectVars(stmts, declaredVars, mutableVars);

  // Validate all varrefs are declared and assignments only to mut vars
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

  function validateStmts(stmts, declSet, mutSet) {
    validateEach(stmts, declSet, mutSet);
  }

  validateStmts(stmts, declaredVars, mutableVars);

  // Collect variables that are referenced with & — these need unique slot objects for identity tracking
  const refTargetVars = new Set();
  // Collect variables initialized with &expr — they hold slot objects and need .v unwrapping on access
  const refHolderVars = new Set();
  // Track which ref targets are arrays (JS already has reference semantics, no slot needed)
  const refTargetArrayVars = new Set();
  // Track holders that point to arrays — these don't need .v unwrap since the underlying target is a raw array
  const arrayRefHolders = new Set();

  function collectRefTargets(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ref" && node.expr?.type === "varref") {
      refTargetVars.add(node.expr.name);
    }
    // If a let statement initializes with an array literal, mark it as an array var
    if (
      node.type === "let" &&
      (node.init?.type === "array" || node.init?.type === "index")
    ) {
      refTargetArrayVars.add(node.name);
    }
    if (node.type === "let" && node.init?.type === "ref") {
      refHolderVars.add(node.name);
      // If the inner expr of a &init points to an array var, this holder holds a raw array reference
      if (
        node.init.expr?.type === "varref" &&
        refTargetArrayVars.has(node.init.expr.name)
      ) {
        arrayRefHolders.add(node.name);
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(collectRefTargets);
      else if (child && typeof child === "object") collectRefTargets(child);
    }
  }
  stmts.forEach(collectRefTargets);

  // Initialize emitter with collected ref state
  emitter.init(
    refTargetVars,
    refHolderVars,
    refTargetArrayVars,
    arrayRefHolders,
  );

  // Emit JS for each statement, last one is returned
  function emitTop(stmts) {
    let js = "";
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (i === stmts.length - 1 && s.type !== "block") {
        // Last non-block statement: return its value
        js += `return(${emitter.emitExpr(s)});\n`;
      } else {
        js += `${emitter.emitStmt(s)};\n`;
      }
    }
    return js;
  }

  let js = "let ri=0;\n" + emitTop(stmts);
  return js;
}
