package tuff;

/**
 * Static helper methods for operator parsing.
 * Extracted from Parser.java to reduce file complexity.
 */
public final class OperatorParser {

	private OperatorParser() {
		// utility class
	}

	/**
	 * Read and parse an equality operator (==, !=, <=, >=, <, >).
	 */
	static String readEqualityOperator(Parser parser) {
		parser.skipWhitespace();
		if (parser.getIndex() + 1 < parser.getLength()) {
			String two = parser.getSubstring(parser.getIndex(), parser.getIndex() + 2);
			if ("==".equals(two) || "!=".equals(two) || "<=".equals(two) || ">=".equals(two)) {
				parser.setIndex(parser.getIndex() + 2);
				return two;
			}
		}
		if (parser.getIndex() < parser.getLength()) {
			char c = parser.charAt(parser.getIndex());
			if (c == '<' || c == '>') {
				parser.setIndex(parser.getIndex() + 1);
				return String.valueOf(c);
			}
		}
		return null;
	}

	/**
	 * Compute the result of an equality/relational operator.
	 */
	static Operand computeEqualityOp(Operand left, Operand right, String op) {
		if ("==".equals(op) || "!=".equals(op)) {
			return computeEqualityEqOp(left, right, op);
		}
		return computeRelationalOp(left, right, op);
	}

	/**
	 * Compute == or != operator result.
	 */
	private static Operand computeEqualityEqOp(Operand left, Operand right, String op) {
		if ((left.isBoolean != null && right.isBoolean == null)
				|| (left.isBoolean == null && right.isBoolean != null)) {
			throw new IllegalArgumentException("equality requires operands of same kind");
		}
		boolean eq = left.value.equals(right.value);
		boolean result = "==".equals(op) ? eq : !eq;
		return new Operand(result ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}

	/**
	 * Compute <, <=, >, >= operator result.
	 */
	private static Operand computeRelationalOp(Operand left, Operand right, String op) {
		if (left.isBoolean != null || right.isBoolean != null) {
			throw new IllegalArgumentException("relational operators require numeric operands");
		}
		int cmp = left.value.compareTo(right.value);
		boolean res;
		switch (op) {
			case "<":
				res = cmp < 0;
				break;
			case "<=":
				res = cmp <= 0;
				break;
			case ">":
				res = cmp > 0;
				break;
			case ">=":
				res = cmp >= 0;
				break;
			default:
				throw new IllegalArgumentException("unknown operator " + op);
		}
		return new Operand(res ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
	}
}
