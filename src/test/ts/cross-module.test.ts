import { test } from "bun:test";
import { expectValidWithModules } from "./test-helpers";

test("cross-module access via out let", () => {
  expectValidWithModules(
    ["index"],
    { ["index"]: "lib.foo", ["lib"]: "out let foo = 100;" },
    [],
    100,
  );
});

test("cross-module access via nested module path", () => {
  expectValidWithModules(
    ["index"],
    { ["index"]: "lib::wah.foo", ["lib.wah"]: "out let foo = 100;" },
    [],
    100,
  );
});
