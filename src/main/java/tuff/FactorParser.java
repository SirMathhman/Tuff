package tuff;

final class FactorParser {
	private FactorParser() {
	}

	static Operand parse(Parser parser) {
		parser.skipWhitespace();
		Operand keywordFactor = parseKeywordFactor(parser);
		if (keywordFactor != null) {
			return keywordFactor;
		}

		Operand primary = parsePrimary(parser);
		if (primary != null) {
			return primary;
		}

		int pos = parser.getIndex();
		String rem = parser.remainingInput();
		String previewRaw = rem.length() > 40 ? rem.substring(0, 40) + "..." : rem;
		String preview = previewRaw.replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
		String found = pos < parser.getLength() ? String.valueOf(parser.charAt(pos)) : "<EOF>";
		// compute line/column and the full line contents for a caret pointer
		int line = 1, col = 1;
		for (int j = 0; j < pos; j++) {
			char c = parser.charAt(j);
			if (c == '\n') {
				line++;
				col = 1;
			} else {
				col++;
			}
		}

		// find current line boundaries
		int startIdx = pos;
		while (startIdx > 0) {
			char c = parser.charAt(startIdx - 1);
			if (c == '\n' || c == '\u0000')
				break;
			startIdx--;
		}
		int endIdx = pos;
		while (true) {
			char c = parser.charAt(endIdx);
			if (c == '\n' || c == '\u0000')
				break;
			endIdx++;
		}
		String lineContent = parser.getSubstring(startIdx, endIdx).replace("\t", "\\t");
		int caretPos = col - 1; // zero-based in this line
		StringBuilder caret = new StringBuilder();
		for (int k = 0; k < caretPos; k++)
			caret.append(' ');
		caret.append('^');

		String msg = String.format("invalid token at line %d, col %d: '%s'\n%s\n%s", line, col, found, lineContent,
				caret.toString());
		throw new IllegalArgumentException(msg);
	}

	private static Operand parseKeywordFactor(Parser parser) {
		if (parser.startsWithKeyword("if")) {
			return parser.parseIfExpression();
		}
		if (parser.startsWithKeyword("match")) {
			return parser.parseMatchExpression();
		}
		return null;
	}

	private static Operand parsePrimary(Parser parser) {
		// support unary logical not
		if (parser.peekChar() == '!') {
			parser.consumeChar();
			parser.skipWhitespace();
			Operand operand = parsePrimary(parser);
			if (operand == null)
				throw new IllegalArgumentException("missing operand after '!'");
			if (operand.isBoolean == null)
				throw new IllegalArgumentException("logical not requires boolean operand");
			boolean val = java.math.BigInteger.ZERO.equals(operand.value);
			return new Operand(val ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
		}
		Operand paren = parser.parseParenthesized();
		if (paren != null)
			return paren;

		Operand block = parser.parseBlockStart();
		if (block != null)
			return block;

		Operand arr = parser.parseArrayLiteral();
		if (arr != null)
			return arr;

		Operand boolLit = parser.parseBooleanLiteral();
		if (boolLit != null)
			return boolLit;

		Operand num = parser.parseNumberToken();
		if (num != null)
			return num;

		Operand str = parseStringLiteralWithAccess(parser);
		if (str != null) {
			return str;
		}

		// support inline function literals as expressions
		if (parser.startsWithKeyword("fn")) {
			return FunctionDefinitionParser.parseFunctionLiteral(parser);
		}

		Operand fncall = parser.parseFunctionCallIfPresent();
		if (fncall != null)
			return fncall;

		Operand idOp = parseIdentifierWithCall(parser);
		if (idOp != null) {
			return idOp;
		}

		return null;
	}

	private static Operand parseStringLiteralWithAccess(Parser parser) {
		Operand str = LiteralParser.parseStringLiteral(parser);
		if (str != null) {
			// allow string indexing "foo"[0]
			parser.skipWhitespace();
			if (parser.peekChar() == '[') {
				parser.consumeChar();
				Operand idxOp = parser.parseLogicalOr();
				parser.skipWhitespace();
				if (parser.peekChar() != ']')
					throw new IllegalArgumentException("missing ']' in index expression");
				parser.consumeChar();
				if (idxOp.isBoolean != null)
					throw new IllegalArgumentException("index must be numeric");
				int idx = idxOp.value.intValue();
				if (idx < 0 || idx >= str.stringValue.length())
					throw new IllegalArgumentException("index out of bounds");
				char ch = str.stringValue.charAt(idx);
				return new Operand(String.valueOf(ch), true);
			}
			// allow simple member access on literals (e.g., "foo".length)
			while (parser.peekChar() == '.') {
				parser.consumeChar();
				parser.skipWhitespace();
				java.util.regex.Matcher fm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*")
						.matcher(parser.remainingInput());
				if (!fm.find())
					throw new IllegalArgumentException("invalid field name in member access");
				String fname = fm.group();
				parser.setIndex(parser.getIndex() + fname.length());
				if ("length".equals(fname)) {
					return new Operand(java.math.BigInteger.valueOf(str.stringValue.length()), null, null);
				}
				throw new IllegalArgumentException("unknown field: " + fname);
			}
			return str;
		}
		return null;
	}

	private static Operand parseIdentifierWithCall(Parser parser) {
		Operand idOp = parser.parseIdentifierLookup();
		if (idOp != null) {
			parser.skipWhitespace();
			// support calling a function-valued operand: e.g., `func(1, 2)` where
			// `func` is a variable that holds a function reference.
			if (parser.peekChar() == '(') {
				parser.consumeChar();
				java.util.List<Operand> args = new java.util.ArrayList<>();
				parser.skipWhitespace();
				int n = parser.getLength();
				if (parser.getIndex() < n && parser.charAt(parser.getIndex()) != ')') {
					while (true) {
						Operand arg = parser.parseLogicalOr();
						args.add(arg);
						parser.skipWhitespace();
						if (parser.getIndex() < n && parser.charAt(parser.getIndex()) == ',') {
							parser.consumeChar();
							parser.skipWhitespace();
							continue;
						}
						break;
					}
				}
				parser.skipWhitespace();
				if (parser.peekChar() != ')')
					throw new IllegalArgumentException("missing ')' in function call");
				parser.consumeChar();

				// determine function definition to call
				String fname = idOp.functionName;
				FunctionDef fd = idOp.functionRef;
				if (fd == null && fname != null) {
					fd = parser.getFunctions().get(fname);
				}
				if (fd == null)
					throw new IllegalArgumentException("attempted call on non-function");

				FunctionCallParser.FunctionCallContext ctx = new FunctionCallParser.FunctionCallContext(fname, fd);
				ctx.args = args;
				ctx.typeArgs = null;
				return FunctionCallParser.callFunction(parser, ctx);
			}
			return idOp;
		}
		return null;
	}
}
