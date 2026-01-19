import { run } from "../src/app";

describe("The application", () => {
  test("should run the simplest program possible", () => {
    expect(run("", [])).toStrictEqual([[], 0]);
  });
});
