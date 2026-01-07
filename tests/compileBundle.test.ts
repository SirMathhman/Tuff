import vm from "node:vm";

import { compileBundle, Namespace } from "../src/run";

function evalBundledExpression(expr: string): unknown {
  return vm.runInNewContext(expr, {}, { timeout: 1000 });
}

interface FixtureIds {
  providerId: string;
  userId: string;
  providerNs: string[];
  userNs: string[];
}

interface FixtureSources {
  providerSrc: string;
  userSrc: string;
}

function getFixtureIds(): FixtureIds {
  return {
    providerId: "(in-memory)",
    userId: "(in-memory)",
    providerNs: ["tuff", "stuff"],
    userNs: ["tuff", "stuff", "user"],
  };
}

function readFixtureSources(): FixtureSources {
  // Unit tests must not depend on the filesystem.
  return {
    providerSrc: "out fn getMyValue() => 100;\n",
    userSrc: "from tuff::stuff use { getMyValue };\n\ngetMyValue()\n",
  };
}

function makeFilesMap(
  entries: Array<[Namespace, string]>
): Map<Namespace, string> {
  return new Map<Namespace, string>(entries as Array<[Namespace, string]>);
}

describe("compileBundle", () => {
  test("bundles modules/provider+user and evaluates entry", () => {
    const { providerNs, userNs } = getFixtureIds();
    const { providerSrc, userSrc } = readFixtureSources();
    const files = makeFilesMap([
      [providerNs, providerSrc],
      [userNs, userSrc],
    ]);

    const bundledExpr = compileBundle(files, userNs);
    expect(typeof bundledExpr).toBe("string");

    const result = evalBundledExpression(bundledExpr);
    expect(result).toBe(100);
  });

  test("is deterministic regardless of object insertion order", () => {
    const { providerNs, userNs } = getFixtureIds();
    const { providerSrc, userSrc } = readFixtureSources();

    const filesA = makeFilesMap([
      [providerNs, providerSrc],
      [userNs, userSrc],
    ]);
    const filesB = makeFilesMap([
      [userNs, userSrc],
      [providerNs, providerSrc],
    ]);

    const a = compileBundle(filesA, userNs);
    const b = compileBundle(filesB, userNs);
    expect(a).toBe(b);
  });

  test("throws when an imported provider module is missing", () => {
    const { userNs } = getFixtureIds();
    const { userSrc } = readFixtureSources();
    const files = makeFilesMap([[userNs, userSrc]]);

    expect(() => compileBundle(files, userNs)).toThrow(/provider\.tuff/i);
  });
});
