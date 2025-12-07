package tuff;

public final class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff App!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	public static String greet() {
		return "Hello from Tuff App!";
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty()) {
			return "";
		}

		// Try parsing simple expressions containing + and - (left-to-right evaluation).
		String exprResult = tryEvaluateExpression(input);
		if (exprResult != null) {
			return exprResult;
		}
		// Simple addition expressions like "100U8 + 50U8"
		java.util.regex.Matcher addMatcher = java.util.regex.Pattern.compile("^\\s*([-+]?\\S+)\\s*\\+\\s*([-+]?\\S+)\\s*$")
				.matcher(input);
		if (addMatcher.matches()) {
			return evaluateAddition(addMatcher.group(1), addMatcher.group(2));
		}

		if (isSignedInteger(input)) {
			return input;
		}

		java.util.regex.Matcher m = java.util.regex.Pattern
				.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?$")
				.matcher(input);
		if (!m.matches()) {
			throw new IllegalArgumentException("interpret: non-empty non-integer input not supported");
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2); // either "U" or "I" when present

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		String width = m.group(3); // one of 8,16,32,64 or null
		if (width != null) {
			validateRange(number, unsignedOrSigned, width);
		}

		return number;
	}

	private static boolean isSignedInteger(String s) {
		return s != null && s.matches("[-+]?\\d+");
	}

	private static String evaluateAddition(String left, String right) {
		return evaluateAddition(new String[] { left, right });
	}

	private static String evaluateAddition(String[] parts) {
		java.util.List<Operand> operands = new java.util.ArrayList<>();
		for (String p : parts) {
			operands.add(parseOperand(p));
		}

		java.math.BigInteger sum = java.math.BigInteger.ZERO;
		for (Operand op : operands) {
			sum = sum.add(op.value);
		}

		String onlyType = singleTypedKind(operands);
		if (onlyType != null) {
			String signed = onlyType.substring(0, 1);
			String width = onlyType.substring(1);
			validateRange(sum.toString(), signed, width);
		}

		return sum.toString();
	}

	private static String tryEvaluateExpression(String input) {
		Expr expr = tokenizeExpression(input);
		if (expr == null || expr.tokens.size() == 0 || expr.ops.size() != expr.tokens.size() - 1)
			return null;

		java.util.List<Operand> operands = new java.util.ArrayList<>();
		for (String t : expr.tokens)
			operands.add(parseOperand(t));

		// evaluate * and / first (left-to-right)
		for (int idx = 0; idx < expr.ops.size();) {
			String op = expr.ops.get(idx);
			if ("*".equals(op) || "/".equals(op) || "%".equals(op)) {
				java.math.BigInteger a = operands.get(idx).value;
				java.math.BigInteger b = operands.get(idx + 1).value;
				java.math.BigInteger computed = computeBinaryOp(a, b, op);

				String resSign = operands.get(idx).unsignedOrSigned != null ? operands.get(idx).unsignedOrSigned
						: operands.get(idx + 1).unsignedOrSigned;
				String resWidth = operands.get(idx).width != null ? operands.get(idx).width
						: operands.get(idx + 1).width;

				operands.set(idx, new Operand(computed, resSign, resWidth));
				operands.remove(idx + 1);
				expr.ops.remove(idx);
			} else {
				idx++;
			}
		}

		java.math.BigInteger result = operands.get(0).value;
		for (int k = 0; k < expr.ops.size(); k++) {
			String op2 = expr.ops.get(k);
			java.math.BigInteger val = operands.get(k + 1).value;
			if ("+".equals(op2))
				result = result.add(val);
			else
				result = result.subtract(val);
		}

		String onlyType = singleTypedKind(operands);
		if (onlyType != null) {
			String signed = onlyType.substring(0, 1);
			String width = onlyType.substring(1);
			validateRange(result.toString(), signed, width);
		}

		return result.toString();
	}

	private static final class Expr {
		java.util.List<String> tokens = new java.util.ArrayList<>();
		java.util.List<String> ops = new java.util.ArrayList<>();
	}

	private static Expr tokenizeExpression(String s) {
		s = s.trim();
		if (s.isEmpty())
			return null;
		int n = s.length();
		int i = 0;
		Expr expr = new Expr();

		while (i < n) {
			while (i < n && Character.isWhitespace(s.charAt(i)))
				i++;
			if (i >= n)
				break;

			if (expr.tokens.isEmpty() || expr.tokens.size() == expr.ops.size()) {
				java.util.regex.Matcher m = java.util.regex.Pattern
						.compile("^[+-]?\\d+(?:(?:U|I)(?:8|16|32|64))?")
						.matcher(s.substring(i));
				if (!m.find())
					return null;
				String tok = m.group();
				expr.tokens.add(tok);
				i += tok.length();
			} else {
				char c = s.charAt(i);
				if (c == '+' || c == '-' || c == '*' || c == '/' || c == '%') {
					expr.ops.add(String.valueOf(c));
					i++;
				} else {
					return null;
				}
			}
		}

		return expr;
	}

	private static final class Operand {
		final java.math.BigInteger value;
		final String unsignedOrSigned;
		final String width;

		Operand(java.math.BigInteger value, String unsignedOrSigned, String width) {
			this.value = value;
			this.unsignedOrSigned = unsignedOrSigned;
			this.width = width;
		}
	}

	private static Operand parseOperand(String token) {
		token = token.trim();
		if (isSignedInteger(token)) {
			return new Operand(new java.math.BigInteger(token), null, null);
		}

		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?$").matcher(token);
		if (!m.matches()) {
			throw new IllegalArgumentException("invalid operand: " + token);
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		if (width != null) {
			validateRange(number, unsignedOrSigned, width);
		}

		return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
	}

	private static String singleTypedKind(java.util.List<Operand> operands) {
		java.util.Set<String> typedSet = new java.util.HashSet<>();
		for (Operand op : operands) {
			if (op.unsignedOrSigned != null && op.width != null) {
				typedSet.add(op.unsignedOrSigned + op.width);
			}
		}
		if (typedSet.size() > 1) {
			throw new IllegalArgumentException("mixed typed operands not supported");
		}
		return typedSet.isEmpty() ? null : typedSet.iterator().next();
	}

	private static void validateRange(String number, String unsignedOrSigned, String width) {
		java.math.BigInteger value = new java.math.BigInteger(number);
		java.math.BigInteger[] range = rangeFor(unsignedOrSigned, width);
		if (value.compareTo(range[0]) < 0 || value.compareTo(range[1]) > 0) {
			String kind = ("U".equals(unsignedOrSigned) ? "U" : "I") + width;
			throw new IllegalArgumentException("value out of range for " + kind);
		}
	}

	private static java.math.BigInteger[] rangeFor(String unsignedOrSigned, String width) {
		boolean isUnsigned = "U".equals(unsignedOrSigned);
		switch (width) {
			case "8":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(255) };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(-128), java.math.BigInteger.valueOf(127) };
			case "16":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(65535) };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(-32768), java.math.BigInteger.valueOf(32767) };
			case "32":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO, new java.math.BigInteger("4294967295") };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(Integer.MIN_VALUE),
						java.math.BigInteger.valueOf(Integer.MAX_VALUE) };
			case "64":
				if (isUnsigned) {
					return new java.math.BigInteger[] { java.math.BigInteger.ZERO,
							new java.math.BigInteger("18446744073709551615") };
				}
				return new java.math.BigInteger[] { java.math.BigInteger.valueOf(Long.MIN_VALUE),
						java.math.BigInteger.valueOf(Long.MAX_VALUE) };
			default:
				return new java.math.BigInteger[] { java.math.BigInteger.ZERO.negate(), java.math.BigInteger.ZERO };
		}
	}

	private static java.math.BigInteger computeBinaryOp(java.math.BigInteger a, java.math.BigInteger b, String op) {
		if (("/".equals(op) || "%".equals(op)) && java.math.BigInteger.ZERO.equals(b)) {
			throw new IllegalArgumentException("division by zero");
		}
		if ("*".equals(op)) {
			return a.multiply(b);
		}
		if ("/".equals(op)) {
			return a.divide(b);
		}
		// percent
		return a.remainder(b);
	}
}
