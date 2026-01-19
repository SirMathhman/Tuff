import { run } from "../src/app";
import { execute, Operation, Variant, type Instruction } from "../src/execute";

describe("The application", () => {
  testSimplest("should run the simplest program possible", "", 0);
  testSimplest("should run with an int", "0", 0);
});

describe("The VM", () => {
  test("should not run forever if program never halts", () => {
    const program: Instruction[] = [
      {
        operation: Operation.Jump,
        variant: Variant.Constant,
        firstOperand: 0,
        secondOperand: 0,
      },
    ];

    expect(() =>
      execute(
        program,
        () => 0,
        () => {},
        { maxSteps: 25 },
      ),
    ).toThrow(/did not halt/i);
  });
});

function testSimplest(message: string, source: string, exitCode: number) {
  test(message, () => {
    expect(run(source, [])).toStrictEqual([[], exitCode]);
  });
}
