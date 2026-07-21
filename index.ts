// ── AST Types ──────────────────────────────────────────────────────────────

interface Program {
  type: "Program";
  body: Statement[];
}

type Statement =
  | ExprStatement
  | LetStatement
  | AssignStatement
  | CompoundAssignStatement
  | BlockStatement
  | IfStatement
  | WhileStatement
  | FunctionDefStatement
  | StructDefStatement;

interface StructField {
  name: string;
  typeAnnotation: string | null;
}

interface StructDefStatement {
  type: "StructDefStatement";
  name: string;
  fields: StructField[];
}

interface FunctionParam {
  name: string;
  typeAnnotation: string | null;
}

interface FunctionDefStatement {
  type: "FunctionDefStatement";
  name: string;
  params: FunctionParam[];
  returnAnnotation: string | null;
  body: Expr;
}

interface ExprStatement {
  type: "ExprStatement";
  expression: Expr;
}

interface LetStatement {
  type: "LetStatement";
  mutable: boolean;
  name: string;
  typeAnnotation: string | null;
  value: Expr;
}

interface AssignStatement {
  type: "AssignStatement";
  name: string;
  value: Expr;
}

interface CompoundAssignStatement {
  type: "CompoundAssignStatement";
  name: string;
  op: string;
  value: Expr;
}

interface BlockStatement {
  type: "BlockStatement";
  body: Statement[];
}

interface IfStatement {
  type: "IfStatement";
  condition: Expr;
  thenBranch: Statement;
  elseBranch: Statement | null;
}

interface WhileStatement {
  type: "WhileStatement";
  condition: Expr;
  body: Statement;
}

type Expr =
  | BinaryExpr
  | NumberLiteral
  | Identifier
  | BooleanLiteral
  | CallExpr
  | StructLiteral
  | FieldAccess
  | RefExpr
  | DerefExpr;

interface StructLiteral {
  type: "StructLiteral";
  structName: string;
  fields: { name: string; value: Expr }[];
}

interface FieldAccess {
  type: "FieldAccess";
  object: Expr;
  field: string;
}

interface CallExpr {
  type: "CallExpr";
  name: string;
  arguments: Expr[];
}

interface BinaryExpr {
  type: "BinaryExpr";
  left: Expr;
  op: string;
  right: Expr;
}

interface NumberLiteral {
  type: "NumberLiteral";
  value: number;
  typeAnnotation: string | null;
}

interface Identifier {
  type: "Identifier";
  name: string;
}

interface BooleanLiteral {
  type: "BooleanLiteral";
  value: boolean;
}

interface RefExpr {
  type: "RefExpr";
  operand: Expr;
}

interface DerefExpr {
  type: "DerefExpr";
  operand: Expr;
}

// ── Scope ──────────────────────────────────────────────────────────────────

interface FunctionInfo {
  body: Expr;
  params: FunctionParam[];
}

interface StructValue {
  [key: string]: number | StructValue;
}

type Scope = {
  env: Record<string, number | StructValue>;
  mutable: Set<string>;
  types: Record<string, string | null>;
  functions: Record<string, FunctionInfo>;
  functionReturnTypes: Record<string, string | null>;
  structs: Record<string, StructField[]>;
};

// ── Entry Point ────────────────────────────────────────────────────────────

export function interpret(source: string): number {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const scopes: Scope[] = [
    {
      env: {},
      mutable: new Set(),
      types: {},
      functions: {},
      functionReturnTypes: {},
      structs: {},
    },
  ];
  return evaluateProgram(ast, scopes);
}

// ── Evaluator ──────────────────────────────────────────────────────────────

function evaluateProgram(node: Program, scopes: Scope[]): number {
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  return result;
}

function evaluateStatement(node: Statement, scopes: Scope[]): number {
  switch (node.type) {
    case "ExprStatement":
      return evalExprStmt(node, scopes);
    case "LetStatement":
      return evalLet(node, scopes);
    case "AssignStatement":
      return evalAssign(node, scopes);
    case "CompoundAssignStatement":
      return evalCompoundAssign(node, scopes);
    case "BlockStatement":
      return evalBlock(node, scopes);
    case "IfStatement":
      return evalIf(node, scopes);
    case "WhileStatement":
      return evalWhile(node, scopes);
    case "FunctionDefStatement":
      return evalFunctionDef(node, scopes);
    case "StructDefStatement":
      return evalStructDef(node, scopes);
  }
}

function evalFunctionDef(node: FunctionDefStatement, scopes: Scope[]): number {
  const scope = scopes[scopes.length - 1]!;
  scope.functions[node.name] = { body: node.body, params: node.params };
  scope.functionReturnTypes[node.name] = node.returnAnnotation;
  if (node.returnAnnotation) {
    const srcType = inferExprType(node.body, scopes);
    checkTypeCompatibility(srcType, node.returnAnnotation);
  }
  return 0;
}

function evalExprStmt(node: ExprStatement, scopes: Scope[]): number {
  const result = evaluateExpr(node.expression, scopes);
  return typeof result === "number" ? result : 0;
}

function evalLet(node: LetStatement, scopes: Scope[]): number {
  const value = evaluateExpr(node.value, scopes);
  const srcType = inferExprType(node.value, scopes);
  checkTypeCompatibility(srcType, node.typeAnnotation);
  if (typeof value === "number") validateTypeRange(value, node.typeAnnotation);
  const scope = scopes[scopes.length - 1]!;
  scope.env[node.name] = value;
  scope.types[node.name] = node.typeAnnotation ?? srcType;
  if (node.mutable) scope.mutable.add(node.name);
  return 0;
}

function evalAssign(node: AssignStatement, scopes: Scope[]): number {
  const scope = validateMutableTarget(node.name, scopes);
  const srcType = inferExprType(node.value, scopes);
  const dstType = scope.types[node.name] ?? null;
  checkTypeCompatibility(srcType, dstType);
  const value = evaluateExpr(node.value, scopes);
  scope.env[node.name] = typeof value === "number" ? value : 0;
  return 0;
}

function evalCompoundAssign(
  node: CompoundAssignStatement,
  scopes: Scope[],
): number {
  const scope = validateMutableTarget(node.name, scopes);
  const value = evaluateExpr(node.value, scopes);
  if (node.op === "+=") {
    const current = scope.env[node.name]!;
    const numValue = typeof value === "number" ? value : 0;
    scope.env[node.name] =
      (typeof current === "number" ? current : 0) + numValue;
  }
  return 0;
}

function evalStructDef(node: StructDefStatement, scopes: Scope[]): number {
  const scope = scopes[scopes.length - 1]!;
  if (node.name in scope.structs) {
    throw new Error(`duplicate struct: ${node.name}`);
  }
  scope.structs[node.name] = node.fields;
  return 0;
}

function evalStructLiteral(node: StructLiteral, scopes: Scope[]): StructValue {
  const scope = scopes[scopes.length - 1]!;
  const structDef = scope.structs[node.structName];
  if (!structDef) {
    throw new Error(`undefined struct: ${node.structName}`);
  }
  const definedFields = new Set(structDef.map((f) => f.name));
  const providedFields = new Set(node.fields.map((f) => f.name));
  for (const field of providedFields) {
    if (!definedFields.has(field)) {
      throw new Error(`unknown field "${field}" in ${node.structName} literal`);
    }
  }
  for (const field of definedFields) {
    if (!providedFields.has(field)) {
      throw new Error(`missing field "${field}" in ${node.structName} literal`);
    }
  }
  const fields: StructValue = {};
  for (const field of node.fields) {
    const val = evaluateExpr(field.value, scopes);
    const defField = structDef.find((f) => f.name === field.name);
    if (defField && defField.typeAnnotation) {
      const valType = inferExprType(field.value, scopes);
      checkTypeCompatibility(valType, defField.typeAnnotation);
    }
    fields[field.name] = typeof val === "number" ? val : val;
  }
  return fields;
}

function evalFieldAccess(
  node: FieldAccess,
  scopes: Scope[],
): number | StructValue {
  const obj = evaluateExpr(node.object, scopes);
  if (typeof obj === "object" && obj !== null) {
    const val = (obj as StructValue)[node.field];
    if (val === undefined)
      throw new Error(`field ${node.field} not found on struct`);
    return val;
  }
  throw new Error(`cannot access field ${node.field} on non-struct value`);
}

function inferStructLiteralType(
  node: StructLiteral,
  scopes: Scope[],
): string | null {
  const scope = scopes[scopes.length - 1]!;
  return node.structName in scope.structs ? node.structName : null;
}

function inferFieldAccessType(
  node: FieldAccess,
  scopes: Scope[],
): string | null {
  const objType = inferExprType(node.object, scopes);
  if (objType === null) return null;
  const scope = scopes[scopes.length - 1]!;
  const fields = scope.structs[objType];
  if (fields) {
    const field = fields.find((f) => f.name === node.field);
    return field ? field.typeAnnotation : null;
  }
  return null;
}

function evalBlock(node: BlockStatement, scopes: Scope[]): number {
  scopes.push({
    env: {},
    mutable: new Set(),
    types: {},
    functions: {},
    functionReturnTypes: {},
    structs: {},
  });
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  scopes.pop();
  return result;
}

function evalIf(node: IfStatement, scopes: Scope[]): number {
  const condType = inferExprType(node.condition, scopes);
  if (condType !== "Bool") {
    throw new Error("if condition must be Bool");
  }
  const condition = evaluateExpr(node.condition, scopes);
  if (condition) {
    return evaluateStatement(node.thenBranch, scopes);
  } else if (node.elseBranch) {
    return evaluateStatement(node.elseBranch, scopes);
  }
  return 0;
}

function evalWhile(node: WhileStatement, scopes: Scope[]): number {
  const condType = inferExprType(node.condition, scopes);
  if (condType !== "Bool") {
    throw new Error("while condition must be Bool");
  }
  while (evaluateExpr(node.condition, scopes)) {
    evaluateStatement(node.body, scopes);
  }
  return 0;
}

function validateMutableTarget(name: string, scopes: Scope[]): Scope {
  if (!lookup(name, scopes)) {
    throw new Error(`undefined identifier: ${name}`);
  }
  const scope = findScope(name, scopes);
  if (!scope || !scope.mutable.has(name)) {
    throw new Error(`cannot assign to immutable variable: ${name}`);
  }
  return scope;
}

function evaluateExpr(node: Expr, scopes: Scope[]): number | StructValue {
  switch (node.type) {
    case "NumberLiteral":
    case "BooleanLiteral":
      return evalLiteral(node);
    case "Identifier":
      return evalIdentifier(node, scopes);
    case "BinaryExpr":
      return evalBinary(node, scopes);
    case "CallExpr":
      return evalCall(node, scopes);
    case "StructLiteral":
    case "FieldAccess":
      return evalStructOrField(node, scopes);
    case "RefExpr":
    case "DerefExpr":
      return evalRefOrDeref(node, scopes);
  }
}

function evalLiteral(
  node: NumberLiteral | BooleanLiteral,
): number | StructValue {
  if (node.type === "NumberLiteral") return node.value;
  return node.value ? 1 : 0;
}

function evalRefOrDeref(
  node: RefExpr | DerefExpr,
  scopes: Scope[],
): number | StructValue {
  if (node.type === "RefExpr") return evalRefExpr(node, scopes);
  return evalDerefExpr(node, scopes);
}

function evalStructOrField(
  node: StructLiteral | FieldAccess,
  scopes: Scope[],
): number | StructValue {
  if (node.type === "StructLiteral") return evalStructLiteral(node, scopes);
  return evalFieldAccess(node, scopes);
}

function evalIdentifier(
  node: Identifier,
  scopes: Scope[],
): number | StructValue {
  const value = lookupValue(node.name, scopes);
  if (value !== undefined) return value;
  throw new Error(`undefined identifier: ${node.name}`);
}

function evalRefExpr(node: RefExpr, scopes: Scope[]): number | StructValue {
  const val = evaluateExpr(node.operand, scopes);
  return val;
}

function evalDerefExpr(node: DerefExpr, scopes: Scope[]): number | StructValue {
  const val = evaluateExpr(node.operand, scopes);
  return typeof val === "number" ? val : 0;
}

function evalCall(node: CallExpr, scopes: Scope[]): number {
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  if (funcInfo === null) throw new Error(`undefined function: ${node.name}`);
  const callScope: Scope = {
    env: {},
    mutable: new Set(),
    types: {},
    functions: {},
    functionReturnTypes: {},
    structs: {},
  };
  for (let i = 0; i < funcInfo.params.length; i++) {
    const param = funcInfo.params[i]!;
    const argType = inferExprType(node.arguments[i]!, scopes);
    checkTypeCompatibility(argType, param.typeAnnotation);
    const argValue = evaluateExpr(node.arguments[i]!, scopes);
    callScope.env[param.name] = argValue;
    callScope.types[param.name] = param.typeAnnotation;
  }
  scopes.push(callScope);
  const result = evaluateExpr(funcInfo.body, scopes);
  scopes.pop();
  return typeof result === "number" ? result : 0;
}

function lookupFunctionInfo(
  name: string,
  scopes: Scope[],
): FunctionInfo | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.functions) return scope.functions[name]!;
  }
  return null;
}

function evalBinary(node: BinaryExpr, scopes: Scope[]): number {
  const left = evaluateExpr(node.left, scopes);
  const right = evaluateExpr(node.right, scopes);
  return applyOp(
    node.op,
    typeof left === "number" ? left : 0,
    typeof right === "number" ? right : 0,
  );
}

function applyOp(op: string, left: number, right: number): number {
  if (op === "+") return left + right;
  if (op === "-") return left - right;
  if (op === "*") return left * right;
  if (op === "/") return left / right;
  if (op === "||") return left || right;
  if (op === "&&") return left && right;
  return compareOp(op, left, right);
}

function compareOp(op: string, left: number, right: number): number {
  if (op === "<") return left < right ? 1 : 0;
  if (op === ">") return left > right ? 1 : 0;
  if (op === "<=") return left <= right ? 1 : 0;
  if (op === ">=") return left >= right ? 1 : 0;
  return compareEquality(op, left, right);
}

function compareEquality(op: string, left: number, right: number): number {
  if (op === "==") return left == right ? 1 : 0;
  if (op === "!=") return left != right ? 1 : 0;
  throw new Error(`unknown operator: ${op}`);
}

// ── Type Inference ─────────────────────────────────────────────────────────

function inferExprType(node: Expr, scopes: Scope[]): string | null {
  switch (node.type) {
    case "NumberLiteral":
      return node.typeAnnotation;
    case "BooleanLiteral":
      return "Bool";
    case "Identifier":
      return lookupType(node.name, scopes);
    case "BinaryExpr":
      return inferBinaryType(node, scopes);
    case "CallExpr":
      return inferCallType(node, scopes);
    case "StructLiteral":
      return inferStructLiteralType(node, scopes);
    case "FieldAccess":
      return inferFieldAccessType(node, scopes);
    case "RefExpr":
      return inferRefType(node, scopes);
    case "DerefExpr":
      return inferDerefType(node, scopes);
  }
}

function inferRefType(node: RefExpr, scopes: Scope[]): string | null {
  const innerType = inferExprType(node.operand, scopes);
  return innerType ? `&${innerType}` : null;
}

function inferDerefType(node: DerefExpr, scopes: Scope[]): string | null {
  const refType = inferExprType(node.operand, scopes);
  if (refType && refType.startsWith("&")) return refType.slice(1);
  return refType;
}

function inferCallType(node: CallExpr, scopes: Scope[]): string | null {
  const returnType = lookupFunctionReturnType(node.name, scopes);
  if (returnType !== null) return returnType;
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  return funcInfo ? inferExprType(funcInfo.body, scopes) : null;
}

function lookupFunctionReturnType(
  name: string,
  scopes: Scope[],
): string | null {
  return lookupInScopes(scopes, "functionReturnTypes", name);
}

function lookupInScopes(
  scopes: Scope[],
  prop: keyof Scope,
  name: string,
): string | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope[prop])
      return (scope[prop] as Record<string, string | null>)[name] ?? null;
  }
  return null;
}

function inferBinaryType(node: BinaryExpr, scopes: Scope[]): string | null {
  const leftType = inferExprType(node.left, scopes);
  const rightType = inferExprType(node.right, scopes);
  if (isArithmeticOp(node.op)) return leftType ?? rightType;
  if (isComparisonOp(node.op)) return "Bool";
  return null;
}

function isArithmeticOp(op: string): boolean {
  return op === "+" || op === "-" || op === "*" || op === "/";
}

function isComparisonOp(op: string): boolean {
  return (
    op === "<" ||
    op === ">" ||
    op === "<=" ||
    op === ">=" ||
    op === "==" ||
    op === "!="
  );
}

function lookupType(name: string, scopes: Scope[]): string | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i]!;
    if (name in scope.types) return scope.types[name] ?? null;
  }
  return null;
}

function checkTypeCompatibility(
  srcType: string | null,
  dstType: string | null,
): void {
  if (dstType === null) return;
  if (srcType === null) return;
  if (srcType === dstType) return;
  if (isRefType(srcType) && isRefType(dstType)) {
    checkRefTypeCompatibility(srcType, dstType);
    return;
  }
  if (isNarrower(srcType, dstType)) return;
  throw new Error(`type mismatch: cannot assign ${srcType} to ${dstType}`);
}

function isRefType(typeName: string): boolean {
  return typeName.startsWith("&");
}

function checkRefTypeCompatibility(
  srcRefType: string,
  dstRefType: string,
): void {
  const srcInner = srcRefType.slice(1);
  const dstInner = dstRefType.slice(1);
  if (srcInner !== dstInner) {
    throw new Error(
      `type mismatch: cannot assign ${srcRefType} to ${dstRefType}`,
    );
  }
}

function isNarrower(src: string, dst: string): boolean {
  const srcBits = parseTypeBits(src);
  const dstBits = parseTypeBits(dst);
  return srcBits !== null && dstBits !== null && srcBits < dstBits;
}

function parseTypeBits(typeName: string): number | null {
  const match = typeName.match(/^U(\d+)$/);
  return match ? parseInt(match[1]!, 10) : null;
}

// ── Parser ─────────────────────────────────────────────────────────────────

interface Parser {
  tokens: string[];
  pos: number;
}

function parse(tokens: string[]): Program {
  const parser: Parser = { tokens, pos: 0 };
  const body: Statement[] = [];

  while (parser.pos < tokens.length) {
    body.push(parseStatement(parser));
  }

  return { type: "Program", body };
}

function parseStatement(p: Parser): Statement {
  if (p.pos >= p.tokens.length) {
    return {
      type: "ExprStatement",
      expression: { type: "NumberLiteral", value: 0, typeAnnotation: null },
    };
  }

  const token = p.tokens[p.pos]!;

  if (token === "let") return parseLet(p);
  if (token === "fn") return parseFn(p);
  if (token === "struct") return parseStructDef(p);
  if (token === "{") return parseBlock(p);
  if (token === "if") return parseIf(p);
  if (token === "while") return parseWhile(p);
  if (token === "else") return parseElse(p);
  if (isAssignable(p, p.pos)) return parseAssign(p);
  return parseExprStmt(p);
}

function parseFn(p: Parser): FunctionDefStatement {
  p.pos++; // 'fn'
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  p.pos++; // '('
  const params = parseParams(p);
  if (p.tokens[p.pos] === ")") p.pos++;
  const returnAnn = parseReturnAnnotation(p);
  p.pos++; // '=>'
  const body = parseOrExpression(p);
  if (p.tokens[p.pos] === ";") p.pos++;
  return {
    type: "FunctionDefStatement",
    name,
    params,
    body,
    returnAnnotation: returnAnn,
  };
}

function parseParams(p: Parser): FunctionParam[] {
  const params: FunctionParam[] = [];
  const seenNames = new Set<string>();
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== ")") {
    const name = p.tokens[p.pos]!;
    p.pos++; // param name
    if (seenNames.has(name)) {
      throw new Error(`duplicate parameter: ${name}`);
    }
    seenNames.add(name);
    const typeAnn = parseTypeToken(p);
    params.push({ name, typeAnnotation: typeAnn });
    if (p.tokens[p.pos] === ",") p.pos++;
  }
  return params;
}

function parseTypeToken(p: Parser): string | null {
  if (p.tokens[p.pos] === ":") {
    p.pos++; // skip ':'
    const typeToken = p.tokens[p.pos]!;
    if (typeToken === "&") {
      p.pos++; // skip '&'
      const innerType = p.tokens[p.pos]!;
      p.pos++; // skip inner type
      return `&${innerType}`;
    }
    p.pos++; // skip type
    return typeToken;
  }
  return null;
}

function parseCallArgs(p: Parser): Expr[] {
  const args: Expr[] = [];
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== ")") {
    args.push(parseOrExpression(p));
    if (p.tokens[p.pos] === ",") p.pos++;
  }
  return args;
}

function parseStructDef(p: Parser): StructDefStatement {
  p.pos++; // 'struct'
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  p.pos++; // '{'
  const fields = parseStructFields(p);
  if (p.tokens[p.pos] === "}") p.pos++;
  return { type: "StructDefStatement", name, fields };
}

function parseStructFields(p: Parser): StructField[] {
  const fields: StructField[] = [];
  const seen = new Set<string>();
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== "}") {
    const name = p.tokens[p.pos]!;
    p.pos++; // field name
    if (seen.has(name)) {
      throw new Error(`duplicate struct field: ${name}`);
    }
    seen.add(name);
    const typeAnn = parseTypeToken(p);
    fields.push({ name, typeAnnotation: typeAnn });
    if (p.tokens[p.pos] === ",") p.pos++;
  }
  return fields;
}

function parseStructLiteral(p: Parser, structName?: string): StructLiteral {
  const name = structName ?? p.tokens[p.pos]!;
  if (!structName) p.pos++; // struct name
  p.pos++; // '{'
  const fields: { name: string; value: Expr }[] = [];
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== "}") {
    const fieldName = p.tokens[p.pos]!;
    p.pos++; // field name
    p.pos++; // ':'
    const value = parseOrExpression(p);
    fields.push({ name: fieldName, value });
    if (p.tokens[p.pos] === ",") p.pos++;
  }
  if (p.tokens[p.pos] === "}") p.pos++;
  return { type: "StructLiteral", structName: name, fields };
}

function parseReturnAnnotation(p: Parser): string | null {
  return parseTypeToken(p);
}

function parseLet(p: Parser): LetStatement {
  p.pos++; // 'let'
  const mutable = p.tokens[p.pos] === "mut";
  if (mutable) p.pos++;
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  const typeAnn = parseTypeAnnotation(p);
  p.pos++; // '='
  const value = parseOrExpression(p);
  if (p.tokens[p.pos] === ";") p.pos++;
  return {
    type: "LetStatement",
    mutable,
    name,
    typeAnnotation: typeAnn,
    value,
  };
}

function parseTypeAnnotation(p: Parser): string | null {
  return parseTypeToken(p);
}

function parseBlock(p: Parser): BlockStatement {
  p.pos++; // '{'
  const body: Statement[] = [];
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== "}") {
    body.push(parseStatement(p));
  }
  if (p.tokens[p.pos] === "}") p.pos++;
  return { type: "BlockStatement", body };
}

function parseIf(p: Parser): IfStatement {
  p.pos++; // 'if'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (p.tokens[p.pos] === ")") p.pos++;
  const thenBranch = parseStatement(p);
  let elseBranch: Statement | null = null;
  if (p.tokens[p.pos] === "else") {
    p.pos++;
    elseBranch = parseStatement(p);
  }
  return { type: "IfStatement", condition, thenBranch, elseBranch };
}

function parseWhile(p: Parser): WhileStatement {
  p.pos++; // 'while'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (p.tokens[p.pos] === ")") p.pos++;
  const body = parseStatement(p);
  return { type: "WhileStatement", condition, body };
}

function parseElse(p: Parser): ExprStatement {
  p.pos++;
  return {
    type: "ExprStatement",
    expression: { type: "NumberLiteral", value: 0, typeAnnotation: null },
  };
}

function parseAssign(p: Parser): AssignStatement | CompoundAssignStatement {
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  const op = p.tokens[p.pos]!;
  p.pos++; // operator
  const value = parseOrExpression(p);
  if (p.tokens[p.pos] === ";") p.pos++;
  if (op === "+=") {
    return { type: "CompoundAssignStatement", name, op, value };
  }
  return { type: "AssignStatement", name, value };
}

function parseExprStmt(p: Parser): ExprStatement {
  const expr = parseOrExpression(p);
  if (p.tokens[p.pos] === ";") p.pos++;
  return { type: "ExprStatement", expression: expr };
}

function isAssignable(p: Parser, pos: number): boolean {
  if (pos >= p.tokens.length) return false;
  const nextPos = pos + 1;
  const token = p.tokens[pos]!;
  if (isKeyword(token)) return false;
  return (
    /[a-zA-Z_]/.test(token) &&
    nextPos < p.tokens.length &&
    isAssignOp(p.tokens[nextPos])
  );
}

function isKeyword(token: string): boolean {
  return (
    token === "let" ||
    token === "mut" ||
    token === "true" ||
    token === "false" ||
    token === "if" ||
    token === "else" ||
    token === "while" ||
    token === "fn" ||
    token === "struct"
  );
}

function isAssignOp(token: string | undefined): boolean {
  return token === "=" || token === "+=";
}

// ── Expression Parser (precedence climbing) ────────────────────────────────

const precedence: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  "==": 3,
  "!=": 3,
  "+": 4,
  "-": 4,
  "*": 5,
  "/": 5,
};

function parseOrExpression(p: Parser): Expr {
  return parseExpression(p, 0);
}

function parseExpression(p: Parser, minPrec: number): Expr {
  let left = parseFactor(p);

  while (p.pos < p.tokens.length) {
    const op = p.tokens[p.pos]!;
    const prec = precedence[op];
    if (prec === undefined || prec <= minPrec) break;
    p.pos++;
    const right = parseExpression(p, prec);
    left = { type: "BinaryExpr", left, op, right };
  }

  return left;
}

function parseFactor(p: Parser): Expr {
  if (p.pos >= p.tokens.length)
    return { type: "NumberLiteral", value: 0, typeAnnotation: null };
  const token = p.tokens[p.pos]!;

  if (token === "(") return parseParens(p);
  if (token === "true") {
    p.pos++;
    return { type: "BooleanLiteral", value: true };
  }
  if (token === "false") {
    p.pos++;
    return { type: "BooleanLiteral", value: false };
  }
  if (token === "&") {
    p.pos++;
    const operand = parseFactor(p);
    return { type: "RefExpr", operand };
  }
  if (token === "*") {
    p.pos++;
    const operand = parseFactor(p);
    return { type: "DerefExpr", operand };
  }
  if (/\d/.test(token[0]!)) return parseNumber(p, token);
  if (/[a-zA-Z_]/.test(token)) return parseIdentifierOrCall(p, token);

  // Fallback: plain number
  p.pos++;
  return {
    type: "NumberLiteral",
    value: parseInt(token, 10),
    typeAnnotation: null,
  };
}

function parseParens(p: Parser): Expr {
  p.pos++;
  const expr = parseOrExpression(p);
  if (p.tokens[p.pos] === ")") p.pos++;
  return expr;
}

function parseNumber(p: Parser, token: string): Expr {
  const numVal = parseInt(token, 10);
  const typeAnn = readTypeAnnotation(token);
  validateTypeRange(numVal, typeAnn);
  p.pos++;
  return { type: "NumberLiteral", value: numVal, typeAnnotation: typeAnn };
}

function parseIdentifierOrCall(p: Parser, token: string): Expr {
  p.pos++;
  if (p.tokens[p.pos] === "(") return parseCall(p, token);
  if (p.tokens[p.pos] === "{") return parseStructLiteral(p, token);
  return parseIdentifierWithFields(p, token);
}

function parseCall(p: Parser, name: string): CallExpr {
  p.pos++; // '('
  const args = parseCallArgs(p);
  if (p.tokens[p.pos] === ")") p.pos++;
  return { type: "CallExpr", name, arguments: args };
}

function parseIdentifierWithFields(p: Parser, name: string): Expr {
  let expr: Expr = { type: "Identifier", name };
  while (p.tokens[p.pos] === ".") {
    p.pos++; // '.'
    const field = p.tokens[p.pos]!;
    p.pos++; // field name
    expr = { type: "FieldAccess", object: expr, field };
  }
  return expr;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function lookup(name: string, scopes: Scope[]): boolean {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return true;
  }
  return false;
}

function findScope(name: string, scopes: Scope[]): Scope | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!;
  }
  return null;
}

function lookupValue(
  name: string,
  scopes: Scope[],
): number | StructValue | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!.env[name];
  }
  return undefined;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      const numEnd = skipDigits(source, i);
      const annEnd = skipTypeAnnotation(source, numEnd);
      tokens.push(source.slice(i, annEnd));
      i = annEnd;
    } else if (/[a-zA-Z_]/.test(ch)) {
      tokens.push(readIdentifier(source, i));
      i = skipIdentifier(source, i);
    } else if (tryMultiCharOp(source, i, tokens)) {
      i += getMultiCharLen(tokens[tokens.length - 1]!);
    } else if (isOperator(ch)) {
      tokens.push(ch);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function tryMultiCharOp(
  source: string,
  pos: number,
  tokens: string[],
): boolean {
  const ch = source[pos]!;
  const next = source[pos + 1];
  if (isFatArrow(ch, next)) {
    tokens.push("=>");
    return true;
  }
  if (isLogicalOp(ch, next)) {
    tokens.push(ch + next);
    return true;
  }
  if (isAssignCompound(ch, next)) {
    tokens.push(ch + next);
    return true;
  }
  if (isCompareCompound(ch, next)) {
    tokens.push(ch + next);
    return true;
  }
  return false;
}

function isFatArrow(ch: string, next: string | undefined): boolean {
  return ch === "=" && next === ">";
}

function isLogicalOp(ch: string, next: string | undefined): boolean {
  return (ch === "|" && next === "|") || (ch === "&" && next === "&");
}

function isAssignCompound(ch: string, next: string | undefined): boolean {
  return ch === "+" && next === "=";
}

function isCompareCompound(ch: string, next: string | undefined): boolean {
  return (
    (ch === "<" && next === "=") ||
    (ch === ">" && next === "=") ||
    (ch === "!" && next === "=") ||
    (ch === "=" && next === "=")
  );
}

function getMultiCharLen(token: string): number {
  return token.length;
}

function skipDigits(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\d/.test(source[i]!)) i++;
  return i;
}

function readIdentifier(source: string, start: number): string {
  let ident = "";
  for (
    let i = start;
    i < source.length && /[a-zA-Z0-9_]/.test(source[i]!);
    i++
  ) {
    ident += source[i]!;
  }
  return ident;
}

function skipIdentifier(source: string, start: number): number {
  let i = start;
  while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) i++;
  return i;
}

function skipTypeAnnotation(source: string, start: number): number {
  let i = start;
  if (i < source.length && source[i] === "U") {
    i++;
    while (i < source.length && /\d/.test(source[i]!)) i++;
  }
  return i;
}

function isOperator(ch: string): boolean {
  return "+-*/()=;{}<>=!:,&.".includes(ch);
}

function readTypeAnnotation(token: string): string | null {
  const match = token.match(/^(\d+)(U\d+)$/);
  return match ? (match[2] ?? null) : null;
}

function validateTypeRange(value: number, typeAnn: string | null): void {
  if (typeAnn === null) return;
  validateUnsigned(value, typeAnn);
}

function validateUnsigned(value: number, typeAnn: string): void {
  if (typeAnn === "U8" && (value < 0 || value > 255)) {
    throw new Error(`value ${value} out of range for U8 (0-255)`);
  }
  if (typeAnn === "U16" && (value < 0 || value > 65535)) {
    throw new Error(`value ${value} out of range for U16 (0-65535)`);
  }
  if (typeAnn === "U32" && (value < 0 || value > 4294967295)) {
    throw new Error(`value ${value} out of range for U32 (0-4294967295)`);
  }
}
