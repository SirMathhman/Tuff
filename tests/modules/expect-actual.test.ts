import { expect, test } from "bun:test";
import { interpretModuleSets } from "../../modules";

const expectLib =
  "expect fn platformDependentFunction() : I32;\n    out let computedValue = platformDependentFunction();";
const actualLib = "actual fn platformDependentFunction() : I32 => 100;";
const mainSource = "let { computedValue } = lib; computedValue";

/**
 * Builds the core set, which holds main and the given lib.
 *
 * @param lib - The lib module's source in the core set.
 * @returns The core set's module sources.
 */
function coreSet(lib: string): ReadonlyMap<string, string> {
  return new Map([
    ["main", mainSource],
    ["lib", lib],
  ]);
}

test('interpretModuleSets("core", ["main"]) links an expect lib to an actual lib in another set => 100', () => {
  const sets = new Map([
    ["core", coreSet(expectLib)],
    ["other", new Map([["lib", actualLib]])],
  ]);
  expect(interpretModuleSets("core", ["main"], sets)).toEqual({ ok: true, value: 100 });
});

test("an actual fn whose signature differs from the expect fn is an error", () => {
  const sets = new Map([
    ["core", coreSet(expectLib)],
    ["other", new Map([["lib", "actual fn platformDependentFunction() : Bool => true;"]])],
  ]);
  const result = interpretModuleSets("core", ["main"], sets);
  expect(result.ok).toBe(false);
});

test("an expect fn with no actual is an error", () => {
  const sets = new Map([
    ["core", coreSet(expectLib)],
    ["other", new Map([["unrelated", "1"]])],
  ]);
  const result = interpretModuleSets("core", ["main"], sets);
  expect(result.ok).toBe(false);
});

test("a module that is both expect and actual is an error", () => {
  const sets = new Map([
    ["core", coreSet(`${expectLib}\n${actualLib}`)],
    ["other", new Map([["lib", actualLib]])],
  ]);
  const result = interpretModuleSets("core", ["main"], sets);
  expect(result.ok).toBe(false);
});
