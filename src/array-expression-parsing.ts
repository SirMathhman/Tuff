import { type Instruction } from "./vm";
import { parseArrayLiteral, isArrayLiteral } from "./array-parsing";
import { buildArrayStoreInstructions } from "./array-compilation";
import { buildLoadDirect, buildStoreAndHalt } from "./instruction-primitives";

export function _compileArrayLiteral(
  source: string,
  arrayBaseAddress: number,
): { instructions: Instruction[] | undefined } {
  if (!isArrayLiteral(source)) {
    return { instructions: undefined };
  }

  const arrayLit = parseArrayLiteral(source);
  if (!arrayLit) {
    return { instructions: undefined };
  }

  const instructions: Instruction[] = [];

  // Compile each element and store to array
  for (let i = 0; i < arrayLit.elements.length; i++) {
    const elem = arrayLit.elements[i];
    if (!elem) continue;

    // For now, support simple literals and variables
    // Would need to integrate with expression compiler for complex expressions
    if (
      elem === "read U8" ||
      elem === "read U16" ||
      elem === "read I8" ||
      elem === "read I16" ||
      elem === "read Bool"
    ) {
      // Compile read into temp location
      const readInstructions = compileRead();
      const storeInstr = buildArrayStoreInstructions(
        readInstructions,
        i,
        arrayBaseAddress,
      );
      instructions.push(...storeInstr);
    }
  }

  // Load array base address to r1 and return it
  instructions.push(buildLoadDirect(1, arrayBaseAddress));
  instructions.push(...buildStoreAndHalt());

  return { instructions };
}

function compileRead(): Instruction[] {
  return [
    {
      opcode: 12, // OpCode.In
      variant: 0, // Variant.Immediate
      operand1: 0,
    },
    {
      opcode: 1, // OpCode.Store
      variant: 0, // Variant.Direct
      operand1: 0,
      operand2: 900,
    },
    {
      opcode: 24, // OpCode.Halt
      variant: 0, // Variant.Direct
      operand1: 900,
    },
  ];
}
