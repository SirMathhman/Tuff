import { execute, type Instruction, OpCode, Variant } from "./vm";
import {
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
  isDereferenceOperator,
  extractDereferenceTarget,
  isReferenceOperator,
  extractReferenceTarget,
  isMutableReference,
  isArrayIndexing,
  extractArrayIndexComponents,
} from "./parser";
import {
  type CompileError,
  checkTypeOverflow,
  checkNegativeUnsignedError,
} from "./types";
import {
  type VariableContext,
} from "./variable-types";
import {
  resolveVariable,
  buildVarRefInstructions,
  buildReferenceAddressInstructions,
  isVariableMutable,
  buildContextFromLetBindings,
} from "./let-binding";
import {
  parseReassignmentComponents,
  buildReassignmentInstructions,
  parseDereferenceReassignmentComponents,
  buildDereferenceReassignmentInstructions,
  buildDereferenceInstructions,
} from "./reassignment-parsing";
import { parseAddExpressionWithContext } from "./expression-with-context";
import { isArrayLiteral, parseArrayLiteral } from "./array-parsing";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";
import { parseLetExpression as parseLetExpressionModule } from "./let-expression-parsing";
import {
  detectVariableShadowing,
  detectTypeIncompatibility,
  detectComparisonTypeMismatch,
  detectInvalidIfCondition,
  detectIfBranchTypeMismatch,
} from "./validation";
import {
  detectNonMutableReassignment,
  detectReassignmentTypeChange,
  detectDereferenceReassignmentOnImmutablePointer,
  detectMultipleReassignmentsToDeclarationOnly,
  detectUninitializedDeclarationOnly,
} from "./reassignment-validation";
import { detectPointerTypeErrors } from "./pointer-validation";
import { compileNoContext } from "./arithmetic-parsing";

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

function parseLetExpression(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  return parseLetExpressionModule(source, compileWithContext, context);
}

function tryReassignment(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const comp = parseReassignmentComponents(source);
  if (!comp) return undefined;

  const addr = resolveVariable(context, comp.varName);
  if (addr === undefined) return undefined;

  if (!isVariableMutable(context, comp.varName)) return undefined;

  const res = compileWithContext(comp.exprPart, context);
  if (!res) return undefined;

  const instr = buildReassignmentInstructions(res.instructions, addr);

  if (comp.remaining.length === 0) {
    return {
      instructions: [...instr, ...buildVarRefInstructions(addr)],
      context,
    };
  }

  const remRes = compileWithContext(comp.remaining, context);
  return remRes
    ? {
        instructions: [...instr, ...remRes.instructions],
        context: remRes.context,
      }
    : undefined;
}

function tryDereferenceReassignment(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const comp = parseDereferenceReassignmentComponents(source);
  if (!comp) return undefined;

  const pointerAddr = resolveVariable(context, comp.pointerName);
  if (pointerAddr === undefined) return undefined;

  const res = compileWithContext(comp.exprPart, context);
  if (!res) return undefined;

  const instr = buildDereferenceReassignmentInstructions(
    res.instructions,
    pointerAddr,
  );

  if (comp.remaining.length === 0) {
    return {
      instructions: [...instr, ...buildVarRefInstructions(pointerAddr)],
      context,
    };
  }

  const remRes = compileWithContext(comp.remaining, context);
  return remRes
    ? {
        instructions: [...instr, ...remRes.instructions],
        context: remRes.context,
      }
    : undefined;
}

function tryDereference(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isDereferenceOperator(trimmed)) return undefined;
  const target = extractDereferenceTarget(trimmed);
  const varAddress = resolveVariable(context, target);
  if (varAddress === undefined) return undefined;
  return {
    instructions: buildDereferenceInstructions(varAddress),
    context,
  };
}

function tryReferenceExpression(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isReferenceOperator(trimmed)) return undefined;
  const varName = extractReferenceTarget(trimmed);
  const varAddress = resolveVariable(context, varName);
  if (varAddress === undefined) return undefined;
  // For mutable references (&mut x), load the address as an immediate
  // For immutable references (&x), load the value from the variable
  const isMut = isMutableReference(trimmed);
  const instructions = isMut
    ? buildReferenceAddressInstructions(varAddress)
    : buildVarRefInstructions(varAddress);
  return {
    instructions,
    context,
  };
}

function tryVariableReference(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const varAddress = resolveVariable(context, trimmed);
  if (varAddress === undefined) return undefined;

  // Check if this is an array variable - if so, return the address, not the value
  const binding = context.find((b) => b.name === trimmed);
  const isArray = binding && binding.type && binding.type.startsWith("[");

  const instructions = isArray
    ? buildReferenceAddressInstructions(varAddress) // Return address for arrays
    : buildVarRefInstructions(varAddress); // Load value for non-arrays

  return {
    instructions,
    context,
  };
}

function tryAddExpressionWithContext(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const addExprWithContext = parseAddExpressionWithContext(trimmed, context);
  if (!addExprWithContext) return undefined;
  return {
    instructions: addExprWithContext,
    context,
  };
}

function tryBracedExpression(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isBracedExpression(trimmed)) return undefined;
  const innerExpr = extractBracedContent(trimmed);
  return compileWithContext(innerExpr, context);
}

function tryArrayIndexing(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isArrayIndexing(trimmed)) return undefined;

  const comp = extractArrayIndexComponents(trimmed);
  if (!comp) return undefined;

  const arrayAddr = resolveVariable(context, comp.arrayName);
  if (arrayAddr === undefined) return undefined;

  // Compile the index expression
  const indexResult = compileWithContext(comp.indexExpr, context);
  if (!indexResult) return undefined;

  // Strategy:
  // 1. Compile index expression → result in memory[900]
  // 2. Load array base address into r0
  // 3. Load index from memory[900] into r1
  // 4. Add r0 + r1 → r0 (calculate target address)
  // 5. Store r0 to temp location (memory[902])
  // 6. Load indirectly from memory[902] into r1
  // 7. Store r1 to memory[900] and halt
  const instructions: Instruction[] = [
    ...indexResult.instructions.slice(0, -1), // Remove halt, index in memory[900]
    buildLoadImmediate(0, arrayAddr), // Load array base address into r0
    buildLoadDirect(1, 900), // Load index into r1
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 1, // r0 = r0 + r1 (array base + index)
    },
    buildStoreDirect(0, 902), // Store target address to memory[902]
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 1,
      operand2: 902, // Load value from address stored in memory[902]
    },
    ...buildStoreAndHalt(),
  ];

  return {
    instructions,
    context,
  };
}

function tryArrayLiteral(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isArrayLiteral(trimmed)) return undefined;

  const arrayLit = parseArrayLiteral(trimmed);
  if (!arrayLit || arrayLit.elements.length === 0) return undefined;

  // Calculate the starting address for array elements (same as variable address)
  let elementsAddr = 904;
  for (let i = 0; i < context.length; i++) {
    elementsAddr += 1;
  }

  // Compile each element
  let instructions: Instruction[] = [];

  for (let i = 0; i < arrayLit.elements.length; i++) {
    const element = arrayLit.elements[i];
    if (!element) return undefined;
    const elemResult = compileWithContext(element, context);
    if (!elemResult) return undefined;

    const elemInstructions = elemResult.instructions.slice(0, -1); // Remove halt
    instructions = [
      ...instructions,
      ...elemInstructions,
      buildLoadDirect(1, 900),
      buildStoreDirect(1, elementsAddr + i),
    ];
  }

  // Return the base address of the array elements (same as variable address)
  instructions.push(buildLoadImmediate(1, elementsAddr));
  instructions.push(...buildStoreAndHalt());

  return {
    instructions,
    context,
  };
}

function tryBasicPatterns(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  // Try parsing as reassignment (e.g., "x = read I32;")
  const reassignmentResult = tryReassignment(trimmed, context);
  if (reassignmentResult) {
    return reassignmentResult;
  }

  // Try parsing as dereference reassignment (e.g., "*y = value;")
  const dereferenceReassignmentResult = tryDereferenceReassignment(
    trimmed,
    context,
  );
  if (dereferenceReassignmentResult) {
    return dereferenceReassignmentResult;
  }

  // Try parsing as dereference (e.g., "*y")
  const dereferenceResult = tryDereference(trimmed, context);
  if (dereferenceResult) {
    return dereferenceResult;
  }

  // Try parsing as reference expression (e.g., "&x")
  const referenceResult = tryReferenceExpression(trimmed, context);
  if (referenceResult) {
    return referenceResult;
  }

  // Try parsing as a variable reference
  const varRefResult = tryVariableReference(trimmed, context);
  if (varRefResult) {
    return varRefResult;
  }

  return undefined;
}

function tryArrayHandlers(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  // Try parsing as array indexing (e.g., "array[0]")
  const arrayIndexResult = tryArrayIndexing(trimmed, context);
  if (arrayIndexResult) {
    return arrayIndexResult;
  }

  // Try parsing as array literal (e.g., "[1, 2, 3]")
  const arrayLiteralResult = tryArrayLiteral(trimmed, context);
  if (arrayLiteralResult) {
    return arrayLiteralResult;
  }

  return undefined;
}

function tryAllPatterns(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  // Try parsing as let expression
  const letResult = parseLetExpression(trimmed, context);
  if (letResult) {
    return {
      instructions: letResult.instructions,
      context: letResult.newContext,
    };
  }

  // Try basic patterns
  const basicResult = tryBasicPatterns(trimmed, context);
  if (basicResult) {
    return basicResult;
  }

  // Try parsing as an addition expression with context (for variables)
  const addExprResult = tryAddExpressionWithContext(trimmed, context);
  if (addExprResult) {
    return addExprResult;
  }

  // Try array handlers
  const arrayResult = tryArrayHandlers(trimmed, context);
  if (arrayResult) {
    return arrayResult;
  }

  // Unwrap braces if present and try parsing the inner content with context
  const bracedResult = tryBracedExpression(trimmed, context);
  if (bracedResult) {
    return bracedResult;
  }

  // Fall back to regular parsing (which doesn't have context support yet)
  const result = compileNoContext(trimmed);
  if (result) {
    return { instructions: result, context };
  }

  return undefined;
}

function compileWithContext(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const trimmed = source.trim();

  if (!trimmed) {
    return { instructions: [], context };
  }

  return tryAllPatterns(trimmed, context);
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
  const result = compileWithContext(trimmed, []);
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
