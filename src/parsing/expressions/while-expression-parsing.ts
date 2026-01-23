import { type Instruction, OpCode, Variant } from "../../core/vm";
import { type VariableContext } from "../../types/variable-types";
import { type FunctionContext } from "../../types/function-types";
import { findConditionParentheses } from "../../parsing/parser";

type CompileFunc = (
  expr: string,
  ctx: VariableContext,
) =>
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined;

export interface WhileExpression {
  condition: string;
  body: string;
  remaining: string;
}

function isWhileKeywordAt(source: string, index: number): boolean {
  if (source.substring(index, index + 5) !== "while") return false;
  if (index > 0) {
    const beforeChar = source[index - 1];
    const isWordBoundary =
      !beforeChar || beforeChar === " " || beforeChar === "\t";
    if (!isWordBoundary) return false;
  }
  return true;
}

function findWhileKeywordStart(source: string): number {
  for (let i = 0; i < source.length; i++) {
    if (isWhileKeywordAt(source, i)) {
      return i;
    }
  }
  return -1;
}

export function isWhileExpression(source: string): boolean {
  const trimmed = source.trim();
  return findWhileKeywordStart(trimmed) !== -1;
}

function findMatchingBrace(afterParens: string): number {
  let braceDepth = 1;
  for (let i = 1; i < afterParens.length; i++) {
    if (afterParens[i] === "{") braceDepth++;
    if (afterParens[i] === "}") braceDepth--;
    if (braceDepth === 0) return i;
  }
  return -1;
}

function parseBracedBody(
  afterParens: string,
  condition: string,
): WhileExpression | undefined {
  const braceEnd = findMatchingBrace(afterParens);
  if (braceEnd === -1) return undefined;

  const body = afterParens.substring(1, braceEnd).trim();
  let remaining = afterParens.substring(braceEnd + 1).trim();
  if (remaining.startsWith(";")) {
    remaining = remaining.substring(1).trim();
  }

  return { condition, body, remaining };
}

export function parseWhileExpression(
  source: string,
): WhileExpression | undefined {
  const trimmed = source.trim();
  
  // Only match if the source STARTS with "while"
  if (!trimmed.startsWith("while")) return undefined;
  
  const whileStart = 0; // We know it starts with "while"

  const afterWhile = trimmed.substring(whileStart + 5);
  const parens = findConditionParentheses(afterWhile, 0);
  if (!parens) return undefined;

  const condition = afterWhile.substring(parens.start + 1, parens.end).trim();
  const afterParens = afterWhile.substring(parens.end + 1).trim();

  // Check if body is braced
  if (afterParens.startsWith("{")) {
    return parseBracedBody(afterParens, condition);
  }

  // Body is everything up to the first semicolon
  let semiIndex = -1;
  for (let i = 0; i < afterParens.length; i++) {
    if (afterParens[i] === ";") {
      semiIndex = i;
      break;
    }
  }

  if (semiIndex === -1) return undefined;

  const body = afterParens.substring(0, semiIndex).trim();
  const remaining = afterParens.substring(semiIndex + 1).trim();

  return { condition, body, remaining };
}

export function buildWhileLoopInstructions(
  conditionInstructions: Instruction[],
  bodyInstructions: Instruction[],
): Instruction[] {
  // while (cond) body;
  // Pattern:
  //   [0] condition evaluation (result in memory[900], 0 or 1)
  //   [N] Load condition result, subtract 1 (so 1-1=0, 0-1=-1)
  //   [N+1] Jump if < 0 (i.e., if result was 0/false) to after body
  //   [M] body
  //   [K] jump back to 0
  //   [K+1] (after loop)

  // Remove halt instructions from condition and body
  const condInstr = conditionInstructions.slice(0, -1);
  const bodyInstr = bodyInstructions.slice(0, -1);

  const instructions: Instruction[] = [];

  // [0..N-1] condition evaluation (stores result in memory[900])
  instructions.push(...condInstr);

  // [N] Load condition result (0 or 1) to r0
  instructions.push({
    opcode: OpCode.Load,
    variant: Variant.Direct,
    operand1: 0,
    operand2: 900,
  });

  // [N+1] Subtract 1 from r0: r0 = r0 - r1 where r1=1
  // Load 1 into r1 first
  instructions.push({
    opcode: OpCode.Load,
    variant: Variant.Immediate,
    operand1: 1,
    operand2: 1,
  });

  // Subtract: r0 -= r1 (so 1-1=0 for true, 0-1=-1 for false)
  instructions.push({
    opcode: OpCode.Sub,
    variant: Variant.Immediate,
    operand1: 0,
    operand2: 1,
  });

  // [N+3] Jump if result is negative (i.e., condition was false) to after body
  const jumpIdx = instructions.length;
  const bodyStartIdx = jumpIdx + 1;
  const bodyEndIdx = bodyStartIdx + bodyInstr.length;
  const afterLoopIdx = bodyEndIdx + 1; // After the body AND the jump-back instruction

  instructions.push({
    opcode: OpCode.JumpIfLessThanZero,
    variant: Variant.Immediate,
    operand1: afterLoopIdx,
  });

  // [N+4..N+4+len(body)-1] body
  instructions.push(...bodyInstr);

  // [bodyEndIdx] Jump back to start of condition (instruction 0 of this loop's instructions)
  instructions.push({
    opcode: OpCode.Jump,
    variant: Variant.Immediate,
    operand1: 0, // Jump to the first instruction in this instructions array
  });

  return instructions;
}

export function compileWhileExpression(
  source: string,
  context: VariableContext,
  functionContext: FunctionContext,
  compileFunc: CompileFunc,
):
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: FunctionContext;
    }
  | undefined {
  const whileExpr = parseWhileExpression(source);
  if (!whileExpr) return undefined;

  const conditionResult = compileFunc(whileExpr.condition, context);
  if (!conditionResult) return undefined;

  const bodyResult = compileFunc(whileExpr.body, context);
  if (!bodyResult) return undefined;

  const loopInstructions = buildWhileLoopInstructions(
    conditionResult.instructions,
    bodyResult.instructions,
  );

  let remainingInstructions: Instruction[] = [];
  if (whileExpr.remaining.length > 0) {
    const remainingResult = compileFunc(
      whileExpr.remaining,
      bodyResult.context,
    );
    if (remainingResult) {
      remainingInstructions = remainingResult.instructions;
    }
  }

  return {
    instructions: [...loopInstructions, ...remainingInstructions],
    context: bodyResult.context,
    functionContext: bodyResult.functionContext,
  };
}

// Helper function to adjust while loop jump addresses after instructions are combined
export function adjustWhileLoopJumpAddress(
  instructions: Instruction[],
  loopStartOffset: number,
): Instruction[] {
  // Two jumps need adjustment:
  // 1. JumpIfLessThanZero: jumps to after the loop when condition is false
  // 2. Jump: jumps back to the start of the loop
  
  const adjusted = [...instructions];
  
  // Find and adjust both jumps
  for (let i = 0; i < adjusted.length; i++) {
    const inst = adjusted[i];
    
    if (inst && inst.opcode === OpCode.JumpIfLessThanZero) {
      // Adjust the forward jump (condition false → skip loop)
      // The operand1 is relative to loop start, make it absolute
      adjusted[i] = {
        ...inst,
        operand1: loopStartOffset + (inst.operand1 || 0),
      };
    } else if (inst && inst.opcode === OpCode.Jump && inst.operand1 === 0) {
      // Adjust the backward jump (loop back to start)
      adjusted[i] = {
        ...inst,
        operand1: loopStartOffset,
      };
    }
  }
  
  return adjusted;
}

