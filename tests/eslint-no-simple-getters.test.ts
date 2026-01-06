import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";

function projectRoot(): string {
  return path.join(__dirname, "..");
}

function eslintBin(root: string): string {
  // Use the JS entrypoint so this works cross-platform (no .cmd handling).
  return path.join(root, "node_modules", "eslint", "bin", "eslint.js");
}

function runEslintOnCode(
  root: string,
  code: string
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const tmpDir = fs.mkdtempSync(path.join(root, "tests", "tmp-eslint-"));
  const filePath = path.join(tmpDir, "fixture.ts");
  fs.writeFileSync(filePath, code, "utf8");

  const res = spawnSync(
    process.execPath,
    [
      eslintBin(root),
      "--config",
      path.join(root, "eslint.config.cjs"),
      filePath,
    ],
    {
      cwd: root,
      encoding: "utf8",
    }
  );

  // best-effort cleanup
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
  try {
    fs.rmdirSync(tmpDir);
  } catch {
    // ignore
  }

  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

describe("local/no-simple-getters", () => {
  test("flags private zero-arg getter that returns a field", async () => {
    const root = projectRoot();

    const code = `
class A {
  private x = 1;
  private getX(): number {
    return this.x;
  }
  public method(): number {
    return this.getX();
  }
}
const a = new A();
a.method();
`;

    const res = runEslintOnCode(root, code);
    expect(res.status).toBe(1);
    expect((res.stdout + res.stderr).includes("local/no-simple-getters")).toBe(
      true
    );
  });

  test("does not flag a non-trivial private getter", async () => {
    const root = projectRoot();

    const code = `
class A {
  private x = 1;
  private getX(): number {
    return this.x + 1;
  }
  public method(): number {
    return this.getX();
  }
}
const a = new A();
a.method();
`;

    const res = runEslintOnCode(root, code);
    expect(res.status).toBe(0);
  });
});
