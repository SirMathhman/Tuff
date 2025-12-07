package tuff;

final class WhileStatementParser {
	private final Parser parser;

	WhileStatementParser(Parser parser) {
		this.parser = parser;
	}

	void parseWhileStatement() {
		parser.consumeKeyword("while");
		parser.skipWhitespace();
		if (parser.peekChar() != '(')
			throw new IllegalArgumentException("missing '(' in while");
		parser.consumeChar(); // consume '('
		int condStart = parser.getIndex();
		parser.parseLogicalOr();
		parser.skipWhitespace();
		if (parser.peekChar() != ')')
			throw new IllegalArgumentException("missing ')' in while");
		parser.consumeChar(); // consume ')'
		int postCond = parser.getIndex();
		parser.skipWhitespace();
		int bodyStart = parser.getIndex();
		boolean isBlock = parser.peekChar() == '{';
		int bodyEnd = computeBodyEnd(bodyStart, isBlock);

		while (true) {
			int savedIndex = parser.getIndex();
			parser.setIndex(condStart);
			Operand cval = parser.parseLogicalOr();
			if (cval.isBoolean == null)
				throw new IllegalArgumentException("while condition requires boolean expression");
			boolean ok = !java.math.BigInteger.ZERO.equals(cval.value);
			parser.setIndex(postCond);
			if (!ok)
				break;

			try {
				if (isBlock) {
					executeBlockIteration(bodyStart);
				} else {
					executeSingleStatementIteration(bodyStart, postCond);
				}
			} catch (BreakException b) {
				break;
			}
			// restore index after executing body so we evaluate condition again
			parser.setIndex(postCond);
		}
		// advance parser index to after body
		parser.setIndex(bodyEnd);
	}

	private int findMatchingBrace(int start) {
		int depth = 0;
		int n = parser.getIndex();
		// find starting index as absolute
		int j = start;
		for (;; j++) {
			char c = parser.charAt(j);
			if (c == '\u0000')
				break;
			if (c == '{')
				depth++;
			else if (c == '}') {
				depth--;
				if (depth == 0)
					return j;
			}
		}
		return -1;
	}

	private int computeBodyEnd(int bodyStart, boolean isBlock) {
		if (isBlock) {
			int closing = findMatchingBrace(bodyStart);
			if (closing < 0)
				throw new IllegalArgumentException("mismatched brace in while body");
			return closing + 1;
		}
		int j = bodyStart;
		int parenDepth = 0;
		for (;; j++) {
			char c = parser.charAt(j);
			if (c == '\u0000')
				break;
			if (c == '(')
				parenDepth++;
			else if (c == ')') {
				if (parenDepth > 0)
					parenDepth--;
			} else if (parenDepth == 0 && (c == ';' || c == '}')) {
				break;
			}
		}
		return j;
	}

	private void executeBlockIteration(int bodyStart) {
		int saved = parser.getIndex();
		parser.setIndex(bodyStart);
		try {
			parser.incLoopDepth();
			new BlockParser(parser).parseBlock();
		} catch (BreakException b) {
			parser.setIndex(saved);
			throw b;
		} finally {
			parser.decLoopDepth();
		}
		parser.setIndex(saved);
	}

	private void executeSingleStatementIteration(int bodyStart, int postCond) {
		int saved = parser.getIndex();
		parser.setIndex(bodyStart);
		try {
			parser.incLoopDepth();
			Operand stmt = parser.parseStatement();
			if (stmt == null) {
				// some statements (like a nested while) return null; do nothing
			}
		} catch (BreakException b) {
			parser.setIndex(saved);
			throw b;
		} finally {
			parser.decLoopDepth();
		}
		parser.setIndex(postCond);
	}
}
