import { execute, type Instruction } from "./core/vm";
import {
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
} from "./parsing/parser";
import {
  type CompileError,
  checkTypeOverflow,
  checkNegativeUnsignedError,
} from "./types/types";
import { type VariableContext } from "./types/variable-types";
import {
  buildContextFromLetBindings,
  parseLetComponents,
} from "./support/let-binding";
import { parseLetExpression as parseLetExpressionModule } from "./parsing/expressions/let-expression-parsing";
import {
  extractFunctionDefinitions,
  getRemainningAfterFunctions,
} from "./support/function-context";
import { tryFunctionCall } from "./compilation/function-compilation";
import { type FunctionContext } from "./types/function-types";
import {
  detectVariableShadowing,
  detectTypeIncompatibility,
  detectComparisonTypeMismatch,
  detectInvalidIfCondition,
  detectIfBranchTypeMismatch,
} from "./validation/validation";
import {
  detectNonMutableReassignment,
  detectReassignmentTypeChange,
  detectDereferenceReassignmentOnImmutablePointer,
  detectMultipleReassignmentsToDeclarationOnly,
  detectUninitializedDeclarationOnly,
  detectArrayIndexReassignmentOnImmutableArray,
  detectOutOfOrderArrayAssignment,
} from "./validation/reassignment-validation";
import { detectPointerTypeErrors } from "./validation/pointer-validation";
import { compileNoContext } from "./parsing/arithmetic-parsing";
import { type ExecutionState, type Dump } from "./support/debug-dump";
import {
  tryReassignment,
  tryDereferenceReassignment,
  tryArrayIndexReassignment,
  tryDereference,
  tryReferenceExpression,
  tryVariableReference,
  tryAddExpressionWithContext,
  tryBracedExpression,
  tryArrayIndexing,
  tryArrayLiteral,
  trySliceFieldAccess,
} from "./compilation/compilation-strategies";

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<X>(error: X): Err<X> {
  return { ok: false, error };
}

function createCompileFunc(functionContext: FunctionContext): (
  expr: string,
  ctx: VariableContext,
) =>
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  return (expr: string, ctx: VariableContext) =>
    compileWithContext(expr, ctx, functionContext);
}

function parseLetExpression(
  source: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      newContext: VariableContext;
      newFunctionContext: FunctionContext;
    }
  | undefined {
  return parseLetExpressionModule(
    source,
    createCompileFunc(functionContext),
    context,
    functionContext,
  );
}

function tryBasicPatterns(
  trimmed: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  const compileFunc = createCompileFunc(functionContext);

  // Try parsing as reassignment
  const reassignmentResult = tryReassignment(trimmed, context, compileFunc);
  if (reassignmentResult) {
    return { ...reassignmentResult, functionContext };
  }

  // Try parsing as array index reassignment
  const arrayIndexReassignmentResult = tryArrayIndexReassignment(
    trimmed,
    context,
    compileFunc,
  );
  if (arrayIndexReassignmentResult) {
    return { ...arrayIndexReassignmentResult, functionContext };
  }

  // Try parsing as dereference reassignment
  const dereferenceReassignmentResult = tryDereferenceReassignment(
    trimmed,
    context,
    compileFunc,
  );
  if (dereferenceReassignmentResult) {
    return { ...dereferenceReassignmentResult, functionContext };
  }

  // Try parsing as dereference
  const dereferenceResult = tryDereference(trimmed, context);
  if (dereferenceResult) {
    return { ...dereferenceResult, functionContext };
  }

  // Try parsing as reference expression
  const referenceResult = tryReferenceExpression(trimmed, context);
  if (referenceResult) {
    return { ...referenceResult, functionContext };
  }

  // Try parsing as a variable reference
  const varRefResult = tryVariableReference(trimmed, context);
  if (varRefResult) {
    return { ...varRefResult, functionContext };
  }

  return undefined;
}

function tryArrayHandlers(
  trimmed: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  const compileFunc = createCompileFunc(functionContext);

  // Try parsing as slice field access (e.g., slice.init)
  const sliceFieldResult = trySliceFieldAccess(trimmed, context);
  if (sliceFieldResult) {
    return { ...sliceFieldResult, functionContext };
  }

  // Try parsing as array indexing
  const arrayIndexResult = tryArrayIndexing(trimmed, context, compileFunc);
  if (arrayIndexResult) {
    return { ...arrayIndexResult, functionContext };
  }

  // Try parsing as array literal
  const arrayLiteralResult = tryArrayLiteral(trimmed, context, compileFunc);
  if (arrayLiteralResult) {
    return { ...arrayLiteralResult, functionContext };
  }

  return undefined;
}

function tryFunctionOrLetPatterns(
  trimmed: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  // Try parsing as function call
  const funcCallResult = tryFunctionCall(
    trimmed,
    functionContext,
    createCompileFunc(functionContext),
  );
  if (funcCallResult) {
    return {
      instructions: funcCallResult.instructions,
      context,
      functionContext,
    };
  }

  // Try parsing as let expression
  const letResult = parseLetExpression(trimmed, context, functionContext);
  if (letResult) {
    return compileRemainingAfterLet(trimmed, letResult);
  }
  return undefined;
}

function skipFirstLetBinding(source: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith("let")) return "";

  const comp = parseLetComponents(trimmed);
  if (!comp) return "";

  return comp.remaining;
}

function compileRemainingAfterLet(
  trimmed: string,
  letResult: NonNullable<ReturnType<typeof parseLetExpression>>,
): {
  instructions: Instruction[];
  context: VariableContext;
  functionContext: FunctionContext;
} {
  let finalInstructions = letResult.instructions;
  let finalContext = letResult.newContext;
  let finalFunctionContext = letResult.newFunctionContext;

  const remaining = skipFirstLetBinding(trimmed);
  if (remaining.trim().length > 0) {
    const remainingResult = compileWithContext(
      remaining,
      finalContext,
      finalFunctionContext,
    );
    if (remainingResult) {
      finalInstructions = [
        ...finalInstructions,
        ...remainingResult.instructions,
      ];
      finalContext = remainingResult.context;
      finalFunctionContext = remainingResult.functionContext;
    }
  }

  return {
    instructions: finalInstructions,
    context: finalContext,
    functionContext: finalFunctionContext,
  };
}

function tryAllPatterns(
  trimmed: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  // Try function or let patterns first
  let result = tryFunctionOrLetPatterns(trimmed, context, functionContext);
  if (result) {
    return result;
  }

  // Try basic patterns
  result = tryBasicPatterns(trimmed, context, functionContext);
  if (result) {
    return result;
  }

  // Try parsing as an addition expression with context
  const addExprResult = tryAddExpressionWithContext(trimmed, context);
  if (addExprResult) {
    return { ...addExprResult, functionContext };
  }

  // Try array handlers
  result = tryArrayHandlers(trimmed, context, functionContext);
  if (result) {
    return result;
  }

  // Unwrap braces if present and try parsing the inner content with context
  const bracedResult = tryBracedExpression(
    trimmed,
    context,
    createCompileFunc(functionContext),
  );
  if (bracedResult) {
    return { ...bracedResult, functionContext };
  }

  // Fall back to regular parsing (which doesn't have context support yet)
  const compileResult = compileNoContext(trimmed);
  if (compileResult) {
    return { instructions: compileResult, context, functionContext };
  }

  return undefined;
}

function compileWithContext(
  source: string,
  context: VariableContext,
  functionContext: FunctionContext,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  const trimmed = source.trim();

  if (!trimmed) {
    return { instructions: [], context, functionContext };
  }

  return tryAllPatterns(trimmed, context, functionContext);
}

function performValidationChecks(trimmed: string): CompileError | undefined {
  const negError = checkNegativeUnsignedError(trimmed);
  if (negError) return negError;
  const overflowError = checkTypeOverflow(trimmed);
  if (overflowError) return overflowError;
  const shadowError = detectVariableShadowing(trimmed);
  if (shadowError) return shadowError;
  const comparisonError = detectComparisonTypeMismatch(trimmed);
  if (comparisonError) return comparisonError;
  const ifConditionError = detectInvalidIfCondition(trimmed);
  if (ifConditionError) return ifConditionError;
  const typeError = detectTypeIncompatibility(trimmed);
  if (typeError) return typeError;
  const branchError = detectIfBranchTypeMismatch(trimmed);
  if (branchError) return branchError;
  const pointerError = detectPointerTypeErrors(trimmed);
  if (pointerError) return pointerError;
  const preContext = buildContextFromLetBindings(trimmed);
  const mutabilityError = detectNonMutableReassignment(trimmed, preContext);
  if (mutabilityError) return mutabilityError;
  const typeChangeError = detectReassignmentTypeChange(trimmed, preContext);
  if (typeChangeError) return typeChangeError;
  const dereferenceReassignmentError =
    detectDereferenceReassignmentOnImmutablePointer(trimmed, preContext);
  if (dereferenceReassignmentError) return dereferenceReassignmentError;
  const arrayIndexReassignmentError =
    detectArrayIndexReassignmentOnImmutableArray(trimmed, preContext);
  if (arrayIndexReassignmentError) return arrayIndexReassignmentError;
  const outOfOrderArrayError = detectOutOfOrderArrayAssignment(
    trimmed,
    preContext,
  );
  if (outOfOrderArrayError) return outOfOrderArrayError;
  const declarationOnlyError = detectMultipleReassignmentsToDeclarationOnly(
    trimmed,
    preContext,
  );
  if (declarationOnlyError) return declarationOnlyError;
  const uninitializedError = detectUninitializedDeclarationOnly(
    trimmed,
    preContext,
  );
  if (uninitializedError) return uninitializedError;
  return undefined;
}

export function compile(source: string): Result<Instruction[], CompileError> {
  const trimmed = source.trim();
  if (!trimmed) {
    return ok([]);
  }
  if (isParenthesizedExpression(trimmed)) {
    return compile(extractParenthesizedContent(trimmed));
  }
  if (isBracedExpression(trimmed)) {
    return compile(extractBracedContent(trimmed));
  }
  const validationError = performValidationChecks(trimmed);
  if (validationError) {
    return err(validationError);
  }
  const functionContext = extractFunctionDefinitions(trimmed);
  const remainingAfterFunctions = getRemainningAfterFunctions(trimmed);
  const result = compileWithContext(
    remainingAfterFunctions,
    [],
    functionContext,
  );
  return result ? ok(result.instructions) : ok([]);
}

export function executeWithArray(
  instructions: Instruction[],
  stdIn: number[],
): number {
  return execute(
    instructions,
    () => {
      // Read from stdIn
      return stdIn.shift() ?? 0;
    },
    (value: number) => {
      // Write to stdouts
      console.log("Output:", value);
    },
  );
}

export function executeWithArrayToDump(
  instructions: Instruction[],
  stdIn: number[],
): [number, Dump] {
  const dump: Dump = { cycles: [] };
  const returnValue = execute(
    instructions,
    () => {
      // Read from stdIn
      return stdIn.shift() ?? 0;
    },
    (value: number) => {
      // Write to stdouts
      console.log("Output:", value);
    },
    (state: ExecutionState, instruction: Instruction) => {
      // Dumper function to capture state before each instruction
      dump.cycles.push({
        beforeInstructionExecuted: { ...state },
        instructionToExecute: instruction,
      });
    },
  );
  return [returnValue, dump];
}
