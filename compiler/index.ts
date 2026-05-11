// TUFF → TypeScript compiler

type TokenType = "IDENT" | "NUMBER" | "LT" | "GT" | "LPAREN" | "RPAREN";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "LT", value: "<" });
      i++;
    } else if (ch === ">") {
      tokens.push({ type: "GT", value: ">" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
    } else if (/[a-zA-Z_]\w*/.test(ch)) {
      let ident = "";
      while (i < source.length && /\w/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      tokens.push({ type: "IDENT", value: ident });
    } else if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9]/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      tokens.push({ type: "NUMBER", value: num });
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }
  return tokens;
}

// AST nodes
type AstNode = ReadExpr | NumberLit;

interface ReadExpr {
  kind: "read";
  typeArg: string; // e.g. "U8", "I32"
}

interface NumberLit {
  kind: "number";
  value: number;
}

function parse(tokens: Token[]): AstNode | null {
  if (tokens.length === 0) return null;

  const first = tokens[0]!;
  const rest = tokens.slice(1);

  // read<T>()
  if (first.type === "IDENT" && first.value === "read") {
    if (!rest[0] || rest[0].type !== "LT")
      throw new Error("Expected '<' after 'read'");
    const typeToken = rest.find((t) => t.type === "GT");
    if (!typeToken) throw new Error("Missing '>' in read expression");

    // Extract the type argument between < and >
    let typeArg = "";
    for (let j = 1; j < rest.length; j++) {
      const tok = rest[j]!;
      if (tok.type === "GT") break;
      typeArg += tok.value;
    }

    const gtIndex = rest.indexOf(typeToken);
    const afterGt = rest.slice(gtIndex + 1);
    // Expect ()
    if (
      !afterGt[0] ||
      afterGt[0].type !== "LPAREN" ||
      !afterGt[1] ||
      afterGt[1].type !== "RPAREN"
    ) {
      throw new Error("Expected '()' in read expression");
    }

    return { kind: "read", typeArg };
  }

  // number literal
  if (first.type === "NUMBER") {
    return { kind: "number", value: parseInt(first.value, 10) };
  }

  throw new Error(`Unexpected token '${first.value}'`);
}

function generate(ast: AstNode | null): string {
  if (!ast) return "";

  switch (ast.kind) {
    case "read": {
      const type = ast.typeArg;
      // Map TUFF types to JS parsing logic
      switch (type) {
        case "U8":
          return `return Math.floor(Number(stdIn)) & 0xFF`;
        case "I8":
          return `return (Math.floor(Number(stdIn)) + 128) % 256 - 128`;
        case "U16":
          return `return Math.floor(Number(stdIn)) & 0xFFFF`;
        case "I16":
          return `return ((Math.floor(Number(stdIn)) + 32768) % 65536) - 32768`;
        case "U32":
          return `return Math.trunc(Number(stdIn)) >>> 0`;
        case "I32":
          return `return Math.trunc(Number(stdIn)) | 0`;
        default:
          throw new Error(`Unsupported read type '${type}'`);
      }
    }
    case "number":
      return `return ${ast.value}`;
  }
}

export function compileTuffToTS(tuffSourceCode: string): string {
  const trimmed = tuffSourceCode.trim();
  if (!trimmed) return "return 0";
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  return generate(ast);
}
