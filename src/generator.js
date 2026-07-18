function generateStatements(statements, functions) {
  let code = "";
  for (const stmt of statements) {
    if (stmt.type === "let") {
      code += `let ${stmt.name} = ${generateExpr(stmt.init)};\n`;
    } else if (stmt.type === "assign") {
      code += `${stmt.name} = ${generateExpr(stmt.value)};\n`;
    } else if (stmt.type === "compoundAssign") {
      const op = stmt.op.replace("=", "");
      if (stmt.target) {
        code += `${generateExpr(stmt.target)} = ${generateExpr(stmt.target)} ${op} ${generateExpr(stmt.value)};\n`;
      } else {
        code += `${stmt.name} = ${stmt.name} ${op} ${generateExpr(stmt.value)};\n`;
      }
    } else if (stmt.type === "fieldAssign") {
      code += `${generateExpr(stmt.target)} = ${generateExpr(stmt.value)};\n`;
    } else if (stmt.type === "ifStmt") {
      code += generateIfStmt(stmt, functions);
    } else if (stmt.type === "whileStmt") {
      code += `while (${generateExpr(stmt.condition)}) { ${generateStatements(stmt.body, functions)} };
`;
    } else if (stmt.type === "fn") {
      code += generateFn(stmt);
    } else {
      code += `${generateExpr(stmt)};\n`;
    }
  }
  return code;
}

function generateIfStmt(node, functions) {
  let code = `if (${generateExpr(node.condition)}) { ${generateStatements(node.thenBranch, functions)} }`;
  if (node.elseBranch) {
    code += ` else { ${generateStatements(node.elseBranch, functions)} }`;
  }
  return code;
}

function generateFn(node, functions) {
  const paramStr = node.params.join(", ");
  // Generate body: last expression is returned, rest are statements
  let bodyCode = "";
  for (let i = 0; i < node.body.length; i++) {
    const stmt = node.body[i];
    if (i === node.body.length - 1) {
      const isStmtType = (s) => s.type === "let" || s.type === "assign" || s.type === "ifStmt" || s.type === "whileStmt" || s.type === "blockStmt" || s.type === "compoundAssign";
      if (isStmtType(stmt)) {
        bodyCode += generateStmtCode(stmt, functions);
        bodyCode += `return 0;`;
      } else {
        bodyCode += `return ${generateExpr(stmt)};`;
      }
    } else {
      bodyCode += generateStmtCode(stmt, functions);
    }
  }
  if (node.body.length === 0) {
    bodyCode = "return 0;";
  }
  return `function ${node.name}(${paramStr}) { ${bodyCode} }\n`;
}

function generateStmtCode(stmt, functions) {
  if (stmt.type === "let") {
    return `let ${stmt.name} = ${generateExpr(stmt.init)};\n`;
  } else if (stmt.type === "assign") {
    return `${stmt.name} = ${generateExpr(stmt.value)};\n`;
  } else if (stmt.type === "compoundAssign") {
    const op = stmt.op.replace("=", "");
    if (stmt.target) {
      return `${generateExpr(stmt.target)} = ${generateExpr(stmt.target)} ${op} ${generateExpr(stmt.value)};\n`;
    }
    return `${stmt.name} = ${stmt.name} ${op} ${generateExpr(stmt.value)};\n`;
  } else if (stmt.type === "arrayAssign") {
    return `${stmt.name}[${generateExpr(stmt.index)}] = ${generateExpr(stmt.value)};\n`;
  } else if (stmt.type === "ifStmt") {
    return generateIfStmt(stmt, functions);
  } else if (stmt.type === "whileStmt") {
    return `while (${generateExpr(stmt.condition)}) { ${generateStatements(stmt.body, functions)} };\n`;
  } else if (stmt.type === "blockStmt") {
    return generateStatements(stmt.statements, functions);
  } else {
    return `${generateExpr(stmt)};\n`;
  }
}

function clampExpr(value, suffix) {
  switch (suffix) {
    case "F32":
      return `parseFloat(${value}.toPrecision(6))`;
    case "F64":
      return value;
    case "":
      return value;
    default:
      // Integer types validated at compile time, no runtime clamping needed
      return value;
  }
}

export function generate(statements, variables, functions) {
  if (statements.length === 0) return "return 0;";
  let code = "";
  // Generate function definitions first
  for (const stmt of statements) {
    if (stmt.type === "fn") {
      code += generateFn(stmt, functions);
    }
  }
  // Generate non-function statements
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.type === "fn") continue;
    if (stmt.type === "let") {
      const initValue = generateExpr(stmt.init);
      code += `let ${stmt.name} = ${initValue};\n`;
    } else if (stmt.type === "assign") {
      const rhsValue = generateExpr(stmt.value);
      code += `${stmt.name} = ${rhsValue};\n`;
    } else if (stmt.type === "compoundAssign") {
      const op = stmt.op.replace("=", "");
      const rhsValue = generateExpr(stmt.value);
      if (stmt.target) {
        code += `${generateExpr(stmt.target)} = ${generateExpr(stmt.target)} ${op} ${rhsValue};\n`;
      } else {
        code += `${stmt.name} = ${stmt.name} ${op} ${rhsValue};\n`;
      }
    } else if (stmt.type === "blockStmt") {
      code += generateStatements(stmt.statements, functions);
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else if (stmt.type === "ifStmt") {
      code += generateIfStmt(stmt, functions);
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else if (stmt.type === "whileStmt") {
      code += `while (${generateExpr(stmt.condition)}) { ${generateStatements(stmt.body, functions)} };
`;
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else {
      const value = generateExpr(stmt);
      if (i === statements.length - 1) {
        code += `return ${value};`;
      } else {
        code += `${value};`;
      }
    }
  }
  return code;
}

export function generateExpr(node) {
  if (node.type === "number") {
    let value = node.value;
    if (node.negative) {
      value = `-${value}`;
    }
    return clampExpr(value, node.suffix);
  }
  if (node.type === "identifier") {
    return node.name;
  }
  if (node.type === "boolean") {
    return node.value ? "1" : "0";
  }
  if (node.type === "unary") {
    if (node.op === "!") return `!${generateExpr(node.operand)}`;
    return `-${generateExpr(node.operand)}`;
  }
  if (node.type === "binary") {
    if (node.op === "&&" || node.op === "||") {
      return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
    }
    return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
  }
  if (node.type === "block") {
    return `(() => { ${generateStatements(node.statements, null)}return ${generateExpr(node.finalExpr)}; })()`;
  }
  if (node.type === "if") {
    return `(${generateExpr(node.condition)} ? ${generateExpr(node.thenBranch)} : ${generateExpr(node.elseBranch)})`;
  }
  if (node.type === "blockStmt") {
    return `(() => { ${generateStatements(node.statements, null)} })()`;
  }
  if (node.type === "fnCall") {
    const args = node.args.map((a) => generateExpr(a)).join(", ");
    return `${node.name}(${args})`;
  }
  if (node.type === "arrayLiteral") {
    const elements = node.elements.map((e) => generateExpr(e)).join(", ");
    return `[${elements}]`;
  }
  if (node.type === "arrayIndex") {
    const base = typeof node.name === "string" ? node.name : generateExpr(node.name);
    return `${base}[${generateExpr(node.index)}]`;
  }
  if (node.type === "arrayAssign") {
    return `${node.name}[${generateExpr(node.index)}] = ${generateExpr(node.value)}`;
  }
  if (node.type === "structInstantiation") {
    const fieldAssignments = node.fields.map(f => `${f.name}: ${generateExpr(f.value)}`).join(", ");
    return `{ ${fieldAssignments } }`;
  }
  if (node.type === "fieldAccess") {
    return `${generateExpr(node.object)}.${node.field}`;
  }
  if (node.type === "fieldAssign") {
    return `${generateExpr(node.target)} = ${generateExpr(node.value)}`;
  }
  throw new Error(`Unknown node type: ${node.type}`);
}
