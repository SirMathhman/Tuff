import { type Instruction, OpCode, Variant } from "./vm";
import { findMatchingParen } from "./parser";

function skipWhitespace(source: string, start: number): number {
  let i = start;
  while (i < source.length && (source[i] === " " || source[i] === "\t")) {
    i++;
  }
  return i;
}

function findElseKeyword(source: string, start: number): number {
  for (let j = start; j < source.length - 3; j++) {
    if (source.substring(j, j + 4) !== "else") continue;
    const nextChar = source[j + 4];
    if (nextChar === " " || nextChar === "\t" || nextChar === undefined) {
      return j;
    }
  }
  return -1;
}

function parseIfComponents(
  source: string,
): { condition: string; thenExpr: string; elseExpr: string } | undefined {
  if (!source.startsWith("if")) return undefined;

  let i = skipWhitespace(source, 2);
  if (i >= source.length || source[i] !== "(") return undefined;

  const condEnd = findMatchingParen(source, i);
  if (condEnd === -1) return undefined;

  const condition = source.substring(i + 1, condEnd).trim();

  i = skipWhitespace(source, condEnd + 1);

  const elseStart = findElseKeyword(source, i);

  if (elseStart === -1) return undefined;

  const thenExpr = source.substring(i, elseStart).trim();
  const elseExpr = source.substring(elseStart + 4).trim();

  return { condition, thenExpr, elseExpr };
}

export function parseIfExpression(
  source: string,
  compileExpr: (expr: string) => Instruction[] | undefined,
): Instruction[] | undefined {
  const components = parseIfComponents(source);
  if (!components) return undefined;

  const condInstr = compileExpr(components.condition);
  if (!condInstr) return undefined;

  const thenInstr = compileExpr(components.thenExpr);
  if (!thenInstr) return undefined;

  const elseInstr = compileExpr(components.elseExpr);
  if (!elseInstr) return undefined;

  return buildConditional(condInstr, thenInstr, elseInstr);
}

function buildConditional(
  cond: Instruction[],
  thenBranch: Instruction[],
  elseBranch: Instruction[],
): Instruction[] {
  return [
    ...cond.slice(0, -1),
    ...storeBranchResults(thenBranch, elseBranch),
    ...selectResult(),
  ];
}

function loadAndStore(targetAddress: number): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 900,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: targetAddress,
    },
  ];
}

function storeBranchResults(
  thenBranch: Instruction[],
  elseBranch: Instruction[],
): Instruction[] {
  return [
    ...loadAndStore(910),
    ...thenBranch.slice(0, -1),
    ...loadAndStore(911),
    ...elseBranch.slice(0, -1),
    ...loadAndStore(912),
  ];
}

function computeThenPart(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 910,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 2,
      operand2: 911,
    },
    {
      opcode: OpCode.Mul,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 2,
    },
  ];
}

function computeElsePart(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: 3,
      operand2: 1,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 2,
      operand2: 910,
    },
    {
      opcode: OpCode.Sub,
      variant: Variant.Immediate,
      operand1: 3,
      operand2: 2,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 2,
      operand2: 912,
    },
    {
      opcode: OpCode.Mul,
      variant: Variant.Immediate,
      operand1: 3,
      operand2: 2,
    },
  ];
}

function conditionalSelect(): Instruction[] {
  return [
    ...computeThenPart(),
    ...computeElsePart(),
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 3,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 900,
    },
  ];
}

function selectResult(): Instruction[] {
  return conditionalSelect();
}
