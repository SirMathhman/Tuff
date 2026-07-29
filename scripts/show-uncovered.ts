/**
 * Parse an LCOV coverage file and show uncovered lines for a given file + range.
 *
 * Usage:
 *   bun scripts/show-uncovered.ts <lcov-path> <file-name> <startLine> <endLine>
 *
 * Example:
 *   bun scripts/show-uncovered.ts coverage/lcov.info src/evaluator.ts 340 370
 */

import * as fs from "fs";
import * as path from "path";

const [lcovPath, fileName, startLine, endLine] = parseArgs();

const uncovered = getUncoveredLines(lcovPath, fileName, +startLine, +endLine);

if (uncovered.length === 0) {
  console.log(`No uncovered lines in ${fileName} [${startLine}-${endLine})`);
  process.exit(0);
}

const sourceLines = fs.readFileSync(fileName, "utf-8").split("\n");

console.log(`\nUncovered lines in ${fileName} [${startLine}-${endLine}):\n`);
for (let i = 0; i < uncovered.length; i++) {
  const lineNum = uncovered[i]!;
  if (i > 0 && lineNum !== uncovered[i - 1]! + 1) {
    console.log("  ...\n");
  }
  const src = sourceLines[lineNum - 1] ?? "";
  console.log(`  ${lineNum}: ${src}`);
}
console.log(`\nTotal: ${uncovered.length} uncovered line(s)\n`);

function parseArgs(): [string, string, string, string] {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error(
      "Usage: bun scripts/show-uncovered.ts <lcov-path> <file-name> <startLine> <endLine>",
    );
    process.exit(1);
  }
  return args as [string, string, string, string];
}

function getUncoveredLines(
  lcovPath: string,
  fileName: string,
  startLine: number,
  endLine: number,
): number[] {
  const raw = fs.readFileSync(lcovPath, "utf-8");
  const lines = raw.split("\n");

  const uncovered = new Set<number>();
  let inSource = false;

  for (const line of lines) {
    if (line.startsWith("SF:")) {
      const sfPath = line.slice(3).replace(/\\/g, "/");
      inSource =
        path.basename(sfPath) === path.basename(fileName) ||
        sfPath === fileName ||
        sfPath.endsWith(fileName);
    } else if (line === "end_of_record") {
      if (inSource) break;
    } else if (inSource && line.startsWith("DA:")) {
      // DA:line_num,exec_count[,checksum]
      const parts = line.slice(3).split(",");
      const lineNum = +parts[0]!;
      const execCount = +parts[1]!;
      if (execCount === 0 && lineNum >= startLine && lineNum < endLine) {
        uncovered.add(lineNum);
      }
    }
  }

  return Array.from(uncovered).sort((a, b) => a - b);
}
