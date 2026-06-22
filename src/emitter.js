// Module-level state shared with compileTuffToJS
let emittedVars,
  refTargetVars,
  refHolderVars,
  refTargetArrayVars,
  arrayRefHolders,
  sliceViewHolders;

export function init(refTV, rhv, rtaV, arh, svh) {
  emittedVars = new Set();
  refTargetVars = refTV;
  refHolderVars = rhv;
  refTargetArrayVars = rtaV;
  arrayRefHolders = arh;
  sliceViewHolders = svh || new Map();
}

// Emit a block expression's statements, handling yield as early-return.
function emitBlockStmt(stmts) {
  const stmtTypes = new Set([
    "let",
    "assign_stmt",
    "compound_assign_stmt",
    "index_assign_stmt",
    "deref_assign_stmt",
    "prop_assign_stmt",
    "block",
    "if_stmt",
    "break_stmt",
    "continue_stmt",
    "while_stmt",
    "for_stmt",
  ]);

  if (!stmts || stmts.length === 0) return "";

  const lastStmt = stmts[stmts.length - 1];
  const isExprReturn = !stmtTypes.has(lastStmt.type);

  const bodyParts = [];
  for (let i = 0; i < stmts.length - 1; i++) {
    if (stmts[i].type === "yield") {
      bodyParts.push(`return(${emitExpr(stmts[i].value)})`);
    } else if (stmts[i].type === "fn_return") {
      // Use throw to escape IIFE boundaries and propagate fn_return outward
      bodyParts.push(
        `throw{__tuffReturn:true,value:${emitExpr(stmts[i].value)}}`,
      );
    } else {
      bodyParts.push(emitStmtBlock(stmts[i]));
    }
  }

  // Handle last statement
  if (lastStmt.type === "yield") {
    bodyParts.push(`return(${emitExpr(lastStmt.value)})`);
  } else if (lastStmt.type === "fn_return") {
    // Use throw to escape IIFE boundaries and propagate fn_return outward
    bodyParts.push(
      `throw{__tuffReturn:true,value:${emitExpr(lastStmt.value)}}`,
    );
  } else if (isExprReturn) {
    bodyParts.push(`return(${emitExpr(lastStmt)})`);
  } else {
    bodyParts.push(emitStmtBlock(lastStmt));
    bodyParts.push("return(undefined)");
  }

  return bodyParts.join(";");
}

// Like emitStmt but handles control flow branches recursively for yield support.
function emitStmtBlock(stmt) {
  if (stmt.type === "if_stmt") {
    const thenJs = emitBlockStmt([stmt.thenBranch[0]]);
    let elseJs;
    if (stmt.elseBranch && stmt.elseBranch.length > 0) {
      elseJs = emitBlockStmt(stmt.elseBranch).replace(/^return\(/, ""); // Remove leading return from else branch since it's in an else block
    }
    const condJs = emitExpr(stmt.cond);
    if (elseJs !== undefined && elseJs !== "") {
      return `if(${condJs}){${thenJs}}else{${elseJs}}`;
    }
    return `if(${condJs}){${thenJs}}`;
  }

  // Fall through to regular emitStmt for everything else.
  if (stmt.type === "while_stmt") {
    let bodyJs = "";
    for (const item of stmt.body) {
      bodyJs += emitBlockStmt([item]);
    }
    return `while(${emitExpr(stmt.cond)}){${bodyJs}}`;
  }

  if (stmt.type === "for_stmt") {
    const fromJs = emitExpr(stmt.from);
    const toJs = emitExpr(stmt.to);
    let bodyJs = "";
    for (const item of stmt.body) {
      bodyJs += emitBlockStmt([item]);
    }
    return `var ${stmt.variable};for(${stmt.variable}=${fromJs};${stmt.variable}<${toJs};${stmt.variable}++){${bodyJs}}`;
  }

  // Regular statement — delegate to emitStmt.
  const result = emitStmt(stmt);
  if (result === undefined || result === null) {
    throw new Error(`Unsupported AST node: ${JSON.stringify(stmt)}`);
  }
  return result;
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
  // readString() built-in — reads next whitespace-separated token as a string
  if (node.type === "call" && node.name === "readString") {
    return `(stdIn.split(/\\s+/)[ri++])`;
  }
  // Generic function call: name(args) — emits name(arg1, arg2); also handles module::name calls
  if (node.type === "call") {
    const args = node.args ? node.args.map((a) => emitExpr(a)).join(",") : "";
    const resolvedName = node.name.includes("::")
      ? `__mod_${node.name.replace("::", "_")}`
      : node.name;
    return `${resolvedName}(${args})`;
  }
  if (node.type === "strlit") {
    return JSON.stringify(node.value);
  }
  if (node.type === "numlit") {
    // U64/I64 suffixes use BigInt in generated JS
    const upperSuffix = node.suffix ? node.suffix.toUpperCase() : null;
    if (upperSuffix === "U64" || upperSuffix === "I64") {
      return `BigInt(${node.rawValue ?? String(node.value)})`;
    }
    return String(node.value);
  }
  // Boolean literal — coerce to number: true → 1, false → 0
  if (node.type === "boollit") {
    return `+(${JSON.stringify(node.value)})`;
  }
  // Null literal — coerce to 0
  if (node.type === "nulllit") {
    return "0";
  }
  if (node.type === "binop") {
    // Logical operators — short-circuit, coerce to 0/1
    if (node.op === "||" || node.op === "&&") {
      return `+(${emitExpr(node.left)}${node.op}${emitExpr(node.right)})`;
    }
    // Coerce comparison results to numbers (+true => 1, +false => 0)
    const isArith = "+-*/%".includes(node.op);
    return isArith
      ? `${emitExpr(node.left)}${node.op}${emitExpr(node.right)}`
      : `+(${emitExpr(node.left)}${node.op}${emitExpr(node.right)})`;
  }
  // Unary logical NOT: !expr → +(!expr)
  if (node.type === "unary" && node.op === "!") {
    const operand = emitExpr(node.operand);
    return `+(${String.fromCharCode(33)}${operand})`;
  }
  // Unary minus: -expr → -(expr)
  if (node.type === "unary" && node.op === "-") {
    const operand = emitExpr(node.operand);
    return `-(${operand})`;
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
  // this.key — access scope variable by property name
  if (node.type === "prop" && node.target?.type === "this") {
    const varName = node.key;
    const isArrayRef = refTargetArrayVars.has(varName);
    const isHolderToArray = arrayRefHolders.has(varName);
    const needsUnwrap =
      (!isArrayRef && !isHolderToArray && refTargetVars.has(varName)) ||
      (!insideDeref &&
        !isArrayRef &&
        !isHolderToArray &&
        refHolderVars.has(varName));
    return needsUnwrap ? `${varName}.v` : varName;
  }
  // Bare 'this' — emit as object literal capturing only variables emitted so far
  if (node.type === "this") {
    const vars = Array.from(emittedVars);
    const entries = vars.map((name) => `"${name}":${name}`);
    return `{${entries.join(",")}}`;
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
  // Method call: target.method(args)
  if (node.type === "method") {
    const args = node.args.map((a) => emitExpr(a)).join(",");
    return `(${emitExpr(node.target)})[${JSON.stringify(node.name)}](${args})`;
  }
  // Object literal: { key : expr , ... }
  if (node.type === "object") {
    const pairs = node.fields.map((f) => `"${f.key}":${emitExpr(f.value)}`);
    return `{${pairs.join(",")}}`;
  }
  // Block expression: { stmts; lastExpr } — evaluates to the value of the last statement or a yield
  if (node.type === "block_expr") {
    const bodyJs = emitBlockStmt(node.stmts);
    return `(function(){${bodyJs}}())`;
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
  // *expr — dereference: unwrap .v from a ref/slot; throw on null/0
  if (node.type === "deref") {
    const inner = emitExpr(node.expr, true);
    return `(!${inner}?(function(){throw new Error("dereferencing null")})():${inner}.v)`;
  }
  throw new Error(`Unsupported AST node: ${JSON.stringify(node)}`);
}
export function emitStmt(stmt) {
  // fn name(params) => expr — function definition
  if (stmt.type === "fn_def") {
    const paramNames = (stmt.params || []).map((p) =>
      typeof p === "string" ? p.split(":")[0] : p,
    );
    const params = paramNames.join(",");
    emittedVars.add(stmt.name);
    // Temporarily add params to emittedVars so bare 'this' inside the body captures them
    for (const p of paramNames) emittedVars.add(p);
    // Block body: fn name(params) => { stmts; }
    if (stmt.blockStmts && stmt.blockStmts.length > 0) {
      const stmtTypes = new Set([
        "let",
        "assign_stmt",
        "compound_assign_stmt",
        "index_assign_stmt",
        "deref_assign_stmt",
        "prop_assign_stmt",
        "block",
        "if_stmt",
        "break_stmt",
        "continue_stmt",
        "while_stmt",
        "for_stmt",
      ]);
      // Last statement in block: if it's an expression node, wrap in return; otherwise emit as-is
      const lastStmt = stmt.blockStmts[stmt.blockStmts.length - 1];
      const isExprReturn = !stmtTypes.has(lastStmt.type);
      const bodyParts = [];
      for (let i = 0; i < stmt.blockStmts.length - 1; i++) {
        bodyParts.push(emitStmt(stmt.blockStmts[i]));
      }
      if (isExprReturn) {
        bodyParts.push(`return(${emitExpr(lastStmt)})`);
      } else {
        bodyParts.push(emitStmt(lastStmt));
      }
      // Wrap in try/catch to catch fn_return sentinel thrown from nested block_expr IIFEs
      return `function ${stmt.name}(${params}){try{${bodyParts.join(";")}}catch(e){if(e.__tuffReturn)return e.value;throw e}}`;
    }
    // Single-statement body: fn name(params) => statement
    // If the body is an expression node (not a statement type), wrap in return
    const stmtTypes = new Set([
      "let",
      "assign_stmt",
      "compound_assign_stmt",
      "index_assign_stmt",
      "deref_assign_stmt",
      "prop_assign_stmt",
      "block",
      "if_stmt",
      "break_stmt",
      "continue_stmt",
      "while_stmt",
      "for_stmt",
    ]);
    if (stmtTypes.has(stmt.body.type)) {
      const bodyJs = emitStmt(stmt.body);
      // Wrap in try/catch to catch fn_return sentinel thrown from nested block_expr IIFEs
      return `function ${stmt.name}(${params}){try{${bodyJs}}catch(e){if(e.__tuffReturn)return e.value;throw e}}`;
    }
    // Expression body — wrap in return, with try/catch for fn_return sentinel from nested block_expr IIFEs
    const exprBody = emitExpr(stmt.body);
    return `function ${stmt.name}(${params}){try{return(${exprBody})}catch(e){if(e.__tuffReturn)return e.value;throw e}}`;
  }
  // break statement — exit enclosing loop
  if (stmt.type === "break_stmt") {
    return `break`;
  }
  // continue statement — skip to next iteration of enclosing loop
  if (stmt.type === "continue_stmt") {
    return `continue`;
  }
  // let/var declaration — wrap in slot {v: value} if this var is a ref target, unless init is already a &expr (which emits a slot directly) or it's an array (JS has native reference semantics)
  if (stmt.type === "let") {
    const keyword = stmt.mutable ? "var" : "const";
    // Object destructuring: let { x, y } = expr → const{x,y}=expr
    if (stmt.fields) {
      const initVal = emitExpr(stmt.init);
      for (const f of stmt.fields) emittedVars.add(f);
      return `${keyword}{${stmt.fields.join(",")}}=${initVal}`;
    }
    const initVal = emitExpr(stmt.init);
    const isRefInit = stmt.init?.type === "ref";
    const isArrayVar = refTargetArrayVars.has(stmt.name);
    emittedVars.add(stmt.name);
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
  // temp.x = value property assignment statement
  if (stmt.type === "prop_assign_stmt") {
    return `${emitExpr(stmt.target)}=${emitExpr(stmt.value)}`;
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
