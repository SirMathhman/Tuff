package tuff;

public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty())
			return "";
		input = input.trim();
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
		java.util.regex.Matcher m = p.matcher(input);
		if (!m.find())
			return "";
		String digits = m.group(1);
		String rest = m.group(2);

		// evaluate binary expressions like "1U8 + 2U8"
		String binary = evaluateBinaryExpression(input);
		if (binary != null) {
			return binary;
		}
		// support typed integer suffixes e.g. U8, I16, U32, I64. Validate ranges using
		// BigInteger.
		String suffix = rest.trim();
		if (suffix.isEmpty() || suffix.length() < 2)
			return digits.startsWith("+") ? digits.substring(1) : digits;

		String token = extractToken(suffix);
		if (token.isEmpty())
			return normalizeDigits(digits);

		// validate token-specific ranges (may throw)
		validateTokenRange(token, digits);

		return normalizeDigits(digits);
	}

	private static String extractToken(String suffix) {
		int tokenEnd = 0;
		while (tokenEnd < suffix.length() && Character.isLetterOrDigit(suffix.charAt(tokenEnd))) {
			tokenEnd++;
		}
		return tokenEnd == 0 ? "" : suffix.substring(0, tokenEnd);
	}

	private static String normalizeDigits(String digits) {
		return digits.startsWith("+") ? digits.substring(1) : digits;
	}

	private static void validateTokenRange(String token, String digits) {
		boolean isUnsigned = token.startsWith("U");
		boolean isSigned = token.startsWith("I");

		if (!isUnsigned && !isSigned)
			return; // unknown token type

		String numberForParse = normalizeDigits(digits);
		if (isUnsigned && numberForParse.startsWith("-")) {
			throw new IllegalArgumentException("negative value not allowed for " + token + ": " + digits);
		}

		java.math.BigInteger value;
		try {
			value = new java.math.BigInteger(numberForParse);
		} catch (NumberFormatException ex) {
			throw new IllegalArgumentException("invalid number for " + token + ": " + digits, ex);
		}

		if (token.length() < 2)
			return; // no bits info

		int bits;
		try {
			bits = Integer.parseInt(token.substring(1));
		} catch (NumberFormatException ex) {
			return; // unknown token content
		}

		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}

		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + token + ": " + digits);
		}
	}

	/**
	 * Evaluate simple binary expressions with + operator where both operands have
	 * the same type suffix (e.g. U8)
	 * Returns the normalized numeric result as a string or null if input is not a
	 * binary expression we support.
	 */
	private static String evaluateBinaryExpression(String input) {
		Expression expr = parseExpression(input);
		if (expr == null)
			return null;

		return evaluateExpressionWithTokenValidation(expr);
	}

	private static class Expression {
		java.util.List<String> operands;
		java.util.List<String> ops;

		Expression(java.util.List<String> operands, java.util.List<String> ops) {
			this.operands = operands;
			this.ops = ops;
		}
	}

	private static Expression parseExpression(String input) {
		java.util.regex.Pattern operandPattern = java.util.regex.Pattern.compile("([+-]?\\d+[A-Za-z0-9]*)");
		java.util.regex.Matcher om = operandPattern.matcher(input);
		java.util.List<String> operands = new java.util.ArrayList<>();
		java.util.List<String> ops = new java.util.ArrayList<>();

		int lastEnd = 0;
		while (om.find()) {
			int start = om.start();
			int end = om.end();
			if (lastEnd != 0) {
				String opText = input.substring(lastEnd, start).trim();
				if (opText.isEmpty() || !(opText.equals("+") || opText.equals("-")))
					return null;
				ops.add(opText);
			} else {
				String leading = input.substring(0, start).trim();
				if (!leading.isEmpty())
					return null; // unexpected text before first operand
			}

			operands.add(om.group(1));
			lastEnd = end;
		}

		if (operands.size() < 2)
			return null;

		return new Expression(operands, ops);
	}

	private static String evaluateExpressionWithTokenValidation(Expression expr) {
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");

		java.util.regex.Matcher m0 = p.matcher(expr.operands.get(0));
		if (!m0.find())
			return null;
		String od0 = m0.group(1);
		String or0 = m0.group(2).trim();

		String commonToken = extractToken(or0);
		if (commonToken.isEmpty())
			return null;

		validateTokenRange(commonToken, od0);
		java.math.BigInteger acc = new java.math.BigInteger(normalizeDigits(od0));

		for (int i = 0; i < expr.ops.size(); i++) {
			String op = expr.ops.get(i);
			String operand = expr.operands.get(i + 1);

			java.util.regex.Matcher mm = p.matcher(operand);
			if (!mm.find())
				return null;
			String nd = mm.group(1);
			String nr = mm.group(2).trim();

			String ntoken = extractToken(nr);
			if (ntoken.isEmpty())
				return null;
			if (!commonToken.equals(ntoken)) {
				throw new IllegalArgumentException("mismatched operand types: " + commonToken + " vs " + ntoken);
			}

			validateTokenRange(ntoken, nd);
			java.math.BigInteger nv = new java.math.BigInteger(normalizeDigits(nd));
			if (op.equals("+"))
				acc = acc.add(nv);
			else
				acc = acc.subtract(nv);
		}

		// validate final result in range
		boolean isUnsigned = commonToken.startsWith("U");
		int bits;
		try {
			bits = Integer.parseInt(commonToken.substring(1));
		} catch (NumberFormatException ex) {
			return acc.toString();
		}

		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}

		if (acc.compareTo(min) < 0 || acc.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + commonToken + ": " + acc.toString());
		}

		return acc.toString();

	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
