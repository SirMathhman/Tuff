const assert = require("assert").strict;
const { interpret: interpretFn } = require("../src/interpret");

describe("interpret", function () {
  it("throws a stub error", function () {
    try {
      interpretFn("hello");
      throw new Error("expected interpret to throw");
    } catch (err) {
      assert(err instanceof Error);
      assert.equal((err as Error).message, "interpret: stub not implemented");
    }
  });
});

module.exports = {};
