import { type Instruction, OpCode, Variant } from "./vm";
import { type VariableContext } from "./variable-types";
import {
  isDereferenceOperator,
  extractDereferenceTarget,
  isReferenceOperator,
  extractReferenceTarget,
  isMutableReference,
  isArrayIndexing,
  extractArrayIndexComponents,
  isBracedExpression,
  extractBracedContent,
} from "./parser";
import {
  resolveVariable,
  buildVarRefInstructions,
  buildReferenceAddressInstructions,
  isVariableMutable,
} from "./let-binding";
import {
  parseReassignmentComponents,
  buildReassignmentInstructions,
  parseDereferenceReassignmentComponents,
  buildDereferenceReassignmentInstructions,
  buildDereferenceInstructions,
  parseArrayIndexReassignmentComponents,
} from "./reassignment-parsing";
import { parseAddExpressionWithContext } from "./expression-with-context";
import { isArrayLiteral, parseArrayLiteral } from "./array-parsing";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";

type CompileFunc = (
  expr: string,
  ctx: VariableContext,
) => { instructions: Instruction[]; context: VariableContext } | undefined;

export function tryReassignment(
  source: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
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

export function tryDereferenceReassignment(
  source: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
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

export function tryArrayIndexReassignment(
  source: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const comp = parseArrayIndexReassignmentComponents(source);
  if (!comp) return undefined;

  const arrayAddr = resolveVariable(context, comp.arrayName);
  if (arrayAddr === undefined) return undefined;

  if (!isVariableMutable(context, comp.arrayName)) return undefined;

  const res = compileWithContext(comp.exprPart, context);
  if (!res) return undefined;

  const indexRes = compileWithContext(comp.indexExpr, context);
  if (!indexRes) return undefined;

  const instructions: Instruction[] = [
    ...indexRes.instructions.slice(0, -1),
    buildLoadDirect(1, 900),
    buildStoreDirect(1, 902),
    ...res.instructions.slice(0, -1),
    buildLoadDirect(2, 900),
    buildLoadImmediate(0, arrayAddr),
    buildLoadDirect(1, 902),
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 1,
    },
    buildStoreDirect(0, 903),
    {
      opcode: OpCode.Store,
      variant: Variant.Indirect,
      operand1: 2,
      operand2: 903,
    },
  ];

  if (comp.remaining.length === 0) {
    return {
      instructions: [...instructions, ...buildVarRefInstructions(arrayAddr)],
      context,
    };
  }

  const remRes = compileWithContext(comp.remaining, context);
  return remRes
    ? {
        instructions: [...instructions, ...remRes.instructions],
        context: remRes.context,
      }
    : undefined;
}

export function tryDereference(
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

export function tryReferenceExpression(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isReferenceOperator(trimmed)) return undefined;
  const varName = extractReferenceTarget(trimmed);
  const varAddress = resolveVariable(context, varName);
  if (varAddress === undefined) return undefined;
  const isMut = isMutableReference(trimmed);
  const instructions = isMut
    ? buildReferenceAddressInstructions(varAddress)
    : buildVarRefInstructions(varAddress);
  return {
    instructions,
    context,
  };
}

export function tryVariableReference(
  trimmed: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const varAddress = resolveVariable(context, trimmed);
  if (varAddress === undefined) return undefined;

  const binding = context.find((b) => b.name === trimmed);
  const isArray = binding && binding.type && binding.type.startsWith("[");

  const instructions = isArray
    ? buildReferenceAddressInstructions(varAddress)
    : buildVarRefInstructions(varAddress);

  return {
    instructions,
    context,
  };
}

export function tryAddExpressionWithContext(
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

export function tryBracedExpression(
  trimmed: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isBracedExpression(trimmed)) return undefined;
  const innerExpr = extractBracedContent(trimmed);
  return compileWithContext(innerExpr, context);
}

export function tryArrayIndexing(
  trimmed: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isArrayIndexing(trimmed)) return undefined;

  const comp = extractArrayIndexComponents(trimmed);
  if (!comp) return undefined;

  const arrayAddr = resolveVariable(context, comp.arrayName);
  if (arrayAddr === undefined) return undefined;

  const indexResult = compileWithContext(comp.indexExpr, context);
  if (!indexResult) return undefined;

  const instructions: Instruction[] = [
    ...indexResult.instructions.slice(0, -1),
    buildLoadImmediate(0, arrayAddr),
    buildLoadDirect(1, 900),
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 1,
    },
    buildStoreDirect(0, 902),
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 1,
      operand2: 902,
    },
    ...buildStoreAndHalt(),
  ];

  return {
    instructions,
    context,
  };
}

export function tryArrayLiteral(
  trimmed: string,
  context: VariableContext,
  compileWithContext: CompileFunc,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  if (!isArrayLiteral(trimmed)) return undefined;

  const arrayLit = parseArrayLiteral(trimmed);
  if (!arrayLit || arrayLit.elements.length === 0) return undefined;

  let elementsAddr = 904;
  for (let i = 0; i < context.length; i++) {
    elementsAddr += 1;
  }

  let instructions: Instruction[] = [];

  for (let i = 0; i < arrayLit.elements.length; i++) {
    const element = arrayLit.elements[i];
    if (!element) return undefined;
    const elemResult = compileWithContext(element, context);
    if (!elemResult) return undefined;

    const elemInstructions = elemResult.instructions.slice(0, -1);
    instructions = [
      ...instructions,
      ...elemInstructions,
      buildLoadDirect(1, 900),
      buildStoreDirect(1, elementsAddr + i),
    ];
  }

  instructions.push(buildLoadImmediate(1, elementsAddr));
  instructions.push(...buildStoreAndHalt());

  return {
    instructions,
    context,
  };
}
