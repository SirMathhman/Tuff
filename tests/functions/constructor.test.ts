import { describe } from "bun:test";
import { itBoth } from "../test-helpers";
import { addThisReturningFunctionCases } from "../this-return-cases";

describe("constructor pattern", () => {
  addThisReturningFunctionCases(itBoth);
});
