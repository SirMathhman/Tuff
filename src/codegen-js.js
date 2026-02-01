/**
 * JavaScript Code Generator for Tuff
 * Converts AST to executable JavaScript (direct, without IR)
 */

import * as AST from "./ast.js";

class JSCodegen {
  constructor(ast) {
    this.ast = ast;
    this.code = [];
    this.indent = 0;
    this.structs = new Map(); // Map of struct name -> field names
  }

  emit(str) {
    this.code.push("  ".repeat(this.indent) + str);
  }

  generate() {
    // First pass: collect struct definitions
    if (this.ast instanceof AST.Program) {
      for (const stmt of this.ast.statements) {
        if (stmt instanceof AST.StructDecl) {
          this.structs.set(stmt.name, stmt.fields);
        }
      }
    }

    this.emitRuntimeLibrary();

    if (this.ast instanceof AST.Program) {
      for (const stmt of this.ast.statements) {
        this.genStatement(stmt);
      }
    }

    return this.code.join("\n");
  }

  emitRuntimeLibrary() {
    this.emit("// Tuff Runtime Library");
    this.emit("const print = (...args) => console.log(...args);");
    this.emit(
      "const input = () => { const fs = require('fs'); return fs.readFileSync(0, 'utf-8').trim(); };",
    );
    this.emit("");
  }

  genStatement(stmt) {
    if (stmt instanceof AST.FunctionDecl) {
      this.genFunctionDecl(stmt);
    } else if (stmt instanceof AST.VarDecl) {
      this.genVarDecl(stmt);
    } else if (stmt instanceof AST.LetDecl) {
      this.genLetDecl(stmt);
    } else if (stmt instanceof AST.StructDecl) {
      this.genStructDecl(stmt);
    } else if (stmt instanceof AST.Return) {
      this.genReturn(stmt);
    } else if (stmt instanceof AST.If) {
      this.genIf(stmt);
    } else if (stmt instanceof AST.While) {
      this.genWhile(stmt);
    } else if (stmt instanceof AST.ForStmt) {
      this.genForStmt(stmt);
    } else if (stmt instanceof AST.BreakStmt) {
      this.emit("break;");
    } else if (stmt instanceof AST.ContinueStmt) {
      this.emit("continue;");
    } else if (stmt instanceof AST.ExprStmt) {
      this.genExprStmt(stmt);
    } else if (stmt instanceof AST.Block) {
      this.genBlock(stmt);
    } else {
      throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  genFunctionDecl(func) {
    this.emit(`function ${func.name}(${func.params.join(", ")}) {`);
    this.indent++;

    for (const stmt of func.body) {
      this.genStatement(stmt);
    }

    this.indent--;
    this.emit("}");
    this.emit("");
  }

  genVarDecl(varDecl) {
    if (varDecl.init) {
      const init = this.genExpression(varDecl.init);
      this.emit(`let ${varDecl.name} = ${init};`);
    } else {
      this.emit(`let ${varDecl.name};`);
    }
  }

  genLetDecl(letDecl) {
    // For now, treat let and let mut the same in JavaScript (no immutability enforcement)
    // TODO: In a real implementation, could use Object.freeze() for immutability
    if (letDecl.init) {
      const init = this.genExpression(letDecl.init);
      this.emit(`let ${letDecl.name} = ${init};`);
    } else {
      this.emit(`let ${letDecl.name};`);
    }
  }

  genStructDecl(structDecl) {
    // In JavaScript, we'll just emit a comment marking struct definitions
    // Structs will be instantiated as plain objects
    this.emit(
      `// struct ${structDecl.name} { ${structDecl.fields.join(", ")} }`,
    );
  }

  genForStmt(forStmt) {
    // Evaluate the range
    const start = this.genExpression(forStmt.range.start);
    const end = this.genExpression(forStmt.range.end);
    const variable = forStmt.variable;

    this.emit(
      `for (let ${variable} = ${start}; ${variable} < ${end}; ${variable}++) {`,
    );
    this.indent++;

    for (const stmt of forStmt.body) {
      this.genStatement(stmt);
    }

    this.indent--;
    this.emit(`}`);
  }

  genReturn(ret) {
    if (ret.value) {
      const val = this.genExpression(ret.value);
      this.emit(`return ${val};`);
    } else {
      this.emit(`return null;`);
    }
  }

  genIf(ifStmt) {
    const test = this.genExpression(ifStmt.test);
    this.emit(`if (${test}) {`);
    this.indent++;

    for (const stmt of ifStmt.consequent) {
      this.genStatement(stmt);
    }

    this.indent--;

    if (ifStmt.alternate && ifStmt.alternate.length > 0) {
      this.emit(`} else {`);
      this.indent++;

      for (const stmt of ifStmt.alternate) {
        this.genStatement(stmt);
      }

      this.indent--;
    }

    this.emit(`}`);
  }

  genWhile(whileStmt) {
    const test = this.genExpression(whileStmt.test);
    this.emit(`while (${test}) {`);
    this.indent++;

    for (const stmt of whileStmt.body) {
      this.genStatement(stmt);
    }

    this.indent--;
    this.emit(`}`);
  }

  genExprStmt(exprStmt) {
    this.emit(`${this.genExpression(exprStmt.expr)};`);
  }

  genBlock(block) {
    this.emit(`{`);
    this.indent++;

    for (const stmt of block.statements) {
      this.genStatement(stmt);
    }

    this.indent--;
    this.emit(`}`);
  }

  genExpression(expr) {
    if (expr instanceof AST.Number) {
      return String(expr.value);
    }

    if (expr instanceof AST.String) {
      return JSON.stringify(expr.value);
    }

    if (expr instanceof AST.Boolean) {
      return expr.value ? "true" : "false";
    }

    if (expr instanceof AST.Nil) {
      return "null";
    }

    if (expr instanceof AST.Identifier) {
      return expr.name;
    }

    if (expr instanceof AST.BinaryOp) {
      return this.genBinaryOp(expr);
    }

    if (expr instanceof AST.UnaryOp) {
      return this.genUnaryOp(expr);
    }

    if (expr instanceof AST.Assignment) {
      return this.genAssignment(expr);
    }

    if (expr instanceof AST.Call) {
      return this.genCall(expr);
    }

    if (expr instanceof AST.Array) {
      return this.genArray(expr);
    }

    if (expr instanceof AST.IndexAccess) {
      return this.genIndexAccess(expr);
    }

    if (expr instanceof AST.MemberAccess) {
      return this.genMemberAccess(expr);
    }

    if (expr instanceof AST.RangeExpr) {
      return this.genRange(expr);
    }

    if (expr instanceof AST.StructLiteral) {
      return this.genStructLiteral(expr);
    }

    throw new Error(`Unknown expression type: ${expr.type}`);
  }

  genBinaryOp(binOp) {
    const left = this.genExpression(binOp.left);
    const right = this.genExpression(binOp.right);

    // Map operators
    const opMap = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "%": "%",
      "==": "===",
      "!=": "!==",
      "<": "<",
      ">": ">",
      "<=": "<=",
      ">=": ">=",
      "&&": "&&",
      "||": "||",
      "&": "&",
      "|": "|",
      "^": "^",
      "<<": "<<",
      ">>": ">>",
    };

    const op = opMap[binOp.op] || binOp.op;
    return `(${left} ${op} ${right})`;
  }

  genUnaryOp(unOp) {
    const operand = this.genExpression(unOp.operand);

    if (unOp.prefix) {
      return `${unOp.op}${operand}`;
    } else {
      return `${operand}${unOp.op}`;
    }
  }

  genAssignment(assign) {
    if (assign.target instanceof AST.Identifier) {
      const value = this.genExpression(assign.value);
      return `(${assign.target.name} = ${value})`;
    }
    throw new Error("Complex assignment targets not yet supported");
  }

  genCall(call) {
    const args = call.args.map((arg) => this.genExpression(arg)).join(", ");

    if (call.callee instanceof AST.Identifier) {
      return `${call.callee.name}(${args})`;
    }
    throw new Error("Complex call targets not yet supported");
  }

  genArray(array) {
    const elements = array.elements
      .map((el) => this.genExpression(el))
      .join(", ");
    return `[${elements}]`;
  }

  genIndexAccess(indexAccess) {
    const obj = this.genExpression(indexAccess.object);
    const index = this.genExpression(indexAccess.index);
    return `${obj}[${index}]`;
  }

  genMemberAccess(memberAccess) {
    const obj = this.genExpression(memberAccess.object);
    return `${obj}.${memberAccess.property}`;
  }

  genRange(rangeExpr) {
    // Range expressions don't create values, they're only used in for loops
    // But we might encounter them as expressions, so return an array
    const start = this.genExpression(rangeExpr.start);
    const end = this.genExpression(rangeExpr.end);
    // For now, ranges are only used in for loops, so this shouldn't be reached
    throw new Error("Range expressions can only be used in for loops");
  }

  genStructLiteral(structLit) {
    // Generate a JavaScript object with named field initialization
    // Tuff syntax: Point { 3, 4 }
    // JavaScript: { x: 3, y: 4 }
    const fields = this.structs.get(structLit.name);
    if (!fields) {
      throw new Error(`Unknown struct: ${structLit.name}`);
    }
    if (fields.length !== structLit.fields.length) {
      throw new Error(
        `Struct ${structLit.name} expects ${fields.length} fields, got ${structLit.fields.length}`,
      );
    }

    const fieldAssignments = fields
      .map((fieldName, index) => {
        const value = this.genExpression(structLit.fields[index]);
        return `${fieldName}: ${value}`;
      })
      .join(", ");

    return `{${fieldAssignments}}`;
  }
}

export { JSCodegen };
