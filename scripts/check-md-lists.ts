// Fails when a Markdown list has more than MAX_ITEMS items. Checks the .md files
// in the project root and in docs/. Items are counted at the list's own
// indentation; nested items belong to their parent item and are not counted.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_ITEMS = 10;
const root = join(import.meta.dir, "..");

interface Violation {
  file: string;
  line: number;
  count: number;
}

// Returns the indentation of a list item line, or undefined if the line is not
// a list item. Bullets are "-", "*", or "+"; numbered items are digits followed
// by "." or ")"; both must be followed by a space.
function itemIndent(line: string): number | undefined {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  const first = trimmed.charAt(0);
  const isBullet = (first === "-" || first === "*" || first === "+") && trimmed.charAt(1) === " ";
  return isBullet || isNumbered(trimmed) ? indent : undefined;
}

// True when the line starts with digits, then "." or ")", then a space.
function isNumbered(trimmed: string): boolean {
  let digits = 0;
  while (digits < trimmed.length && trimmed.charAt(digits) >= "0" && trimmed.charAt(digits) <= "9") {
    digits++;
  }
  if (digits === 0) {
    return false;
  }
  const marker = trimmed.charAt(digits);
  return (marker === "." || marker === ")") && trimmed.charAt(digits + 1) === " ";
}

// Lists in one file that exceed the limit. A list starts at an item line and
// ends at the first non-blank line that is neither an item at its indentation
// nor indented past it.
function checkText(file: string, text: string): Violation[] {
  let violations: Violation[] = [];
  let inFence = false;
  let inList = false;
  let base = 0;
  let count = 0;
  let startLine = 0;

  function closeList(): void {
    if (inList && count > MAX_ITEMS) {
      violations = [...violations, { file, line: startLine, count }];
    }
    inList = false;
  }

  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.trimEnd();
    if (line.trimStart().startsWith("```")) {
      closeList();
      inFence = !inFence;
      continue;
    }
    if (inFence || line.trim() === "") {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    const item = itemIndent(line);
    if (item !== undefined && (!inList || item <= base)) {
      if (!inList || item < base) {
        closeList();
        inList = true;
        base = item;
        count = 0;
        startLine = i + 1;
      }
      count++;
    } else if (!(inList && indent > base)) {
      closeList();
    }
  }
  closeList();
  return violations;
}

// Markdown files to check: the project root and docs/.
function markdownFiles(): string[] {
  const dirs = [root, join(root, "docs")].filter((dir) => existsSync(dir));
  let files: string[] = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".md")) {
        files = [...files, join(dir, name)];
      }
    }
  }
  return files;
}

function main(): void {
  let violations: Violation[] = [];
  for (const file of markdownFiles()) {
    violations = [...violations, ...checkText(file, readFileSync(file, "utf8"))];
  }
  if (violations.length === 0) {
    console.log(`Markdown lists: every list has ${MAX_ITEMS} items or fewer.`);
    return;
  }
  for (const v of violations) {
    console.error(`${v.file}:${v.line}: list has ${v.count} items; the limit is ${MAX_ITEMS}`);
  }
  process.exitCode = 1;
}

main();
