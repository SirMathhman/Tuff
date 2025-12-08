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
				String[] kind = TypeUtils.combineKinds(left, right);
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
			// support 'is' type test operator (e.g., x is I32)
			if (parser.startsWithKeyword("is")) {
				left = parseIsOperator(parser, left);
				continue;
			}
			String op = OperatorParser.readEqualityOperator(parser);
			if (op == null)
				break;
			Operand right = parseExpression(parser);
			left = OperatorParser.computeEqualityOp(left, right, op);
		}
		return left;
	}

	private static Operand parseIsOperator(Parser parser, Operand left) {
		parser.consumeKeyword("is");
		parser.skipWhitespace();
		// parse a declared type on the right-hand side
		DeclaredType dt = new DeclaredType();
		String rem = parser.remainingInput();
		java.util.regex.Matcher tm = java.util.regex.Pattern.compile("^(?:U|I)(?:8|16|32|64|Size)").matcher(rem);
		java.util.regex.Matcher bm = java.util.regex.Pattern.compile("^Bool").matcher(rem);
		java.util.regex.Matcher am = java.util.regex.Pattern.compile("^\\[\\s*[^\\]]+\\]").matcher(rem);
		if (tm.find()) {
			String type = tm.group();
			dt.unsignedOrSigned = type.substring(0, 1);
			dt.width = type.substring(1);
			nodeConsume(parser, type.length());
		} else if (bm.find()) {
			dt.isBool = true;
			nodeConsume(parser, 4);
		} else if (am.find()) {
			String found = am.group();
			String inside = found.substring(1, found.length() - 1).trim();
			String[] parts = inside.split("\\s*;\\s*");
			String elemType = parts[0];
			if (elemType.startsWith("Bool")) {
				dt.elemIsBool = true;
			} else if (elemType.matches("^(?:U|I)(?:8|16|32|64|Size)$")) {
				dt.elemUnsignedOrSigned = elemType.substring(0, 1);
				dt.elemWidth = elemType.substring(1);
			} else {
				tdtResolveAlias(parser, elemType, dt);
			}
			if (parts.length > 1) {
				try {
					dt.arrayLength = Integer.parseInt(parts[1]);
				} catch (Exception ex) {
					throw new IllegalArgumentException("invalid array length in type");
				}
			}
			if (parts.length > 2) {
				try {
					dt.arrayCapacity = Integer.parseInt(parts[2]);
				} catch (Exception ex) {
					throw new IllegalArgumentException("invalid array capacity in type");
				}
			}
			dt.isArray = true;
			nodeConsume(parser, found.length());
		} else {
			// identifier: could be alias
			java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(rem);
			if (!idm.find())
				throw new IllegalArgumentException("invalid type in is test");
			String ident = idm.group();
			tdtResolveAlias(parser, ident, dt);
			nodeConsume(parser, ident.length());
		}
		// evaluate type test
		boolean res = evaluateIs(left, dt);
		return new Operand(res ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
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
				java.math.BigInteger computed = TypeUtils.computeBinaryOp(left.value, right.value, String.valueOf(c));
				String[] kind = TypeUtils.combineKinds(left, right);
				left = new Operand(computed, kind[0], kind[1]);
			} else {
				break;
			}
		}
		return left;
	}

	// advance parser index by given length
	private static void nodeConsume(Parser parser, int len) {
		parser.setIndex(parser.getIndex() + len);
	}

	// resolve a possible type alias into the target DeclaredType
	private static void tdtResolveAlias(Parser parser, String ident, DeclaredType target) {
		java.util.Map<String, DeclaredType> aliases = parser.getTypeAliases();
		if (!aliases.containsKey(ident))
			throw new IllegalArgumentException("unknown type in is test: " + ident);
		DeclaredType a = aliases.get(ident);
		target.isBool = a.isBool;
		target.unsignedOrSigned = a.unsignedOrSigned;
		target.width = a.width;
		target.isArray = a.isArray;
		target.elemIsBool = a.elemIsBool;
		target.elemUnsignedOrSigned = a.elemUnsignedOrSigned;
		target.elemWidth = a.elemWidth;
		target.arrayLength = a.arrayLength;
		target.arrayCapacity = a.arrayCapacity;
	}

	private static boolean evaluateIs(Operand left, DeclaredType dt) {
		if (dt.isBool) {
			return left.isBoolean != null;
		}
		if (dt.unsignedOrSigned != null && dt.width != null) {
			if (left.isBoolean != null)
				return false;
			if (left.unsignedOrSigned != null && left.width != null) {
				return dt.unsignedOrSigned.equals(left.unsignedOrSigned) && dt.width.equals(left.width);
			}
			return false;
		}
		if (dt.isArray) {
			return evaluateIsArray(left, dt);
		}
		return false;
	}

	private static boolean evaluateIsArray(Operand left, DeclaredType dt) {
		if (left.elements == null)
			return false;
		// check element types when specified
		for (Operand el : left.elements) {
			if (!evaluateIsArrayElement(el, dt)) {
				return false;
			}
		}
		return true;
	}

	private static boolean evaluateIsArrayElement(Operand el, DeclaredType dt) {
		if (dt.elemIsBool) {
			return el.isBoolean != null;
		}
		if (el.isBoolean != null)
			return false;
		if (dt.elemUnsignedOrSigned != null && dt.elemWidth != null) {
			if (el.unsignedOrSigned != null && el.width != null) {
				if (!dt.elemUnsignedOrSigned.equals(el.unsignedOrSigned) || !dt.elemWidth.equals(el.width))
					return false;
			}
		}
		return true;
	}
}
