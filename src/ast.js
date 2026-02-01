/**
 * AST Node Classes for Tuff Language
 * Defines the abstract syntax tree structure for parsed Tuff programs
 */

class ASTNode {
  constructor(type, line, column) {
    this.type = type;
    this.line = line;
    this.column = column;
  }
}

// Program node - root of all AST trees
class Program extends ASTNode {
  constructor(statements) {
    super("Program", 1, 1);
    this.statements = statements; // Array of Statement nodes
  }
}

// ==== Statements ====

class FunctionDecl extends ASTNode {
  constructor(name, params, body, line, column) {
    super("FunctionDecl", line, column);
    this.name = name; // string
    this.params = params; // Array of param names (strings)
    this.body = body; // Array of Statement nodes
  }
}

class VarDecl extends ASTNode {
  constructor(name, init, line, column) {
    super("VarDecl", line, column);
    this.name = name; // string
    this.init = init; // Expression or null
  }
}

class Return extends ASTNode {
  constructor(value, line, column) {
    super("Return", line, column);
    this.value = value; // Expression or null
  }
}

class If extends ASTNode {
  constructor(test, consequent, alternate, line, column) {
    super("If", line, column);
    this.test = test; // Expression
    this.consequent = consequent; // Array of Statement nodes
    this.alternate = alternate; // Array of Statement nodes or null
  }
}

class While extends ASTNode {
  constructor(test, body, line, column) {
    super("While", line, column);
    this.test = test; // Expression
    this.body = body; // Array of Statement nodes
  }
}

class ExprStmt extends ASTNode {
  constructor(expr, line, column) {
    super("ExprStmt", line, column);
    this.expr = expr; // Expression
  }
}

class Block extends ASTNode {
  constructor(statements, line, column) {
    super("Block", line, column);
    this.statements = statements; // Array of Statement nodes
  }
}

class LetDecl extends ASTNode {
  constructor(name, init, mutable, line, column) {
    super("LetDecl", line, column);
    this.name = name; // string
    this.init = init; // Expression or null
    this.mutable = mutable; // boolean - true if `let mut`, false if `let`
  }
}

class ForStmt extends ASTNode {
  constructor(variable, range, body, mutable, line, column) {
    super("ForStmt", line, column);
    this.variable = variable; // string - loop variable name
    this.range = range; // RangeExpr
    this.body = body; // Array of Statement nodes
    this.mutable = mutable; // boolean - true if `let mut`
  }
}

class BreakStmt extends ASTNode {
  constructor(line, column) {
    super("BreakStmt", line, column);
  }
}

class ContinueStmt extends ASTNode {
  constructor(line, column) {
    super("ContinueStmt", line, column);
  }
}

class StructDecl extends ASTNode {
  constructor(name, fields, line, column) {
    super("StructDecl", line, column);
    this.name = name; // string
    this.fields = fields; // Array of field names (strings)
  }
}

// ==== Expressions ====

class BinaryOp extends ASTNode {
  constructor(left, op, right, line, column) {
    super("BinaryOp", line, column);
    this.left = left; // Expression
    this.op = op; // string (+, -, *, /, ==, !=, <, >, <=, >=, &&, ||, etc.)
    this.right = right; // Expression
  }
}

class UnaryOp extends ASTNode {
  constructor(op, operand, prefix = true, line, column) {
    super("UnaryOp", line, column);
    this.op = op; // string (-, !, ++, --, etc.)
    this.operand = operand; // Expression
    this.prefix = prefix; // boolean - true if prefix (like !x), false if postfix (like x++)
  }
}

class Assignment extends ASTNode {
  constructor(target, value, line, column) {
    super("Assignment", line, column);
    this.target = target; // Identifier or MemberAccess
    this.value = value; // Expression
  }
}

class Call extends ASTNode {
  constructor(callee, args, line, column) {
    super("Call", line, column);
    this.callee = callee; // Expression (usually Identifier)
    this.args = args; // Array of Expression nodes
  }
}

class Identifier extends ASTNode {
  constructor(name, line, column) {
    super("Identifier", line, column);
    this.name = name; // string
  }
}

class Number extends ASTNode {
  constructor(value, line, column) {
    super("Number", line, column);
    this.value = value; // number
  }
}

class String extends ASTNode {
  constructor(value, line, column) {
    super("String", line, column);
    this.value = value; // string (without quotes)
  }
}

class Boolean extends ASTNode {
  constructor(value, line, column) {
    super("Boolean", line, column);
    this.value = value; // true or false
  }
}

class Nil extends ASTNode {
  constructor(line, column) {
    super("Nil", line, column);
  }
}

class Array extends ASTNode {
  constructor(elements, line, column) {
    super("Array", line, column);
    this.elements = elements; // Array of Expression nodes
  }
}

class MemberAccess extends ASTNode {
  constructor(object, property, line, column) {
    super("MemberAccess", line, column);
    this.object = object; // Expression
    this.property = property; // string (property name)
  }
}

class IndexAccess extends ASTNode {
  constructor(object, index, line, column) {
    super("IndexAccess", line, column);
    this.object = object; // Expression
    this.index = index; // Expression
  }
}

class RangeExpr extends ASTNode {
  constructor(start, end, line, column) {
    super("RangeExpr", line, column);
    this.start = start; // Expression
    this.end = end; // Expression
  }
}

class StructLiteral extends ASTNode {
  constructor(name, fields, line, column) {
    super("StructLiteral", line, column);
    this.name = name; // string - struct type name
    this.fields = fields; // Array of Expression nodes (positional arguments)
  }
}

export {
  Program,
  FunctionDecl,
  VarDecl,
  LetDecl,
  ForStmt,
  BreakStmt,
  ContinueStmt,
  StructDecl,
  Return,
  If,
  While,
  ExprStmt,
  Block,
  BinaryOp,
  UnaryOp,
  Assignment,
  Call,
  Identifier,
  Number,
  String,
  Boolean,
  Nil,
  Array,
  MemberAccess,
  IndexAccess,
  RangeExpr,
  StructLiteral,
};
