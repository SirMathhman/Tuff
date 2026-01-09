import { applyBinaryOp } from "./eval/operators";
import {
  handleIfExpression,
  handleMatchExpression,
  handleFnExpression,
} from "./eval/control_flow";
import {
  mustGetEnvBinding,
  setEvaluateReturningOperand,
} from "./eval/functions";
import {
  tokenizeExpression,
  splitTokensToOperandsAndOps,
} from "./eval/tokenizer";
import { Env } from "./env";
import {
  resolveAddressOf,
  resolveDereference,
  resolveStructInstantiation,
  resolveArrayLiteral,
  resolveGroupedExpr,
  resolveIdentifier,
  isNotResolved,
  type OperandResolutionContext,
} from "./eval/operand_resolvers";
import {
  evaluateCall,
  type CallEvaluationContext,
} from "./eval/call_evaluator";
import { processOperators as processOperatorsImported } from "./eval/process_operators";

import {
  isPlainObject,
  isBoolOperand,
  isFloatOperand,
  isIntOperand,
  unwrapBindingValue,
  hasCallArgs,
  hasUninitialized,
  throwUseOfUninitialized,
  type RuntimeValue,
} from "./types";

// Re-export from operators module for backward compatibility
export { isTruthy, applyBinaryOp } from "./eval/operators";

const NOT_HANDLED = Symbol("NOT_HANDLED");

function tryHandleSpecialExpressions(
  exprStr: string,
  localEnv: Env,
  evaluateExpr: (expr: string, env: Env) => RuntimeValue
): RuntimeValue | typeof NOT_HANDLED {
  const sTrim = exprStr.trimStart();
  if (/^if\b/.test(sTrim)) {
    return handleIfExpression(sTrim, localEnv, evaluateExpr);
  }

  if (/^match\b/.test(sTrim)) {
    return handleMatchExpression(sTrim, localEnv, evaluateExpr);
  }

  // Support an inline function expression: fn name(...) => ... or fn name(...) { ... }
  // Use a stricter check to ensure we have a proper fn header (name followed by '(')
  if (/^fn\s+[a-zA-Z_]\w*\s*\(/.test(sTrim)) {
    return handleFnExpression(sTrim, localEnv);
  }

  return NOT_HANDLED;
}

function makeGetBindingTarget(localEnv: Env) {
  return (name: string) => {
    const binding = mustGetEnvBinding(localEnv, name);
    if (
      isPlainObject(binding) &&
      hasUninitialized(binding) &&
      binding.uninitialized
    )
      throwUseOfUninitialized(name);
    const targetVal = unwrapBindingValue(binding);
    return { binding, targetVal };
  };
}

function resolveOperands(
  operands: RuntimeValue[],
  resolutionCtx: OperandResolutionContext,
  evaluateCallAt: (funcOperand: RuntimeValue, callAppOperand: RuntimeValue) => RuntimeValue
): RuntimeValue[] {
  return operands.map((op) => {
    const groupedResult = resolveGroupedExpr(op, resolutionCtx);
    if (groupedResult !== undefined) return groupedResult;

    const arrayResult = resolveArrayLiteral(op, resolutionCtx);
    if (arrayResult !== undefined) return arrayResult;

    const addrOfResult = resolveAddressOf(op, resolutionCtx);
    if (addrOfResult !== undefined) return addrOfResult;

    const derefResult = resolveDereference(op, resolutionCtx);
    if (derefResult !== undefined) return derefResult;

    const structResult = resolveStructInstantiation(op, resolutionCtx);
    if (structResult !== undefined) return structResult;

    if (isPlainObject(op) && hasCallArgs(op)) {
      const callArgsRaw = op.callArgs;
      return evaluateCallAt(op, { callApp: callArgsRaw });
    }

    const identResult = resolveIdentifier(op, resolutionCtx);
    if (!isNotResolved(identResult)) return identResult;

    return op;
  });
}

function applyPrecedenceInPlace(
  operands: unknown[],
  ops: string[],
  opSet: Set<string>
) {
  let i = 0;
  while (i < ops.length) {
    if (opSet.has(ops[i])) {
      const res = applyBinaryOp(ops[i], operands[i], operands[i + 1]);
      operands.splice(i, 2, res);
      ops.splice(i, 1);
    } else i++;
  }
}

export function evaluateReturningOperand(
  exprStr: string,
  localEnv: Env
): RuntimeValue {
  const special = tryHandleSpecialExpressions(
    exprStr,
    localEnv,
    evaluateReturningOperand
  );
  if (special !== NOT_HANDLED) return special;

  const exprTokens = tokenizeExpression(exprStr);
  const { operands: initialOperands, ops } =
    splitTokensToOperandsAndOps(exprTokens);
  let operands = initialOperands;

  const getBindingTarget = makeGetBindingTarget(localEnv);

  // Create resolution context for operand resolver functions
  const resolutionCtx: OperandResolutionContext = {
    localEnv,
    getBindingTarget,
    evaluateExpr: evaluateReturningOperand,
  };

  // Create call evaluation context - must be defined before operands.map()
  // since evaluateCallAt may be called during operand resolution
  const callCtx: CallEvaluationContext = {
    localEnv,
    evaluateExpr: evaluateReturningOperand,
  };

  // helper to evaluate a call and return its result (delegates to extracted module)
  function evaluateCallAt(funcOperand: RuntimeValue, callAppOperand: RuntimeValue) {
    return evaluateCall(funcOperand, callAppOperand, callCtx);
  }

  operands = resolveOperands(operands, resolutionCtx, evaluateCallAt);

  // Process high-precedence operators (calls, indexing, field access)
  processOperatorsImported(operands, ops, {
    localEnv,
    evaluateReturningOperandFn: evaluateReturningOperand,
    evaluateCallAtFn: evaluateCallAt,
    getBindingTargetFn: getBindingTarget,
  });

  applyPrecedenceInPlace(operands, ops, new Set(["*", "/", "%"]));
  applyPrecedenceInPlace(operands, ops, new Set(["+", "-"]));
  // comparison operators
  applyPrecedenceInPlace(
    operands,
    ops,
    new Set(["<", ">", "<=", ">=", "==", "!="])
  );
  applyPrecedenceInPlace(operands, ops, new Set(["&&"]));
  applyPrecedenceInPlace(operands, ops, new Set(["||"]));

  return operands[0];
}

export function evaluateFlatExpression(exprStr: string, env: Env): number {
  const opnd = evaluateReturningOperand(exprStr, env);
  if (isBoolOperand(opnd)) return opnd.boolValue ? 1 : 0;
  if (isIntOperand(opnd)) return Number(opnd.valueBig);
  if (typeof opnd === "number") return opnd;
  if (isFloatOperand(opnd)) return opnd.floatValue;
  if (opnd === undefined) return 0;
  // Debug: output unexpected operand
  throw new Error("cannot evaluate expression");
}

// Initialize the functions module with evaluateReturningOperand to break circular dependency
setEvaluateReturningOperand(evaluateReturningOperand);
