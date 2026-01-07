import fs from "fs";
import path from "path";
import vm from "node:vm";

import { compileBundle, Namespace } from "../src/run";

function evalBundledExpression(expr: string): unknown {
  return vm.runInNewContext(expr, {}, { timeout: 1000 });
}

interface FixturePaths {
  providerPath: string;
  userPath: string;
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

function getFixturePaths(): FixturePaths {
  const providerPath = path.join(
    __dirname,
    "..",
    "self_hosting",
    "modules",
    "tuff",
    "stuff",
    "provider.tuff"
  );
  const userPath = path.join(
    __dirname,
    "..",
    "self_hosting",
    "modules",
    "tuff",
    "stuff",
    "user.tuff"
  );
  return { providerPath, userPath };
}

function getFixtureIds(): FixtureIds {
  return {
    providerId: "self_hosting/modules/tuff/stuff/provider.tuff",
    userId: "self_hosting/modules/tuff/stuff/user.tuff",
    providerNs: ["tuff", "stuff"],
    userNs: ["tuff", "stuff", "user"],
  };
}

function readFixtureSources(): FixtureSources {
  const { providerPath, userPath } = getFixturePaths();
  return {
    providerSrc: fs.readFileSync(providerPath, "utf8"),
    userSrc: fs.readFileSync(userPath, "utf8"),
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
