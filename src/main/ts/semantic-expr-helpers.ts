import type {
  Result,
  CompileError,
  Expression,
  StructDef,
  CheckCtx,
} from "./types";
import { errResult } from "./semantic-errors";
import { checkTypeName } from "./semantic-generics";
import { lookupCrossModuleFn } from "./semantic-cross-module";
export {
  typeMismatch,
  checkBoolOperand,
  checkLiteralExpr,
  checkStructFieldRef,
  checkStrFieldErr,
  checkPrimMemberErr,
  checkTupleMemberExpr,
  checkStrMemberAccess,
  checkNonTupleIndex,
  findFieldForTypeParam,
  inferTypeFromNestedInstance,
} from "./semantic-expr-errors";
function validateTypeArgs(
  typeArgs: string[],
  structs: StructDef[],
  loc: { line: number; column: number },
): Result<void, CompileError> {
  for (const arg of typeArgs) {
    const argCheck = checkTypeName(
      arg,
      structs,
      loc,
      "Invalid type argument '",
    );
    if (!argCheck.isOk) return argCheck;
  }
  return { isOk: true, value: undefined };
}
const NUMERIC_TYPES = [
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "USize",
];
function isNumericType(t: string | undefined): boolean {
  return t !== undefined && NUMERIC_TYPES.includes(t);
}
type ExprChecker = (
  expr: Expression,
  ctx: CheckCtx,
) => Result<string | undefined, CompileError>;
function checkDivisionByZero(
  op: string,
  right: Expression,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> | null {
  if (op !== "/" && op !== "%") return null;
  if (right.type !== "NumberLiteral") return null;
  if ((right as { value: string | number }).value != "0") return null;
  return errResult(
    "Division by zero",
    "Cannot divide by zero at compile time.",
    "Use a non-zero divisor.",
    loc.line,
    loc.column,
  );
}
function checkBinaryExpr(
  expr: Expression,
  ctx: CheckCtx,
  checkExpr: ExprChecker,
): Result<string | undefined, CompileError> {
  const binExpr = expr as {
    operator: string;
    left: Expression;
    right: Expression;
    line: number;
    column: number;
  };
  const leftResult = checkExpr(binExpr.left, ctx);
  if (!leftResult.isOk) return leftResult;
  const rightResult = checkExpr(binExpr.right, ctx);
  if (!rightResult.isOk) return rightResult;
  const leftType = leftResult.value;
  const rightType = rightResult.value;
  const divZero = checkDivisionByZero(binExpr.operator, binExpr.right, {
    line: binExpr.line,
    column: binExpr.column,
  });
  if (divZero) return divZero;
  if (
    isNumericType(leftType) &&
    isNumericType(rightType) &&
    leftType === rightType
  ) {
    return { isOk: true, value: leftType };
  }
  return errResult(
    "Binary operator '" +
      binExpr.operator +
      "' requires matching numeric types but got '" +
      leftType +
      "' and '" +
      rightType +
      "'",
    "Both operands must be the same numeric type.",
    "Ensure both operands have the same type annotation.",
    binExpr.line,
    binExpr.column,
  );
}
function buildTypeSubstitutions(
  callExpr: { typeArgs?: string[] },
  typeParams: string[] | undefined,
): Record<string, string> {
  const typeSubs: Record<string, string> = {};
  if (callExpr.typeArgs && typeParams) {
    for (let i = 0; i < callExpr.typeArgs.length; i++) {
      typeSubs[typeParams[i]!] = callExpr.typeArgs[i]!;
    }
  }
  return typeSubs;
}
function checkArgTypes(
  callExpr: {
    functionName: string;
    args: Expression[];
    line: number;
    column: number;
  },
  paramTypes: string[],
  typeSubs: Record<string, string>,
  ctx: CheckCtx,
  checkExpr: ExprChecker,
): Result<void, CompileError> {
  for (let i = 0; i < callExpr.args.length; i++) {
    const arg = callExpr.args[i];
    if (arg === undefined) continue;
    const argResult = checkExpr(arg, ctx);
    if (!argResult.isOk) return argResult;
    let paramType = paramTypes[i] || "I32";
    const substituted = typeSubs[paramType];
    if (substituted) paramType = substituted;
    if (argResult.value !== paramType) {
      return errResult(
        "Argument " +
          (i + 1) +
          " of '" +
          callExpr.functionName +
          "' expects '" +
          paramType +
          "' but got '" +
          (argResult.value || "unknown") +
          "'",
        "Argument type must match parameter type.",
        "Change the argument type to '" + paramType + "'.",
        callExpr.line,
        callExpr.column,
      );
    }
  }
  return { isOk: true, value: undefined };
}
function resolveSubstitutedReturn(
  returnType: string | undefined,
  typeSubs: Record<string, string>,
): string {
  let resolved = returnType || "I32";
  const sub = typeSubs[resolved];
  if (sub) resolved = sub;
  return resolved;
}
function checkFunctionArgs(
  callExpr: {
    functionName: string;
    args: Expression[];
    line: number;
    column: number;
    typeArgs?: string[];
  },
  paramTypes: string[],
  typeParams: string[] | undefined,
  returnType: string | undefined,
  ctx: CheckCtx,
  checkExpr: ExprChecker,
): Result<string | undefined, CompileError> {
  if (callExpr.args.length !== paramTypes.length) {
    return errResult(
      "Function '" +
        callExpr.functionName +
        "' expects " +
        paramTypes.length +
        " argument(s) but got " +
        callExpr.args.length,
      "Argument count must match function parameter count.",
      "Provide " + paramTypes.length + " arguments.",
      callExpr.line,
      callExpr.column,
    );
  }
  const typeSubs = buildTypeSubstitutions(callExpr, typeParams);
  const argCheck = checkArgTypes(
    callExpr,
    paramTypes,
    typeSubs,
    ctx,
    checkExpr,
  );
  if (!argCheck.isOk) return argCheck;
  return { isOk: true, value: resolveSubstitutedReturn(returnType, typeSubs) };
}
function checkFunctionCall(
  expr: Expression,
  ctx: CheckCtx,
  checkExpr: ExprChecker,
): Result<string | undefined, CompileError> {
  const callExpr = expr as {
    functionName: string;
    object?: Expression;
    typeArgs: string[];
    args: Expression[];
    line: number;
    column: number;
  };
  if (callExpr.object) {
    const fnResult = lookupCrossModuleFn(callExpr, ctx);
    if (!fnResult.isOk) return fnResult;
    return checkFunctionArgs(
      callExpr,
      fnResult.value.paramTypes || [],
      fnResult.value.typeParams,
      fnResult.value.returnType,
      ctx,
      checkExpr,
    );
  }
  const fn = ctx.functions.find((f) => f.name === callExpr.functionName);
  if (!fn) {
    return errResult(
      "Use of undeclared function '" + callExpr.functionName + "'",
      "Function must be declared before use.",
      "Declare the function with 'fn' first.",
      callExpr.line,
      callExpr.column,
    );
  }
  return checkFunctionArgs(
    callExpr,
    fn.params.map((p) => p.typeName),
    fn.typeParams,
    fn.returnType,
    ctx,
    checkExpr,
  );
}
export {
  validateTypeArgs,
  checkBinaryExpr,
  checkFunctionArgs,
  checkFunctionCall,
};
