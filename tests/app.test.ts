// Our first compile test, the VM should shut down instantly

import { run } from "../src/app";

describe("VM execute", () => {
  it("should execute a simple program that halts immediately", () => {
    let result = run("");
    if (result.ok) {
      expect(result.value).toBe(0);
    } else {
      throw new Error(`Execution failed: ${result.error}`);
    }
  });
});
