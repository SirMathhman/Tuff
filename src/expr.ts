import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import type { KindName, Pos, StructLiteralField, TuffExpr } from "./ast.ts";
import { bool, num } from "./values.ts";

/** The node kinds of the binary operators, shared with the evaluator's rule table. */
export type BinaryNodeKind = "Or" | "And" | "Add" | "Equal" | "Less" | "Range";

/** The grammar properties shared by every binary operator. */
interface BinaryOpBase {
  assoc: "left" | "right";
  /** Whether the operator begins at the given token index. */
  startsAt: (tokens: TuffToken[], i: number) => boolean;
  /** How many tokens the operator consumes. */
  width: number;
}

/** A plain binary operator: the right operand is a sub-level expression. */
interface BinaryOpEntry extends BinaryOpBase {
  node: BinaryNodeKind;
}

/** The `is` type-test operator: the right operand is a kind name. */
interface IsOpEntry extends BinaryOpBase {
  node: "Is";
  /** Parse the right operand as a kind name instead of an expression. */
  parseRight: (
    tokens: TuffToken[],
    pos: Pos,
    line: number,
  ) => KindName | TuffError;
}

/** A binary operator's grammar properties. */
type BinaryOp = BinaryOpEntry | IsOpEntry;

/**
 * The binary operator grammar, loosest binding first.
 * Precedence and associativity are declared here, never by function order.
 * `&&` lexes as two `Ref` tokens; in operator position (after a complete left
 * expression) a `Ref Ref` pair is the logical AND, while in operand position
 * the same pair nests into a reference chain.
 */
const BINARY_OPS: BinaryOp[] = [
  {
    node: "Range",
    assoc: "left",
    startsAt: (t, i) => t[i]?.kind === "DotDot",
    width: 1,
  },
  {
    node: "Or",
    assoc: "right",
    startsAt: (t, i) => t[i]?.kind === "Or",
    width: 1,
  },
  {
    node: "And",
    assoc: "right",
    startsAt: (t, i) => t[i]?.kind === "Ref" && t[i + 1]?.kind === "Ref",
    width: 2,
  },
  {
    node: "Equal",
    assoc: "left",
    startsAt: (t, i) => t[i]?.kind === "Equal",
    width: 1,
  },
  {
    node: "Less",
    assoc: "left",
    startsAt: (t, i) => t[i]?.kind === "Less",
    width: 1,
  },
  {
    node: "Add",
    assoc: "left",
    startsAt: (t, i) => t[i]?.kind === "Plus",
    width: 1,
  },
  {
    node: "Is",
    assoc: "left",
    startsAt: (t, i) => t[i]?.kind === "Is",
    width: 1,
    parseRight: parseKindName,
  },
];

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
export function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  if (
    value.kind === "Literal" ||
    value.kind === "Identifier" ||
    value.kind === "Ref" ||
    value.kind === "Deref" ||
    value.kind === "Tuple" ||
    value.kind === "TupleIndex" ||
    value.kind === "Array" ||
    value.kind === "ArrayIndex" ||
    value.kind === "StructLiteral" ||
    value.kind === "FieldAccess"
  ) {
    return true;
  }
  return BINARY_OPS.some((op) => op.node === value.kind);
}

/**
 * Parse the tail of a tuple or array literal: the first element is already
 * parsed and the first comma is the next token.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the literal.
 * @param line {number} - The 1-based line number.
 * @param first {TuffExpr} - The already-parsed first element.
 * @param close {"RParen" | "RBracket"} - The expected closing token kind.
 * @param node {"Tuple" | "Array"} - The node kind to build.
 * @returns {TuffExpr | TuffError} The Tuple or Array node, or a TuffError.
 */
function parseElementList(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  first: TuffExpr,
  close: "RParen" | "RBracket",
  node: "Tuple" | "Array",
): TuffExpr | TuffError {
  const elements: TuffExpr[] = [first];
  while (tokens[pos.i]?.kind === "Comma") {
    pos.i++;
    const element = parseLevel(tokens, pos, line, 0);
    if (!isExpr(element)) return element;
    elements.push(element);
  }
  const closeTok = tokens[pos.i];
  if (closeTok?.kind !== close) {
    return { kind: "InvalidExpression", expression: "", line };
  }
  pos.i++;
  return { kind: node, elements };
}

/**
 * Parse a single operand: a literal, an identifier, a parenthesized
 * expression, a tuple literal, or an array literal, followed by any `.N`
 * tuple-index and `[e]` array-index suffixes.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
export function parseOperand(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const operand = parsePrimary(tokens, pos, line);
  if (!isExpr(operand)) return operand;
  let left: TuffExpr = operand;
  for (;;) {
    if (tokens[pos.i]?.kind === "Dot" && tokens[pos.i + 1]?.kind !== "Dot") {
      pos.i++;
      const indexTok = tokens[pos.i];
      if (indexTok?.kind === "Number" && Number.isInteger(indexTok.value)) {
        pos.i++;
        left = { kind: "TupleIndex", operand: left, index: indexTok.value };
        continue;
      }
      if (indexTok?.kind === "Ident") {
        pos.i++;
        left = { kind: "FieldAccess", operand: left, field: indexTok.name };
        continue;
      }
      return { kind: "InvalidExpression", expression: "", line };
    }
    if (tokens[pos.i]?.kind === "LBracket") {
      pos.i++;
      const index = parseIndexSuffix(tokens, pos, line);
      if (!isExpr(index)) return index;
      left = { kind: "ArrayIndex", operand: left, index };
      continue;
    }
    break;
  }
  return left;
}

/**
 * Parse the tail of an `[e]` array-index suffix: the `[` is already consumed.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the suffix.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The index expression, or a TuffError.
 */
export function parseIndexSuffix(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const index = parseLevel(tokens, pos, line, 0);
  if (!isExpr(index)) return index;
  const close = tokens[pos.i];
  if (close?.kind !== "RBracket") {
    return { kind: "InvalidExpression", expression: "", line };
  }
  pos.i++;
  return index;
}

/**
 * Parse the tail of a `&`/`&mut` reference: the `&` is already consumed.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the reference.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The Ref node, or a TuffError.
 */
function parseRef(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  let mut = false;
  const mutTok = tokens[pos.i];
  if (mutTok?.kind === "Ident" && mutTok.name === "mut") {
    mut = true;
    pos.i++;
  }
  const operand = parseOperand(tokens, pos, line);
  if (!isExpr(operand)) return operand;
  return { kind: "Ref", mut, operand };
}

/**
 * Parse a struct literal: `Name { field : expr, ... }`. The name and the
 * opening brace are already consumed.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the literal.
 * @param line {number} - The 1-based line number.
 * @param name {string} - The struct name the literal constructs.
 * @returns {TuffExpr | TuffError} The StructLiteral node, or a TuffError.
 */
function parseStructLiteral(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  name: string,
): TuffExpr | TuffError {
  const fields: StructLiteralField[] = [];
  for (;;) {
    const fieldTok = tokens[pos.i];
    if (fieldTok?.kind === "RBrace") break;
    if (fieldTok?.kind !== "Ident") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    if (tokens[pos.i]?.kind !== "Colon") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    const value = parseLevel(tokens, pos, line, 0);
    if (!isExpr(value)) return value;
    fields.push({ name: fieldTok.name, value });
    if (tokens[pos.i]?.kind === "Comma") {
      pos.i++;
      continue;
    }
    if (tokens[pos.i]?.kind === "RBrace") break;
    return { kind: "InvalidExpression", expression: "", line };
  }
  pos.i++;
  return { kind: "StructLiteral", name, fields };
}

/**
 * Parse a primary operand: a literal, an identifier, a parenthesized
 * expression, or a tuple literal.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parsePrimary(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Number" || token.kind === "Bool") {
    pos.i++;
    const value =
      token.kind === "Number" ? num(token.value) : bool(token.value !== 0);
    return {
      kind: "Literal",
      value,
      suffix: token.kind === "Number" ? token.suffix : undefined,
    };
  }
  if (token.kind === "Ref") {
    pos.i++;
    return parseRef(tokens, pos, line);
  }
  if (token.kind === "Deref") {
    pos.i++;
    const operand = parseOperand(tokens, pos, line);
    if (!isExpr(operand)) return operand;
    return { kind: "Deref", operand };
  }
  if (token.kind === "Ident") {
    pos.i++;
    if (tokens[pos.i]?.kind === "LBrace") {
      pos.i++;
      return parseStructLiteral(tokens, pos, line, token.name);
    }
    return { kind: "Identifier", name: token.name };
  }
  if (token.kind === "LParen") {
    pos.i++;
    const first = parseLevel(tokens, pos, line, 0);
    if (!isExpr(first)) return first;
    if (tokens[pos.i]?.kind === "Comma") {
      return parseElementList(tokens, pos, line, first, "RParen", "Tuple");
    }
    const close = tokens[pos.i];
    if (close?.kind !== "RParen") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return first;
  }
  if (token.kind === "LBracket") {
    pos.i++;
    if (tokens[pos.i]?.kind === "RBracket") {
      pos.i++;
      return { kind: "Array", elements: [] };
    }
    const first = parseLevel(tokens, pos, line, 0);
    if (!isExpr(first)) return first;
    if (tokens[pos.i]?.kind === "RBracket") {
      pos.i++;
      return { kind: "Array", elements: [first] };
    }
    return parseElementList(tokens, pos, line, first, "RBracket", "Array");
  }
  return { kind: "InvalidExpression", expression: "", line };
}

/**
 * Parse an expression at one precedence level of the binary operator grammar.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @param level {number} - The index into BINARY_OPS; the next level binds tighter.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
export function parseLevel(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  level: number,
): TuffExpr | TuffError {
  const op = BINARY_OPS[level];
  if (!op) return parseOperand(tokens, pos, line);
  const first = parseLevel(tokens, pos, line, level + 1);
  if (!isExpr(first)) return first;
  let left: TuffExpr = first;
  while (op.startsAt(tokens, pos.i)) {
    pos.i += op.width;
    if (op.node === "Is") {
      const right = op.parseRight(tokens, pos, line);
      if (!isKindName(right)) return right;
      left = { kind: "Is", left, right };
      continue;
    }
    const right =
      op.assoc === "right"
        ? parseLevel(tokens, pos, line, level)
        : parseLevel(tokens, pos, line, level + 1);
    if (!isExpr(right)) return right;
    left = { kind: op.node, left, right };
  }
  return left;
}

/**
 * Type guard distinguishing a parsed kind name from an error.
 * @param value {KindName | TuffError} - The value to test.
 * @returns {boolean} True if the value is a kind name.
 */
export function isKindName(value: KindName | TuffError): value is KindName {
  return (
    value.kind === "KindNameBare" ||
    value.kind === "KindNameRef" ||
    value.kind === "KindNameTuple" ||
    value.kind === "KindNameArray"
  );
}

/**
 * Parse the right operand of an `is` type-test: a kind name. A kind name is a
 * bare name (`U8`, `Bool`), a chain of one or more references to a name
 * (`&U8`, `&&U8`, optionally `&mut` on the outermost), a tuple of kind names
 * (`(U8, U8)`), or an array of a kind name and a length (`[U8; 3]`).
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the kind name.
 * @param line {number} - The 1-based line number.
 * @returns {KindName | TuffError} The kind name, or a TuffError.
 */
export function parseKindName(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): KindName | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Ref") {
    pos.i++;
    let mut = false;
    const mutTok = tokens[pos.i];
    if (mutTok?.kind === "Ident" && mutTok.name === "mut") {
      mut = true;
      pos.i++;
    }
    let depth = 1;
    while (tokens[pos.i]?.kind === "Ref") {
      pos.i++;
      const innerMut = tokens[pos.i];
      if (innerMut?.kind === "Ident" && innerMut.name === "mut") pos.i++;
      depth++;
    }
    const nameTok = tokens[pos.i];
    if (nameTok?.kind !== "Ident") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return { kind: "KindNameRef", depth, mut, name: nameTok.name };
  }
  if (token.kind === "Ident") {
    pos.i++;
    return { kind: "KindNameBare", name: token.name };
  }
  if (token.kind === "LParen") {
    pos.i++;
    const first = parseKindName(tokens, pos, line);
    if (!isKindName(first)) return first;
    const elements: KindName[] = [first];
    while (tokens[pos.i]?.kind === "Comma") {
      pos.i++;
      const element = parseKindName(tokens, pos, line);
      if (!isKindName(element)) return element;
      elements.push(element);
    }
    const close = tokens[pos.i];
    if (close?.kind !== "RParen") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return { kind: "KindNameTuple", elements };
  }
  if (token.kind === "LBracket") {
    pos.i++;
    const element = parseKindName(tokens, pos, line);
    if (!isKindName(element)) return element;
    if (tokens[pos.i]?.kind !== "Semicolon") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    const lengthTok = tokens[pos.i];
    if (
      lengthTok?.kind !== "Number" ||
      !Number.isInteger(lengthTok.value) ||
      lengthTok.value < 0
    ) {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    const close = tokens[pos.i];
    if (close?.kind !== "RBracket") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return { kind: "KindNameArray", element, length: lengthTok.value };
  }
  return { kind: "InvalidExpression", expression: "", line };
}
