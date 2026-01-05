import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const jscpdBin = path.resolve(
  repoRoot,
  "node_modules",
  "jscpd",
  "bin",
  "jscpd"
);

const run = (args, { inheritOutput } = { inheritOutput: true }) => {
  const result = spawnSync(process.execPath, [jscpdBin, ...args], {
    cwd: repoRoot,
    stdio: inheritOutput ? "inherit" : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  // `spawnSync` can return `null` when terminated by signal.
  return typeof result.status === "number" ? result.status : 1;
};

// First pass: quiet. If it fails, re-run with reporting enabled so devs can see the clone locations.
const quietConfig = path.resolve(repoRoot, ".jscpd.json");
const reportConfig = path.resolve(repoRoot, ".jscpd.report.json");

const code = run(["src", "--config", quietConfig], { inheritOutput: false });
if (code === 0) {
  // Intentionally minimal output: keep the happy-path quiet.
  process.exit(0);
}

console.log("\nDuplications detected. Showing details...\n");
run(["src", "--config", reportConfig], { inheritOutput: true });
process.exit(code);
