import { execute, Instruction, Operation, Variant } from "./execute";

function compile(source: string): Instruction[] {
  // TODO: real implementation
  // For empty programs, add a halt instruction
  if (!source || source.trim() === "") {
    return [
      {
        operation: Operation.Halt,
        variant: Variant.Constant,
        firstOperand: 0,
      },
    ];
  }
  return [];
}

export function run(source: string, input: number[]): [number[], number] {
  const instructions = compile(source);
  let inputPointer = 0;
  let output: number[] = [];
  let returnValue = execute(
    instructions,
    () => {
      const value = input[inputPointer];
      inputPointer++;
      return value;
    },
    (outputValue: number) => {
      output.push(outputValue);
    },
  );
  return [output, returnValue];
}
