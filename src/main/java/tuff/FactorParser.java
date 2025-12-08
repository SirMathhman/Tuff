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

		Operand fncall = parser.parseFunctionCallIfPresent();
		if (fncall != null)
			return fncall;

		return parser.parseIdentifierLookup();
	}
}
