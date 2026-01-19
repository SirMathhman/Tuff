import { run } from "../src/app";

describe("The application", () => {
  testSimplest("should run the simplest program possible", "", 0);
  testSimplest("should run with an int", "0", 0);
});

function testSimplest(message: string, source: string, exitCode: number) {
  test(message, () => {
    expect(run(source, [])).toStrictEqual([[], exitCode]);
  });
}
