import { execute, Instruction, Operation, Variant } from "./execute";

function compile(source: string): Instruction[] {
  // TODO: real implementation
  // For now, always return a program that halts immediately.
  // This keeps the VM from running forever while the compiler is unimplemented.
  return [
    {
      operation: Operation.Halt,
      variant: Variant.Constant,
      firstOperand: 0,
    },
  ];
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
