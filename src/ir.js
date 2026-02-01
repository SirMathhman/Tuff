/**
 * IR Generator for Tuff Language
 * Converts AST to intermediate representation (3-address code style)
 */

import * as AST from "./ast.js";

// IR Instruction types
const IROpcode = {
  // Literals and moves
  LOAD_NUM: "LOAD_NUM",
  LOAD_STR: "LOAD_STR",
  LOAD_BOOL: "LOAD_BOOL",
  LOAD_NIL: "LOAD_NIL",
  MOVE: "MOVE",

  // Binary operations
  ADD: "ADD",
  SUB: "SUB",
  MUL: "MUL",
  DIV: "DIV",
  MOD: "MOD",
  EQ: "EQ",
  NEQ: "NEQ",
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  AND: "AND",
  OR: "OR",
  BIT_AND: "BIT_AND",
  BIT_OR: "BIT_OR",
  BIT_XOR: "BIT_XOR",
  BIT_LSHIFT: "BIT_LSHIFT",
  BIT_RSHIFT: "BIT_RSHIFT",

  // Unary operations
  NEG: "NEG",
  NOT: "NOT",
  BIT_NOT: "BIT_NOT",

  // Variables
  VAR_DECL: "VAR_DECL",
  STORE: "STORE",
  LOAD: "LOAD",

  // Control flow
  LABEL: "LABEL",
  JUMP: "JUMP",
  JUMP_IF_FALSE: "JUMP_IF_FALSE",
  JUMP_IF_TRUE: "JUMP_IF_TRUE",
  RETURN: "RETURN",

  // Functions
  FUNC_DECL: "FUNC_DECL",
  FUNC_END: "FUNC_END",
  CALL: "CALL",

  // Arrays
  ARRAY_NEW: "ARRAY_NEW",
  ARRAY_GET: "ARRAY_GET",
  ARRAY_SET: "ARRAY_SET",

  // Other
  NOP: "NOP",
};

class IRInstr {
  constructor(
    opcode,
    result = null,
    arg1 = null,
    arg2 = null,
    metadata = null,
  ) {
    this.opcode = opcode;
    this.result = result; // destination register/variable
    this.arg1 = arg1; // first operand
    this.arg2 = arg2; // second operand
    this.metadata = metadata; // extra data (labels, function names, etc.)
  }

  toString() {
    const args = [this.arg1, this.arg2].filter((a) => a !== null).join(", ");
    const fullArgs = args ? `, ${args}` : "";
    const resultPart = this.result ? `${this.result} = ` : "";
    return `${this.opcode}(${resultPart}${fullArgs})${this.metadata ? ` [${this.metadata}]` : ""}`;
  }
}

class IRGenerator {
  constructor() {
    this.instrs = [];
    this.tempCounter = 0;
    this.labelCounter = 0;
    this.vars = new Map(); // variable name -> IR representation
    this.functions = new Map();
    this.currentFunc = null;
  }

  newTemp() {
    return `$t${this.tempCounter++}`;
  }

  newLabel() {
    return `L${this.labelCounter++}`;
  }

  emit(opcode, result = null, arg1 = null, arg2 = null, metadata = null) {
    this.instrs.push(new IRInstr(opcode, result, arg1, arg2, metadata));
  }

  generate(program) {
    if (!(program instanceof AST.Program)) {
      throw new Error("Expected Program node");
    }

    for (const stmt of program.statements) {
      this.genStatement(stmt);
    }

    return this.instrs;
  }

  genStatement(stmt) {
    if (stmt instanceof AST.FunctionDecl) {
      this.genFunctionDecl(stmt);
    } else if (stmt instanceof AST.VarDecl) {
      this.genVarDecl(stmt);
    } else if (stmt instanceof AST.Return) {
      this.genReturn(stmt);
    } else if (stmt instanceof AST.If) {
      this.genIf(stmt);
    } else if (stmt instanceof AST.While) {
      this.genWhile(stmt);
    } else if (stmt instanceof AST.ExprStmt) {
      this.genExprStmt(stmt);
    } else if (stmt instanceof AST.Block) {
      this.genBlock(stmt);
    } else {
      throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  genFunctionDecl(func) {
    this.emit(
      IROpcode.FUNC_DECL,
      null,
      null,
      null,
      `name=${func.name}, params=${func.params.join(",")}`,
    );
    this.currentFunc = func.name;

    for (const param of func.params) {
      this.vars.set(param, param);
    }

    for (const stmt of func.body) {
      this.genStatement(stmt);
    }

    this.emit(IROpcode.FUNC_END, null, null, null, `name=${func.name}`);
    this.currentFunc = null;
  }

  genVarDecl(varDecl) {
    this.emit(IROpcode.VAR_DECL, null, null, null, `name=${varDecl.name}`);

    if (varDecl.init) {
      const initVal = this.genExpression(varDecl.init);
      this.emit(IROpcode.STORE, null, varDecl.name, initVal);
    }

    this.vars.set(varDecl.name, varDecl.name);
  }

  genReturn(ret) {
    if (ret.value) {
      const val = this.genExpression(ret.value);
      this.emit(IROpcode.RETURN, null, val);
    } else {
      this.emit(IROpcode.RETURN, null, "nil");
    }
  }

  genIf(ifStmt) {
    const test = this.genExpression(ifStmt.test);
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emit(IROpcode.JUMP_IF_FALSE, null, test, null, elseLabel);

    for (const stmt of ifStmt.consequent) {
      this.genStatement(stmt);
    }

    this.emit(IROpcode.JUMP, null, null, null, endLabel);
    this.emit(IROpcode.LABEL, null, null, null, elseLabel);

    if (ifStmt.alternate) {
      for (const stmt of ifStmt.alternate) {
        this.genStatement(stmt);
      }
    }

    this.emit(IROpcode.LABEL, null, null, null, endLabel);
  }

  genWhile(whileStmt) {
    const startLabel = this.newLabel();
    const endLabel = this.newLabel();

    this.emit(IROpcode.LABEL, null, null, null, startLabel);
    const test = this.genExpression(whileStmt.test);
    this.emit(IROpcode.JUMP_IF_FALSE, null, test, null, endLabel);

    for (const stmt of whileStmt.body) {
      this.genStatement(stmt);
    }

    this.emit(IROpcode.JUMP, null, null, null, startLabel);
    this.emit(IROpcode.LABEL, null, null, null, endLabel);
  }

  genExprStmt(exprStmt) {
    this.genExpression(exprStmt.expr);
  }

  genBlock(block) {
    for (const stmt of block.statements) {
      this.genStatement(stmt);
    }
  }

  genExpression(expr) {
    if (expr instanceof AST.Number) {
      const temp = this.newTemp();
      this.emit(IROpcode.LOAD_NUM, temp, null, null, expr.value);
      return temp;
    }

    if (expr instanceof AST.String) {
      const temp = this.newTemp();
      this.emit(
        IROpcode.LOAD_STR,
        temp,
        null,
        null,
        JSON.stringify(expr.value),
      );
      return temp;
    }

    if (expr instanceof AST.Boolean) {
      const temp = this.newTemp();
      this.emit(IROpcode.LOAD_BOOL, temp, null, null, expr.value);
      return temp;
    }

    if (expr instanceof AST.Nil) {
      const temp = this.newTemp();
      this.emit(IROpcode.LOAD_NIL, temp);
      return temp;
    }

    if (expr instanceof AST.Identifier) {
      const temp = this.newTemp();
      this.emit(IROpcode.LOAD, temp, expr.name);
      return temp;
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

    throw new Error(`Unknown expression type: ${expr.type}`);
  }

  genBinaryOp(binOp) {
    const left = this.genExpression(binOp.left);
    const right = this.genExpression(binOp.right);
    const temp = this.newTemp();

    const opcodes = {
      "+": IROpcode.ADD,
      "-": IROpcode.SUB,
      "*": IROpcode.MUL,
      "/": IROpcode.DIV,
      "%": IROpcode.MOD,
      "==": IROpcode.EQ,
      "!=": IROpcode.NEQ,
      "<": IROpcode.LT,
      ">": IROpcode.GT,
      "<=": IROpcode.LTE,
      ">=": IROpcode.GTE,
      "&&": IROpcode.AND,
      "||": IROpcode.OR,
      "&": IROpcode.BIT_AND,
      "|": IROpcode.BIT_OR,
      "^": IROpcode.BIT_XOR,
      "<<": IROpcode.BIT_LSHIFT,
      ">>": IROpcode.BIT_RSHIFT,
    };

    const opcode = opcodes[binOp.op];
    if (!opcode) {
      throw new Error(`Unknown binary operator: ${binOp.op}`);
    }

    this.emit(opcode, temp, left, right);
    return temp;
  }

  genUnaryOp(unOp) {
    const operand = this.genExpression(unOp.operand);
    const temp = this.newTemp();

    const opcodes = {
      "-": IROpcode.NEG,
      "!": IROpcode.NOT,
      "~": IROpcode.BIT_NOT,
    };

    const opcode = opcodes[unOp.op];
    if (!opcode) {
      throw new Error(`Unknown unary operator: ${unOp.op}`);
    }

    this.emit(opcode, temp, operand);
    return temp;
  }

  genAssignment(assign) {
    const value = this.genExpression(assign.value);
    if (assign.target instanceof AST.Identifier) {
      this.emit(IROpcode.STORE, null, assign.target.name, value);
      return value;
    }
    throw new Error("Complex assignment targets not yet supported");
  }

  genCall(call) {
    const args = call.args.map((arg) => this.genExpression(arg));
    const temp = this.newTemp();

    if (call.callee instanceof AST.Identifier) {
      this.emit(IROpcode.CALL, temp, call.callee.name, null, args.join(","));
    } else {
      throw new Error("Complex call targets not yet supported");
    }

    return temp;
  }

  genArray(array) {
    const elements = array.elements.map((el) => this.genExpression(el));
    const temp = this.newTemp();
    this.emit(IROpcode.ARRAY_NEW, temp, null, null, elements.join(","));
    return temp;
  }

  genIndexAccess(indexAccess) {
    const object = this.genExpression(indexAccess.object);
    const index = this.genExpression(indexAccess.index);
    const temp = this.newTemp();
    this.emit(IROpcode.ARRAY_GET, temp, object, index);
    return temp;
  }
}

export { IRGenerator, IROpcode, IRInstr };
