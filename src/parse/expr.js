"use strict";

const { node } = require("../ast/nodes");

const PRECEDENCE = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  is: 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

function parseExpression(parser, minPrec = 0) {
  let left = parsePrefix(parser);

  while (true) {
    const tok = parser.peek();
    const prec = PRECEDENCE[tok.type];
    if (prec === undefined || prec < minPrec) {
      break;
    }

    parser.next();
    if (tok.type === "is") {
      const variant = parser.parseScopedVariant();
      left = node("IsExpr", {
        left,
        variant,
        span: parser.spanFrom(left, variant),
      });
      continue;
    }

    const right = parseExpression(parser, prec + 1);
    left = node("BinaryExpr", {
      op: tok.type,
      left,
      right,
      span: parser.spanFrom(left, right),
    });
  }

  return left;
}

function parsePrefix(parser) {
  const tok = parser.peek();
  if (tok.type === "-" || tok.type === "!") {
    parser.next();
    const expr = parseExpression(parser, 7);
    return node("UnaryExpr", {
      op: tok.type,
      expr,
      span: parser.spanFrom(tok, expr),
    });
  }
  return parsePostfix(parser);
}

function parsePostfix(parser) {
  let expr = parsePrimary(parser);
  while (true) {
    const tok = parser.peek();
    if (tok.type === ".") {
      parser.next();
      const ident = parser.expect("ident");
      if (parser.peek().type === "(") {
        const args = parser.parseCallArgs();
        expr = node("DotCall", {
          object: expr,
          property: ident.value,
          args,
          span: parser.spanFrom(expr, args[args.length - 1] || ident),
        });
      } else {
        expr = node("MemberExpr", {
          object: expr,
          property: ident.value,
          span: parser.spanFrom(expr, ident),
        });
      }
      continue;
    }
    if (tok.type === "[") {
      parser.next();
      const index = parseExpression(parser);
      parser.expect("]");
      expr = node("IndexExpr", {
        object: expr,
        index,
        span: parser.spanFrom(expr, index),
      });
      continue;
    }
    if (tok.type === "(") {
      const args = parser.parseCallArgs();
      expr = node("CallExpr", {
        callee: expr,
        args,
        span: parser.spanFrom(expr, args[args.length - 1] || expr),
      });
      continue;
    }
    break;
  }
  return expr;
}

function parsePrimary(parser) {
  const tok = parser.peek();
  if (tok.type === "number") {
    parser.next();
    return node("NumberLiteral", { value: tok.value, span: tok.span });
  }
  if (tok.type === "string") {
    parser.next();
    return node("StringLiteral", { value: tok.value, span: tok.span });
  }
  if (tok.type === "char") {
    parser.next();
    return node("CharLiteral", { value: tok.value, span: tok.span });
  }
  if (tok.type === "true" || tok.type === "false") {
    parser.next();
    return node("BooleanLiteral", {
      value: tok.type === "true",
      span: tok.span,
    });
  }
  if (tok.type === "null") {
    parser.next();
    return node("NullLiteral", { span: tok.span });
  }
  if (tok.type === "ident") {
    parser.next();
    if (parser.peek().type === "::") {
      parser.next();
      const variant = parser.expect("ident");
      return node("EnumValue", {
        enumName: tok.value,
        variant: variant.value,
        span: parser.spanFrom(tok, variant),
      });
    }
    if (parser.peek().type === "{") {
      const fields = parser.parseStructLiteral();
      return node("StructLiteral", {
        name: tok.value,
        values: fields,
        span: parser.spanFrom(tok, fields[fields.length - 1] || tok),
      });
    }
    return node("Identifier", { name: tok.value, span: tok.span });
  }
  if (tok.type === "[") {
    return parser.parseArrayLiteral();
  }
  if (tok.type === "{") {
    return parser.parseBlockExpr();
  }
  if (tok.type === "(") {
    parser.next();
    const expr = parseExpression(parser);
    parser.expect(")");
    return expr;
  }
  if (tok.type === "fn") {
    return parser.parseFnExpr();
  }
  if (tok.type === "if") {
    return parser.parseIfExpr();
  }
  if (tok.type === "match") {
    return parser.parseMatchExpr();
  }
  parser.error(`Unexpected token in expression: ${tok.type}`);
}

module.exports = { parseExpression };
