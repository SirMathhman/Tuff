/**
 * JavaScript code generator for Tuff AST
 * Converts Tuff AST nodes to equivalent JavaScript code
 */

import {
  type ASTStatement,
  type ASTExpression,
  type LetStatement,
  type IfStatement,
  type WhileStatement,
  type ForStatement,
  type BlockStatement,
  type FnDeclaration,
  type StructDeclaration,
  type AssignmentASTStatement,
  type BinaryOpExpr,
  type UnaryOpExpr,
  type CallExpr,
  type StructInstantiationExpr,
  type BlockExpr,
  type MatchExpr,
  type ASTAssignmentTarget,
  isLetStatement,
  isIfStatement,
  isWhileStatement,
  isForStatement,
  isExpressionStatement,
  isBlockStatement,
  isFnDeclaration,
  isStructDeclaration,
  isYieldStatement,
  isAssignmentStatement,
  isIntLiteral,
  isFloatLiteral,
  isStringLiteral,
  isBoolLiteral,
  isASTIdentifier,
  isBinaryOpExpr,
  isUnaryOpExpr,
  isCallExpr,
  isMemberAccessExpr,
  isIndexAccessExpr,
  isArrayLiteralExpr,
  isStructInstantiationExpr,
  isBlockExpr,
  isParenExpr,
  isMatchExpr,
} from "../ast/nodes";

/**
 * Compilation context for tracking state during code generation
 */
interface CompileContext {
  indentLevel: number;
  inFunction: boolean;
}

/**
 * Compile a full Tuff program (array of statements) to JavaScript
 * The last expression statement becomes the program's return value (exit code)
 */
export function compileProgram(statements: ASTStatement[]): string {
  const ctx: CompileContext = { indentLevel: 0, inFunction: false };
  const imports = [
    "// Compiled from Tuff",
    "import { runtime } from './runtime.js';",
    "",
  ];
  
  // Compile all statements, but treat the last one specially
  const compiledStmts: string[] = [];
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const isLast = i === statements.length - 1;
    
    // If this is the last statement and it's an expression, make it a return
    if (isLast && isExpressionStatement(stmt)) {
      const exprCode = compileExpression(stmt.expr, ctx);
      compiledStmts.push(`return runtime.toNumber(${exprCode});`);
    } else {
      compiledStmts.push(compileStatement(stmt, ctx));
    }
  }
  
  const body = compiledStmts.join("\n");
  return imports.join("\n") + body;
}

/**
 * Get indentation string for current context
 */
function indent(ctx: CompileContext): string {
  return "  ".repeat(ctx.indentLevel);
}

/**
 * Compile a statement to JavaScript
 */
function compileStatement(stmt: ASTStatement, ctx: CompileContext): string {
  if (isLetStatement(stmt)) {
    return compileLetStatement(stmt, ctx);
  }

  if (isIfStatement(stmt)) {
    return compileIfStatement(stmt, ctx);
  }

  if (isWhileStatement(stmt)) {
    return compileWhileStatement(stmt, ctx);
  }

  if (isForStatement(stmt)) {
    return compileForStatement(stmt, ctx);
  }

  if (isExpressionStatement(stmt)) {
    return `${indent(ctx)}${compileExpression(stmt.expr, ctx)};`;
  }

  if (isBlockStatement(stmt)) {
    return compileBlockStatement(stmt, ctx);
  }

  if (isFnDeclaration(stmt)) {
    return compileFnDeclaration(stmt, ctx);
  }

  if (isStructDeclaration(stmt)) {
    return compileStructDeclaration(stmt, ctx);
  }

  if (isYieldStatement(stmt)) {
    return `${indent(ctx)}return ${compileExpression(stmt.expr, ctx)};`;
  }

  if (isAssignmentStatement(stmt)) {
    return compileAssignmentStatement(stmt, ctx);
  }

  throw new Error(`Unsupported statement kind: ${stmt.kind}`);
}

/**
 * Compile let statement to JavaScript variable declaration
 */
function compileLetStatement(stmt: LetStatement, ctx: CompileContext): string {
  const keyword = stmt.isMutable ? "let" : "const";
  const ind = indent(ctx);

  if (stmt.isDeclOnly) {
    return `${ind}${keyword} ${stmt.name};`;
  }

  if (stmt.rhs) {
    const rhsCode = compileExpression(stmt.rhs, ctx);
    return `${ind}${keyword} ${stmt.name} = ${rhsCode};`;
  }

  return `${ind}${keyword} ${stmt.name};`;
}

/**
 * Compile if statement to JavaScript
 */
function compileIfStatement(stmt: IfStatement, ctx: CompileContext): string {
  const ind = indent(ctx);
  const condition = compileExpression(stmt.condition, ctx);
  const trueBranch = compileBlock(stmt.trueBranch, ctx);

  if (stmt.falseBranch && stmt.falseBranch.length > 0) {
    const falseBranch = compileBlock(stmt.falseBranch, ctx);
    return `${ind}if (${condition}) {\n${trueBranch}\n${ind}} else {\n${falseBranch}\n${ind}}`;
  }

  return `${ind}if (${condition}) {\n${trueBranch}\n${ind}}`;
}

/**
 * Helper to compile a block of statements with indentation
 */
function compileBlock(
  statements: ASTStatement[],
  ctx: CompileContext
): string {
  ctx.indentLevel++;
  const body = statements.map((s) => compileStatement(s, ctx)).join("\n");
  ctx.indentLevel--;
  return body;
}

/**
 * Compile while statement to JavaScript
 */
function compileWhileStatement(
  stmt: WhileStatement,
  ctx: CompileContext
): string {
  const ind = indent(ctx);
  const condition = compileExpression(stmt.condition, ctx);
  const body = compileBlock(stmt.body, ctx);
  return `${ind}while (${condition}) {\n${body}\n${ind}}`;
}

/**
 * Compile for statement to JavaScript for loop
 */
function compileForStatement(stmt: ForStatement, ctx: CompileContext): string {
  const ind = indent(ctx);
  const loopVar = stmt.loopVar;
  const startExpr = compileExpression(stmt.startExpr, ctx);
  const endExpr = compileExpression(stmt.endExpr, ctx);
  const body = compileBlock(stmt.body, ctx);
  return `${ind}for (let ${loopVar} = ${startExpr}; ${loopVar} < ${endExpr}; ${loopVar}++) {\n${body}\n${ind}}`;
}

/**
 * Compile block statement to JavaScript block
 */
function compileBlockStatement(
  stmt: BlockStatement,
  ctx: CompileContext
): string {
  const ind = indent(ctx);
  const body = compileBlock(stmt.statements, ctx);
  return `${ind}{\n${body}\n${ind}}`;
}

/**
 * Compile function declaration to JavaScript function
 */
function compileFnDeclaration(
  stmt: FnDeclaration,
  ctx: CompileContext
): string {
  const ind = indent(ctx);
  const paramNames = stmt.params.map((p) => p.name).join(", ");

  const wasInFunction = ctx.inFunction;
  ctx.inFunction = true;

  let bodyCode: string;
  if (stmt.isBlock && Array.isArray(stmt.body)) {
    ctx.indentLevel++;
    bodyCode = stmt.body.map((s) => compileStatement(s, ctx)).join("\n");
    ctx.indentLevel--;
  } else if (!Array.isArray(stmt.body)) {
    const exprCode = compileExpression(stmt.body, ctx);
    ctx.indentLevel++;
    bodyCode = `${indent(ctx)}return ${exprCode};`;
    ctx.indentLevel--;
  } else {
    throw new Error("Invalid function body");
  }

  ctx.inFunction = wasInFunction;

  return `${ind}function ${stmt.name}(${paramNames}) {\n${bodyCode}\n${ind}}`;
}

/**
 * Compile struct declaration to JavaScript class
 */
function compileStructDeclaration(
  stmt: StructDeclaration,
  ctx: CompileContext
): string {
  const ind = indent(ctx);
  const fieldNames = stmt.fields.map((f) => f.name).join(", ");

  ctx.indentLevel++;
  const constructorBody = stmt.fields
    .map((f) => `${indent(ctx)}this.${f.name} = ${f.name};`)
    .join("\n");
  ctx.indentLevel--;

  return `${ind}class ${stmt.name} {\n${indent(
    ctx
  )}  constructor(${fieldNames}) {\n${constructorBody}\n${indent(
    ctx
  )}  }\n${ind}}`;
}

/**
 * Compile assignment statement to JavaScript
 */
function compileAssignmentStatement(
  stmt: AssignmentASTStatement,
  ctx: CompileContext
): string {
  const ind = indent(ctx);
  const target = compileAssignmentTarget(stmt.target, ctx);
  const value = compileExpression(stmt.value, ctx);
  const op = stmt.operator ? stmt.operator : "=";
  return `${ind}${target} ${op} ${value};`;
}

/**
 * Compile assignment target (LHS of assignment)
 */
function compileAssignmentTarget(
  target: ASTAssignmentTarget,
  ctx: CompileContext
): string {
  if (target.type === "identifier" && target.name) {
    return target.name;
  }
  if (target.type === "field" && target.object) {
    const obj = compileExpression(target.object, ctx);
    return `${obj}.${target.name}`;
  }
  throw new Error(`Unsupported assignment target type: ${target.type}`);
}

/**
 * Compile an expression to JavaScript
 */
function compileExpression(expr: ASTExpression, ctx: CompileContext): string {
  if (isIntLiteral(expr)) {
    return expr.value.toString();
  }

  if (isFloatLiteral(expr)) {
    return expr.value.toString();
  }

  if (isStringLiteral(expr)) {
    return JSON.stringify(expr.value);
  }

  if (isBoolLiteral(expr)) {
    return expr.value.toString();
  }

  if (isASTIdentifier(expr)) {
    return expr.name;
  }

  if (isBinaryOpExpr(expr)) {
    return compileBinaryOp(expr, ctx);
  }

  if (isUnaryOpExpr(expr)) {
    return compileUnaryOp(expr, ctx);
  }

  if (isCallExpr(expr)) {
    return compileCallExpr(expr, ctx);
  }

  if (isMemberAccessExpr(expr)) {
    const obj = compileExpression(expr.object, ctx);
    return `${obj}.${expr.property}`;
  }

  if (isIndexAccessExpr(expr)) {
    const obj = compileExpression(expr.object, ctx);
    const idx = compileExpression(expr.index, ctx);
    return `${obj}[${idx}]`;
  }

  if (isArrayLiteralExpr(expr)) {
    const elements = expr.elements.map((e) => compileExpression(e, ctx));
    return `[${elements.join(", ")}]`;
  }

  if (isStructInstantiationExpr(expr)) {
    return compileStructInstantiation(expr, ctx);
  }

  if (isBlockExpr(expr)) {
    return compileBlockExpr(expr, ctx);
  }

  if (isParenExpr(expr)) {
    return `(${compileExpression(expr.expr, ctx)})`;
  }

  if (isMatchExpr(expr)) {
    return compileMatchExpr(expr, ctx);
  }

  throw new Error(
    `Unsupported expression kind: ${(expr as ASTExpression).kind}`
  );
}

/**
 * Compile binary operation to JavaScript
 */
function compileBinaryOp(expr: BinaryOpExpr, ctx: CompileContext): string {
  const left = compileExpression(expr.left, ctx);
  const right = compileExpression(expr.right, ctx);
  const op = expr.operator;

  // Map Tuff operators to JS operators
  if (op === "&&" || op === "||") {
    return `(${left} ${op} ${right})`;
  }

  return `(${left} ${op} ${right})`;
}

/**
 * Compile unary operation to JavaScript
 */
function compileUnaryOp(expr: UnaryOpExpr, ctx: CompileContext): string {
  const operand = compileExpression(expr.operand, ctx);
  const op = expr.operator;

  if (op === "!") {
    return `!(${operand})`;
  }

  if (op === "-") {
    return `-(${operand})`;
  }

  return `${op}${operand}`;
}

/**
 * Compile function call to JavaScript
 */
function compileCallExpr(expr: CallExpr, ctx: CompileContext): string {
  const callee = compileExpression(expr.callee, ctx);
  const args = expr.args.map((a) => compileExpression(a, ctx)).join(", ");
  return `${callee}(${args})`;
}

/**
 * Compile struct instantiation to JavaScript object literal
 */
function compileStructInstantiation(
  expr: StructInstantiationExpr,
  ctx: CompileContext
): string {
  const fields = expr.fields
    .map((f) => `${f.name}: ${compileExpression(f.value, ctx)}`)
    .join(", ");
  return `{ ${fields} }`;
}

/**
 * Compile block expression to JavaScript IIFE
 */
function compileBlockExpr(expr: BlockExpr, ctx: CompileContext): string {
  ctx.indentLevel++;
  const stmts = expr.statements.map((s) => compileStatement(s, ctx)).join("\n");
  const finalExpr = expr.finalExpr
    ? `${indent(ctx)}return ${compileExpression(expr.finalExpr, ctx)};`
    : "";
  ctx.indentLevel--;

  return `(() => {\n${stmts}\n${finalExpr}\n${indent(ctx)}})()`;
}

/**
 * Compile match expression to JavaScript switch or if/else chain
 */
function compileMatchExpr(expr: MatchExpr, ctx: CompileContext): string {
  const matchedValue = compileExpression(expr.expr, ctx);

  // Generate if/else chain for match cases
  const cases = expr.cases
    .map((c, i) => {
      const caseBody = compileExpression(c.body, ctx);
      if (i === 0) {
        return `${matchedValue} === ${c.pattern} ? ${caseBody}`;
      }
      return ` : ${matchedValue} === ${c.pattern} ? ${caseBody}`;
    })
    .join("");

  return `(${cases} : undefined)`;
}
