import fs from "fs";
import path from "path";
import vm from "node:vm";

import { compileBundle } from "../src/run";

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
  };
}

function readFixtureSources(): FixtureSources {
  const { providerPath, userPath } = getFixturePaths();
  return {
    providerSrc: fs.readFileSync(providerPath, "utf8"),
    userSrc: fs.readFileSync(userPath, "utf8"),
  };
}

function makeFilesMap(entries: Array<[string, string]>): Map<string, string> {
  return new Map<string, string>(entries);
}

describe("compileBundle", () => {
  test("bundles modules/provider+user and evaluates entry", () => {
    const { providerId, userId } = getFixtureIds();
    const { providerSrc, userSrc } = readFixtureSources();
    const files = makeFilesMap([
      [providerId, providerSrc],
      [userId, userSrc],
    ]);

    const bundledExpr = compileBundle(files, userId);
    expect(typeof bundledExpr).toBe("string");

    const result = evalBundledExpression(bundledExpr);
    expect(result).toBe(100);
  });

  test("is deterministic regardless of object insertion order", () => {
    const { providerId, userId } = getFixtureIds();
    const { providerSrc, userSrc } = readFixtureSources();

    const filesA = makeFilesMap([
      [providerId, providerSrc],
      [userId, userSrc],
    ]);
    const filesB = makeFilesMap([
      [userId, userSrc],
      [providerId, providerSrc],
    ]);

    const a = compileBundle(filesA, userId);
    const b = compileBundle(filesB, userId);
    expect(a).toBe(b);
  });

  test("throws when an imported provider module is missing", () => {
    const { userId } = getFixtureIds();
    const { userSrc } = readFixtureSources();
    const files = makeFilesMap([[userId, userSrc]]);

    expect(() => compileBundle(files, userId)).toThrow(/provider\.tuff/i);
  });
});
