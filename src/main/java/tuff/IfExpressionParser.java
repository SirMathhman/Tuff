package tuff;

final class IfExpressionParser {
	private final Parser parser;

	IfExpressionParser(Parser parser) {
		this.parser = parser;
	}

	Operand parseIfExpression() {
		parser.consumeIf();
		Operand cond = parseIfCondition();
		Operand thenOp = parser.parseLogicalOr();
		parseElseKeyword();
		Operand elseOp = parser.parseLogicalOr();
		return computeIfResult(cond, thenOp, elseOp);
	}

	private Operand parseIfCondition() {
		parser.skipWhitespace();
		if (parser.peekChar() != '(')
			throw new IllegalArgumentException("expected '(' after if");
		parser.consumeChar(); // consume '('
		Operand cond = parser.parseLogicalOr();
		parser.skipWhitespace();
		if (parser.peekChar() != ')')
			throw new IllegalArgumentException("expected ')' after if condition");
		parser.consumeChar(); // consume ')'
		parser.skipWhitespace();
		return cond;
	}

	private void parseElseKeyword() {
		parser.skipWhitespace();
		if (!parser.startsWithKeyword("else"))
			throw new IllegalArgumentException("expected 'else' in if-expression");
		parser.consumeKeyword("else");
		parser.skipWhitespace();
	}

	private Operand computeIfResult(Operand cond, Operand thenOp, Operand elseOp) {
		// condition must be boolean
		if (cond.isBoolean == null)
			throw new IllegalArgumentException("if condition must be boolean");

		// branches must be same kind (both boolean or both numeric)
		if ((thenOp.isBoolean != null && elseOp.isBoolean == null)
				|| (thenOp.isBoolean == null && elseOp.isBoolean != null)) {
			throw new IllegalArgumentException("if branches must be same kind");
		}

		if (thenOp.isBoolean != null) {
			// both boolean -> pick based on cond
			boolean c = !java.math.BigInteger.ZERO.equals(cond.value);
			return new Operand(c ? thenOp.value : elseOp.value, true);
		}

		// numeric branches
		String[] kind = TypeUtils.combineKinds(thenOp, elseOp);
		java.math.BigInteger chosen = !java.math.BigInteger.ZERO.equals(cond.value) ? thenOp.value : elseOp.value;
		if (kind[0] != null && kind[1] != null) {
			TypeUtils.validateRange(chosen.toString(), kind[0], kind[1]);
		}
		return new Operand(chosen, kind[0], kind[1]);
	}
}
