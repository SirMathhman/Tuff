// Reference validation — checks variable references against declared/mutable sets.
export function validateRefs(node, declaredVars, mutableVars) {
  if (!node || typeof node !== "object") return;
  // Function definition body references are validated against parent scope + params
  if (node.type === "fn_def") {
    const fnDeclared = new Set(declaredVars);
    const fnMutable = new Set(mutableVars);
    for (const p of node.params || []) {
      // Strip type annotation from param name (e.g., "param:I32" → "param")
      const paramName = typeof p === "string" ? p.split(":")[0] : p;
      fnDeclared.add(paramName);
      fnMutable.add(paramName);
    }
    if (node.blockStmts) {
      for (const s of node.blockStmts) validateRefs(s, fnDeclared, fnMutable);
    } else {
      validateRefs(node.body, fnDeclared, fnMutable);
    }
    return;
  }
  if (node.type === "varref" && !declaredVars.has(node.name)) {
    throw new Error(`Undefined variable: ${node.name}`);
  } // Assignment statement: target must be a declared mutable var
  if (node.type === "assign_stmt") {
    if (!mutableVars.has(node.name)) {
      throw new Error(
        `Cannot reassign immutable or undeclared variable: ${node.name}`,
      );
    }
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Compound assignment statement (x += expr): target must be a declared mutable var
  if (node.type === "compound_assign_stmt") {
    if (node.name) {
      if (!mutableVars.has(node.name)) {
        throw new Error(
          `Cannot reassign immutable or undeclared variable: ${node.name}`,
        );
      }
    } else if (node.target) {
      validateRefs(node.target, declaredVars, mutableVars);
    }
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Deref assignment statement (*expr = value)
  if (node.type === "deref_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Index assignment statement (array[idx] = expr)
  if (node.type === "index_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Array literal: validate each element
  if (node.type === "array") {
    for (const elem of node.elements) {
      validateRefs(elem, declaredVars, mutableVars);
    }
  }
  // Index access: validate target and index expressions
  if (node.type === "index") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.index, declaredVars, mutableVars);
  }
  if (node.left) validateRefs(node.left, declaredVars, mutableVars);
  if (node.right) validateRefs(node.right, declaredVars, mutableVars);
  if (node.init) validateRefs(node.init, declaredVars, mutableVars);
}
