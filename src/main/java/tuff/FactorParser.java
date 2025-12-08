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

		throw new IllegalArgumentException("invalid token at position " + parser.getIndex());
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
