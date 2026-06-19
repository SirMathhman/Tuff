// Module-level state shared with compileTuffToJS
let refTargetVars,
  refHolderVars,
  refTargetArrayVars,
  arrayRefHolders,
  sliceViewHolders;

export function init(refTV, rhv, rtaV, arh, svh) {
  refTargetVars = refTV;
  refHolderVars = rhv;
  refTargetArrayVars = rtaV;
  arrayRefHolders = arh;
  sliceViewHolders = svh || new Map();
}

export function emitExpr(node, insideDeref = false) {
  if (!node || typeof node !== "object") return "";
  // read() built-in
  if (node.type === "call" && node.name === "read") {
    return `parseInt(stdIn.split(/\\s+/)[ri++],10)`;
  }
  // readBool() built-in
  if (node.type === "call" && node.name === "readBool") {
    return `+(stdIn.split(/\\s+/)[ri++]==="true")`;
  }
  // Generic function call: name(args) — emits name(arg1, arg2); also handles module::name calls
  if (node.type === "call") {
    const args = node.args ? node.args.map((a) => emitExpr(a)).join(",") : "";
    const resolvedName = node.name.includes("::")
      ? `__mod_${node.name.replace("::", "_")}`
      : node.name;
    return `${resolvedName}(${args})`;
  }
  if (node.type === "numlit") {
    return String(node.value);
  }
  if (node.type === "binop") {
    // Coerce comparison results to numbers (+true => 1, +false => 0)
    const isCmp = "+-*/".includes(node.op);
    return isCmp
      ? `${emitExpr(node.left)}${node.op}${emitExpr(node.right)}`
      : `+(${emitExpr(node.left)}${node.op}${emitExpr(node.right)})`;
  }
  if (node.type === "module_ref") {
    // Cross-module reference: module::name → __mod_module_name
    return `__mod_${node.name.replace("::", "_")}`;
  }
  if (node.type === "varref") {
    // Arrays already have JS reference semantics — no slot wrapping needed
    const isArrayRef = refTargetArrayVars.has(node.name);
    const isHolderToArray = arrayRefHolders.has(node.name);
    const needsUnwrap =
      (!isArrayRef && !isHolderToArray && refTargetVars.has(node.name)) ||
      (!insideDeref &&
        !isArrayRef &&
        !isHolderToArray &&
        refHolderVars.has(node.name));
    return needsUnwrap ? `${node.name}.v` : node.name;
  }
  if (node.type === "array") {
    const elems = node.elements.map((e) => emitExpr(e)).join(",");
    return `[${elems}]`;
  }
  if (node.type === "index") {
    return `${emitExpr(node.target)}[${emitExpr(node.index)}]`;
  }
  // Property access: obj.key
  if (node.type === "prop") {
    return `${emitExpr(node.target)}.${node.key}`;
  }
  // Object literal: { key : expr , ... }
  if (node.type === "object") {
    const pairs = node.fields.map((f) => `"${f.key}":${emitExpr(f.value)}`);
    return `{${pairs.join(",")}}`;
  }
  // &varref — emit the whole slot object for identity comparison via JS ===
  if (node.type === "ref" && node.expr?.type === "varref") {
    return node.expr.name;
  }
  // &mut array[start..end] slice view — no data to hold, just a compile-time offset
  if (node.type === "ref" && node.expr?.type === "slice") {
    return "0"; // Placeholder: the var itself is meaningless at runtime
  }
  // *(base + offset) for array holders → base[offset]
  if (
    node.type === "deref" &&
    node.expr?.type === "binop" &&
    node.expr.op === "+" &&
    node.expr.left?.type === "varref"
  ) {
    const holderName = node.expr.left.name;
    // Check for slice view holders first
    if (sliceViewHolders.has(holderName)) {
      const { baseVar, startOffset } = sliceViewHolders.get(holderName);
      return `${baseVar}[${startOffset}+${emitExpr(node.expr.right)}]`;
    }
    // Regular array ref holder
    if (arrayRefHolders.has(holderName)) {
      return `${holderName}[${emitExpr(node.expr.right)}]`;
    }
  }
  // *expr — dereference: unwrap .v from a ref/slot
  if (node.type === "deref") {
    const inner = emitExpr(node.expr, true);
    return `${inner}.v`;
  }
  throw new Error(`Unsupported AST node: ${JSON.stringify(node)}`);
}
export function emitStmt(stmt) {
  // fn name(params) => expr — function definition
  if (stmt.type === "fn_def") {
    const params = stmt.params ? stmt.params.join(",") : "";
    return `function ${stmt.name}(${params}){return(${emitExpr(stmt.body)})}`;
  }
  // let/var declaration — wrap in slot {v: value} if this var is a ref target, unless init is already a &expr (which emits a slot directly) or it's an array (JS has native reference semantics)
  if (stmt.type === "let") {
    const keyword = stmt.mutable ? "var" : "const";
    const initVal = emitExpr(stmt.init);
    const isRefInit = stmt.init?.type === "ref";
    const isArrayVar = refTargetArrayVars.has(stmt.name);
    return refTargetVars.has(stmt.name) && !isRefInit && !isArrayVar
      ? `${keyword} ${stmt.name}={v:${initVal}}`
      : `${keyword} ${stmt.name}=${initVal}`;
  }
  // x += expr compound assignment statement
  if (stmt.type === "compound_assign_stmt") {
    const lhs = stmt.target ? emitExpr(stmt.target) : stmt.name;
    return `${lhs}${stmt.op}${emitExpr(stmt.value)}`;
  }
  // array[idx] = expr index assignment statement
  if (stmt.type === "index_assign_stmt") {
    return `${emitExpr(stmt.target)}=${emitExpr(stmt.value)}`;
  }
  // *target = value deref assignment statement
  if (stmt.type === "deref_assign_stmt") {
    const targetNode = stmt.target;
    // Check for pointer arithmetic: *(base + offset)
    if (
      targetNode?.type === "binop" &&
      targetNode.op === "+" &&
      targetNode.left?.type === "varref"
    ) {
      const holderName = targetNode.left.name;
      // Check for slice view holders first
      if (sliceViewHolders.has(holderName)) {
        const { baseVar, startOffset } = sliceViewHolders.get(holderName);
        return `${baseVar}[${startOffset}+${emitExpr(targetNode.right)}]=${emitExpr(stmt.value)}`;
      }
      // If the base is an array ref holder, emit base[offset] directly
      if (arrayRefHolders.has(holderName)) {
        return `${holderName}[${emitExpr(targetNode.right)}]=${emitExpr(stmt.value)}`;
      }
    }
    const targetName = targetNode?.name;
    // For holders pointing to arrays, the ref holds a raw array — use index [0] instead of .v
    const isHolderToArray = targetName && arrayRefHolders.has(targetName);
    if (isHolderToArray) {
      return `${targetName}[0]=${emitExpr(stmt.value)}`;
    }
    // For scalar holders, use .v to write through the slot
    const targetPath = emitExpr({ type: "varref", name: targetName }, true);
    return `${targetPath}.v=${emitExpr(stmt.value)}`;
  }
  // x = expr assignment statement
  if (stmt.type === "assign_stmt") {
    return `${stmt.name}=${emitExpr(stmt.value)}`;
  }
  // { ... } block statement
  if (stmt.type === "block") {
    let blockJs = "{\n";
    for (const s of stmt.stmts) {
      blockJs += `${emitStmt(s)};\n`;
    }
    return blockJs + "}";
  } // if (...) { ... } else { ... }
  if (stmt.type === "if_stmt") {
    let js = `if(${emitExpr(stmt.cond)}){\n`;
    for (const s of stmt.thenBranch) {
      js += `${emitStmt(s)};\n`;
    }
    js += `}`;
    if (stmt.elseBranch) {
      js += ` else {\n`;
      for (const s of stmt.elseBranch) {
        js += `${emitStmt(s)};\n`;
      }
      js += ` }`;
    }
    return js;
  }
  // while (...) { ... }
  if (stmt.type === "while_stmt") {
    let js = `while(${emitExpr(stmt.cond)}){\n`;
    for (const s of stmt.body) {
      js += `${emitStmt(s)};\n`;
    }
    js += `}`;
    return js;
  }
  // for (i in start..end) { ... }
  if (stmt.type === "for_stmt") {
    let js = `var ${stmt.variable}=${emitExpr(stmt.from)};`;
    js += `while(${stmt.variable}<${emitExpr(stmt.to)}){\n`;
    for (const s of stmt.body) {
      js += `${emitStmt(s)};\n`;
    }
    js += `${stmt.variable}+=1;`;
    js += `}`;
    return js;
  } // Bare expression statement
  return emitExpr(stmt);
}
