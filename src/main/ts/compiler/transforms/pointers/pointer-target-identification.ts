/**
 * Identify variables that are targets of pointer operations (&x)
 * These variables need to be wrapped in arrays to work with pointer semantics
 */

import {
  isWhitespace,
  isIdentifierStartChar,
  isIdentifierChar,
} from "../../parsing/string-helpers";
import { forEachLetStatement } from "../helpers/let-statement";

function isPointerType(typeStr: string): boolean {
  return typeStr.trim().startsWith("*");
}

function readLetRhs(source: string, eqIdx: number, stmtEnd: number): string {
  let start = eqIdx + 1;
  while (start < stmtEnd && isWhitespace(source[start]!)) start++;
  return source.slice(start, stmtEnd).trim();
}

function readLetType(
  source: string,
  colonIdx: number,
  eqIdx: number,
  stmtEnd: number,
): string | undefined {
  if (colonIdx === -1) return undefined;
  const end = eqIdx !== -1 ? eqIdx : stmtEnd;
  if (colonIdx >= end) return undefined;
  return source.slice(colonIdx + 1, end).trim();
}

function tryReadBareIdentifier(expr: string): string | undefined {
  if (!expr) return undefined;
  if (!isIdentifierStartChar(expr[0]!)) return undefined;
  let i = 1;
  while (i < expr.length && isIdentifierChar(expr[i]!)) i++;
  const rest = expr.slice(i).trim();
  if (rest.length > 0) return undefined;
  return expr.slice(0, i);
}

/**
 * Identify variables that *hold pointer values*.
 *
 * This is used to prevent creating pointer-to-pointer semantics in the compiler
 * for expressions like `&p`, where `p` already holds a pointer.
 */
export function findPointerVars(source: string): Set<string> {
  const pointerVars = new Set<string>();

  // Seed pointerVars from explicit pointer types and `let x = &y`.
  forEachLetStatement(source, (startIdx, info) => {
    if (!info.varName) return;
    if (info.eqIdx === -1) return;

    const typeStr = readLetType(
      source,
      info.colonIdx,
      info.eqIdx,
      info.stmtEnd,
    );
    if (typeStr && isPointerType(typeStr)) {
      pointerVars.add(info.varName);
      return;
    }

    const rhs = readLetRhs(source, info.eqIdx, info.stmtEnd);
    if (rhs.startsWith("&") && (rhs.length < 2 || rhs[1] !== "&")) {
      pointerVars.add(info.varName);
    }
  });

  // Propagate: `let a = b;` where b is a pointer var => a is also a pointer var.
  let changed = true;
  while (changed) {
    changed = false;
    forEachLetStatement(source, (_startIdx, info) => {
      if (!info.varName || info.eqIdx === -1) return;
      if (pointerVars.has(info.varName)) return;
      const rhs = readLetRhs(source, info.eqIdx, info.stmtEnd);
      const bareId = tryReadBareIdentifier(rhs);
      if (bareId && pointerVars.has(bareId)) {
        pointerVars.add(info.varName);
        changed = true;
      }
    });
  }

  return pointerVars;
}

export function findPointerTargets(
  source: string,
  declaredVars: Set<string>,
  pointerVars: Set<string> = new Set<string>(),
): Set<string> {
  const targets = new Set<string>();

  // Look for patterns: &<identifier>
  let pos = 0;
  while (pos < source.length) {
    if (source[pos] === "&" && pos + 1 < source.length) {
      // Make sure this is a reference operation (not part of && or something)
      if (pos > 0 && source[pos - 1] === "&") {
        // This is && (logical AND), skip
        pos++;
        continue;
      }

      // Extract the identifier after &
      let idStart = pos + 1;
      // Skip whitespace
      while (idStart < source.length && isWhitespace(source[idStart]!)) {
        idStart++;
      }

      if (idStart < source.length && isIdentifierStartChar(source[idStart]!)) {
        let idEnd = idStart;
        while (idEnd < source.length && isIdentifierChar(source[idEnd]!)) {
          idEnd++;
        }

        const varName = source.slice(idStart, idEnd);
        if (!declaredVars.has(varName)) {
          pos = idEnd;
          continue;
        }
        // If this variable already holds a pointer value, do not treat it as a pointer target.
        if (pointerVars.has(varName)) {
          pos = idEnd;
          continue;
        }
        targets.add(varName);
        pos = idEnd;
        continue;
      }
    }

    pos++;
  }

  return targets;
}
