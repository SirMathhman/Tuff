import { Lexer } from "../../main/ts/lexer/lexer.js";
import { TokenType } from "../../main/ts/lexer/token.js";
import { DiagnosticReporter } from "../../main/ts/common/diagnostics.js";

describe("Lexer", () => {
  let reporter: DiagnosticReporter;

  beforeEach(() => {
    reporter = new DiagnosticReporter();
  });

  it("should scan basic tokens", () => {
    const source = `from System::IO use { println };
let message = "Hello, Tuff!";
println(message);
0`;
    const lexer = new Lexer(source, "test.tuff", reporter);
    const tokens = lexer.scanTokens();

    const expectedTypes = [
      TokenType.From,
      TokenType.Identifier,
      TokenType.DoubleColon,
      TokenType.Identifier,
      TokenType.Use,
      TokenType.OpenBrace,
      TokenType.Identifier,
      TokenType.CloseBrace,
      TokenType.Semicolon,
      TokenType.Let,
      TokenType.Identifier,
      TokenType.Equal,
      TokenType.String,
      TokenType.Semicolon,
      TokenType.Identifier,
      TokenType.OpenParen,
      TokenType.Identifier,
      TokenType.CloseParen,
      TokenType.Semicolon,
      TokenType.Number,
      TokenType.EOF,
    ];

    expect(tokens.map((t) => t.type)).toEqual(expectedTypes);
    expect(reporter.hasErrors()).toBe(false);
  });

  it("should handle numbers with underscores", () => {
    const source = "1_000_000";
    const lexer = new Lexer(source, "test.tuff", reporter);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.Number);
    expect(tokens[0].literal).toBe(1000000);
  });

  it("should handle multi-line comments", () => {
    const source = `/* multi
line */ 123`;
    const lexer = new Lexer(source, "test.tuff", reporter);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.Number);
    expect(tokens[0].lexeme).toBe("123");
  });

  it("should handle operators", () => {
    const source =
      "+ - * / % == != < > <= >= && || ! & | ^ << >> += -= *= /= :: => ..";
    const lexer = new Lexer(source, "test.tuff", reporter);
    const tokens = lexer.scanTokens();

    const expectedTypes = [
      TokenType.Plus,
      TokenType.Minus,
      TokenType.Star,
      TokenType.Slash,
      TokenType.Percent,
      TokenType.EqualEqual,
      TokenType.BangEqual,
      TokenType.Less,
      TokenType.Greater,
      TokenType.LessEqual,
      TokenType.GreaterEqual,
      TokenType.AmpersandAmpersand,
      TokenType.PipePipe,
      TokenType.Bang,
      TokenType.Ampersand,
      TokenType.Pipe,
      TokenType.Caret,
      TokenType.LessLess,
      TokenType.GreaterGreater,
      TokenType.PlusEqual,
      TokenType.MinusEqual,
      TokenType.StarEqual,
      TokenType.SlashEqual,
      TokenType.DoubleColon,
      TokenType.Arrow,
      TokenType.DotDot,
      TokenType.EOF,
    ];

    expect(tokens.map((t) => t.type)).toEqual(expectedTypes);
  });
});
