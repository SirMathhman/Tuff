package tuff;

/**
 * Static helper methods for expression parsing.
 * Extracted from Parser.java to reduce file complexity.
 */
public final class ExpressionParser {

	private ExpressionParser() {
		// utility class
	}

	static Operand parseExpression(Parser parser) {
		Operand left = parseTerm(parser);
		while (true) {
			parser.skipWhitespace();
			if (parser.getIndex() >= parser.getLength())
				break;
			char c = parser.charAt(parser.getIndex());
			if (c == '+' || c == '-') {
				parser.setIndex(parser.getIndex() + 1);
				Operand right = parseTerm(parser);
				if (left.isBoolean != null || right.isBoolean != null) {
					throw new IllegalArgumentException("arithmetic operators require numeric operands");
				}
				java.math.BigInteger value = (c == '+') ? left.value.add(right.value) : left.value.subtract(right.value);
				String[] kind = App.combineKinds(left, right);
				left = new Operand(value, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	static Operand parseEquality(Parser parser) {
		Operand left = parseExpression(parser);
		while (true) {
			parser.skipWhitespace();
			String op = OperatorParser.readEqualityOperator(parser);
			if (op == null)
				break;
			Operand right = parseExpression(parser);
			left = OperatorParser.computeEqualityOp(left, right, op);
		}
		return left;
	}

	static Operand parseLogicalAnd(Parser parser) {
		Operand left = parseEquality(parser);
		while (true) {
			parser.skipWhitespace();
			if (parser.getIndex() + 1 < parser.getLength() && parser.charAt(parser.getIndex()) == '&'
					&& parser.charAt(parser.getIndex() + 1) == '&') {
				parser.setIndex(parser.getIndex() + 2);
				Operand right = parseEquality(parser);
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv && rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	static Operand parseLogicalOr(Parser parser) {
		Operand left = parseLogicalAnd(parser);
		while (true) {
			parser.skipWhitespace();
			if (parser.getIndex() + 1 < parser.getLength() && parser.charAt(parser.getIndex()) == '|'
					&& parser.charAt(parser.getIndex() + 1) == '|') {
				parser.setIndex(parser.getIndex() + 2);
				Operand right = parseLogicalAnd(parser);
				if (left.isBoolean == null || right.isBoolean == null)
					throw new IllegalArgumentException("logical operators require boolean operands");
				boolean lv = !java.math.BigInteger.ZERO.equals(left.value);
				boolean rv = !java.math.BigInteger.ZERO.equals(right.value);
				java.math.BigInteger val = (lv || rv) ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO;
				left = new Operand(val, true);
			} else {
				break;
			}
		}
		return left;
	}

	static Operand parseTerm(Parser parser) {
		Operand left = parser.parseFactor();
		while (true) {
			parser.skipWhitespace();
			if (parser.getIndex() >= parser.getLength())
				break;
			char c = parser.charAt(parser.getIndex());
			if (c == '*' || c == '/' || c == '%') {
				parser.setIndex(parser.getIndex() + 1);
				Operand right = parser.parseFactor();
				if (left.isBoolean != null || right.isBoolean != null) {
					throw new IllegalArgumentException("arithmetic operators require numeric operands");
				}
				java.math.BigInteger computed = App.computeBinaryOp(left.value, right.value, String.valueOf(c));
				String[] kind = App.combineKinds(left, right);
				left = new Operand(computed, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}
}
