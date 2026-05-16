/**
 * Scans TypeScript source files for duplicate substrings shared across two or
 * more string literals and reports them with file/line/column context so the
 * author can decide whether to extract the common part into a shared constant
 * and use concatenation.
 *
 * Example: "onetwo" and "onethree" share the substring "one".
 * Suggestion: extract `const PREFIX = "one"` and use `PREFIX + "two"` / `PREFIX + "three"`.
 *
 * Unlike an ESLint rule, this script prints a human-readable report rather
 * than a hard error.
 *
 * Exit code 1 if any duplicate substrings are found.
 */

/* eslint-disable local/no-single-use-function, local/no-single-use-variable */

import * as ts from "typescript";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const SRC_DIR = join(import.meta.dir, "..", "src");
const MIN_SUBSTRING_LENGTH = 2;

interface StringOccurrence {
  file: string;
  line: number;
  col: number;
  value: string;
}

interface DuplicateSubstringGroup {
  substring: string;
  occurrences: StringOccurrence[];
}

function collectStringLiterals(
  filePath: string,
  sourceFile: ts.SourceFile,
  relPath: string,
): StringOccurrence[] {
  const results: StringOccurrence[] = [];
  const text = sourceFile.getFullText();

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = node.text;
      if (value.length >= MIN_SUBSTRING_LENGTH) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        results.push({
          file: relPath,
          line: line + 1,
          col: character + 1,
          value,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

/**
 * Returns all substrings of `s` with length >= MIN_SUBSTRING_LENGTH.
 * Only unique substrings are returned.
 */
function allSubstrings(s: string): Set<string> {
  const subs = new Set<string>();
  const len = s.length;
  for (let start = 0; start < len; start++) {
    for (let end = start + MIN_SUBSTRING_LENGTH; end <= len; end++) {
      subs.add(s.slice(start, end));
    }
  }
  return subs;
}

/**
 * Given a set of duplicate substrings, remove any that are themselves
 * substrings of a longer duplicate (to avoid noise from sub-parts of
 * already-reported longer matches).
 */
function filterRedundantSubstrings(
  groups: DuplicateSubstringGroup[],
): DuplicateSubstringGroup[] {
  const allKeys = new Set(groups.map((g) => g.substring));
  return groups.filter((group) => {
    for (const other of allKeys) {
      if (other !== group.substring && other.includes(group.substring)) {
        // Check that the longer substring is also duplicated across the same
        // file pair so we only suppress when the parent actually covers this.
        const parentGroup = groups.find((g) => g.substring === other);
        if (parentGroup && parentGroup.occurrences.length >= 2) {
          return false;
        }
      }
    }
    return true;
  });
}

// ── Collect string literals from all source files ──────────────────────────

const tsFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith(".ts"));

const allOccurrences: StringOccurrence[] = [];

for (const f of tsFiles) {
  const filePath = join(SRC_DIR, f);
  const relPath = relative(SRC_DIR, filePath);
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  const literals = collectStringLiterals(filePath, sourceFile, relPath);
  for (const lit of literals) allOccurrences.push(lit);
}

// ── Find shared substrings ─────────────────────────────────────────────────

// Map from substring -> list of occurrences (one per literal that contains it)
const substringToOccs = new Map<string, StringOccurrence[]>();

for (const occ of allOccurrences) {
  const subs = allSubstrings(occ.value);
  for (const sub of subs) {
    const bucket = substringToOccs.get(sub);
    if (bucket === undefined) {
      substringToOccs.set(sub, [occ]);
    } else {
      // Only add this occurrence once per substring (avoid duplicating within
      // the same literal if it repeats the substring multiple times).
      const alreadyRecorded = bucket.some(
        (o) => o.file === occ.file && o.line === occ.line && o.col === occ.col,
      );
      if (!alreadyRecorded) bucket.push(occ);
    }
  }
}

// ── Build duplicate groups (2+ distinct literals share the substring) ──────

let groups: DuplicateSubstringGroup[] = [];
for (const [substring, occs] of substringToOccs) {
  if (occs.length < 2) continue;
  groups.push({ substring, occurrences: occs });
}

// ── Suppress substrings that are covered by a longer duplicate ─────────────

groups = filterRedundantSubstrings(groups);

// ── Report ─────────────────────────────────────────────────────────────────

if (groups.length === 0) {
  console.log("No duplicate string substrings found.");
  process.exit(0);
}

console.error(
  "Found " +
    groups.length +
    " duplicate string substring" +
    (groups.length === 1 ? "" : "s") +
    ":\n",
);

for (const group of groups) {
  console.error('  Duplicated substring: "' + group.substring + '"');
  for (const occ of group.occurrences) {
    console.error(
      "    " +
        occ.file +
        ":" +
        occ.line +
        ":" +
        occ.col +
        '  "' +
        occ.value +
        '"',
    );
  }
  console.error("");
}

process.exit(1);
