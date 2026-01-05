import { Result, ok, err } from "./result";
import { interpret } from "./interpret";
import { findSemicolonAtDepthZero } from "./utils";

export function parseLetBindingHeader(
  beforeEq: string
): Result<{ name: string; isMut: boolean; type?: string }, string> {
  const mm = beforeEq.match(
    /^(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (!mm) return err("Invalid let binding");
  return ok({ name: mm[1], isMut: beforeEq.startsWith("mut "), type: mm[2] });
}

export function evalLetBinding(input: string): Result<number, string> {
  const rest = input.slice(4).trim();
  const eqIdx = rest.indexOf("=");
  if (eqIdx === -1) return err("Invalid let binding");
  const beforeEq = rest.slice(0, eqIdx).trim();
  const afterEq = rest.slice(eqIdx + 1);

  const semIdx = findSemicolonAtDepthZero(afterEq, 0);
  if (semIdx === -1) return err("Invalid let binding; missing ';'");

  const initExpr = afterEq.slice(0, semIdx).trim();
  const body = afterEq.slice(semIdx + 1).trim();

  const header = parseLetBindingHeader(beforeEq);
  if (!header.ok) return err(header.error);
  const { name, isMut, type } = header.value;

  const initRes = interpret(initExpr);
  if (!initRes.ok) return err(initRes.error);
  let value = initRes.value;
  if (type && type.toLowerCase() === "bool") {
    if (value !== 0) {
      value = 1;
    } else {
      value = 0;
    }
  }

  if (new RegExp("\\blet\\s+" + name + "\\b").test(body))
    return err("Duplicate binding");

  if (!isMut) {
    if (new RegExp("\\b" + name + "\\s*=").test(body))
      return err("Assignment to immutable variable");

    const replaced = body.replace(
      new RegExp("\\b" + name + "\\b", "g"),
      String(value)
    );
    return interpret(replaced);
  }

  return evalMutableBinding(name, value, body);
}

export function evalMutableBinding(
  name: string,
  initialValue: number,
  body: string
): Result<number, string> {
  const stmts = splitAtTopLevelSemicolons(body);
  const vars = new Map<string, number>();
  vars.set(name, initialValue);
  let lastExpr: string | undefined;
  for (const stmt of stmts) {
    const s = stmt.trim();
    if (s.length !== 0) {
      const assignMatch = s.match(new RegExp("^" + name + "\\s*=\\s*(.+)$"));
      if (assignMatch) {
        const rhs = assignMatch[1].trim();
        const rhsReplaced = replaceVars(rhs, vars);
        const r = interpret(rhsReplaced);
        if (!r.ok) return err(r.error);
        vars.set(name, r.value);
      } else {
        lastExpr = s;
      }
    }
  }

  if (!lastExpr) return ok(0);
  const finalExpr = replaceVars(lastExpr, vars);
  return interpret(finalExpr);
}

function splitAtTopLevelSemicolons(input: string): string[] {
  const out: string[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
    else if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    if (ch === ";" && depthParen === 0 && depthBrace === 0) {
      out.push(input.slice(start, i));
      start = i + 1;
    }
  }
  out.push(input.slice(start));
  return out;
}

function replaceVars(input: string, vars: Map<string, number>): string {
  let out = input;
  for (const k of vars.keys()) {
    const v = vars.get(k);
    if (v !== undefined)
      out = out.replace(new RegExp("\\b" + k + "\\b", "g"), String(v));
  }
  return out;
}
