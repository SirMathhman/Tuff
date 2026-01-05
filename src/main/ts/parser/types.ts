import { Modifier, ModifierKind, TypeNode } from "../ast/ast.js";
import { Token, TokenType } from "../lexer/token.js";
import { ParserState } from "./state.js";

const PRIMITIVES = new Set<string>([
  "I8",
  "I16",
  "I32",
  "I64",
  "U8",
  "U16",
  "U32",
  "U64",
  "ISize",
  "USize",
  "F32",
  "F64",
  "Bool",
  "Void",
  "NativeString",
]);

export class TypeParser {
  constructor(
    private readonly state: ParserState,
    private readonly makeModifier: (
      kind: ModifierKind,
      token: Token
    ) => Modifier
  ) {}

  parseType(): TypeNode {
    let type = this.parseBaseType();

    while (this.state.match(TokenType.Pipe)) {
      const right = this.parseBaseType();
      if (type.kind === "UnionType") {
        type.types.push(right);
        type.span = {
          start: type.span.start,
          end: right.span.end,
          sourceFile: this.state.sourceFile,
        };
      } else {
        type = {
          kind: "UnionType",
          types: [type, right],
          span: {
            start: type.span.start,
            end: right.span.end,
            sourceFile: this.state.sourceFile,
          },
        };
      }
    }

    return type;
  }

  private parseBaseType(): TypeNode {
    if (this.state.match(TokenType.OpenBracket)) {
      const start = this.state.previous();
      const elementType = this.parseType();
      this.state.consume(
        TokenType.Semicolon,
        "Expect ';' after element type in array."
      );
      const initialized = parseInt(
        this.state.consume(TokenType.Number, "Expect initialized count.").lexeme
      );
      this.state.consume(
        TokenType.Semicolon,
        "Expect ';' after initialized count."
      );
      const length = parseInt(
        this.state.consume(TokenType.Number, "Expect total length.").lexeme
      );
      const endToken = this.state.consume(
        TokenType.CloseBracket,
        "Expect ']' after array type."
      );
      return {
        kind: "ArrayType",
        elementType,
        initialized,
        length,
        span: this.state.span(start, endToken),
      };
    }

    if (this.state.match(TokenType.Star)) {
      const start = this.state.previous();
      const modifiers: Modifier[] = [];
      if (this.state.match(TokenType.Mut)) {
        modifiers.push(this.makeModifier("mut", this.state.previous()));
      }
      this.state.consume(
        TokenType.OpenBracket,
        "Expect '[' after slice pointer."
      );
      const elementType = this.parseType();
      const endToken = this.state.consume(
        TokenType.CloseBracket,
        "Expect ']' after slice type."
      );
      return {
        kind: "SliceType",
        elementType,
        modifiers,
        span: this.state.span(start, endToken),
      };
    }

    const token = this.state.consume(TokenType.Identifier, "Expect type name.");
    if (PRIMITIVES.has(token.lexeme)) {
      return {
        kind: "PrimitiveType",
        name: token.lexeme,
        span: this.state.tokenSpan(token),
      };
    }

    return {
      kind: "NamedType",
      name: token.lexeme,
      span: this.state.tokenSpan(token),
    };
  }
}
