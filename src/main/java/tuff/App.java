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
	 * Evaluate simple binary expressions with + operator where both operands have the same type suffix (e.g. U8)
	 * Returns the normalized numeric result as a string or null if input is not a binary expression we support.
	 */
	private static String evaluateBinaryExpression(String input) {
		java.util.regex.Pattern expr = java.util.regex.Pattern.compile("^\\s*([+-]?\\d+[A-Za-z0-9]*?)\\s*\\+\\s*([+-]?\\d+[A-Za-z0-9]*?)\\s*$");
		java.util.regex.Matcher mm = expr.matcher(input);
		if (!mm.find()) return null;

		String left = mm.group(1);
		String right = mm.group(2);

		// parse operands using the same parsing logic
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");
		java.util.regex.Matcher lm = p.matcher(left);
		java.util.regex.Matcher rm = p.matcher(right);
		if (!lm.find() || !rm.find()) return null;

		String ld = lm.group(1);
		String lr = lm.group(2).trim();
		String rd = rm.group(1);
		String rr = rm.group(2).trim();

		String ltoken = extractToken(lr);
		String rtoken = extractToken(rr);
		// require tokens to match (same type) for now
		if (ltoken.isEmpty() || !ltoken.equals(rtoken)) return null;

		// validate operands
		validateTokenRange(ltoken, ld);
		validateTokenRange(rtoken, rd);

		java.math.BigInteger lv = new java.math.BigInteger(normalizeDigits(ld));
		java.math.BigInteger rv = new java.math.BigInteger(normalizeDigits(rd));
		java.math.BigInteger sum = lv.add(rv);

		// validate sum within range for token
		// reuse token range calculation
		// compute min/max for token
		boolean isUnsigned = ltoken.startsWith("U");
		int bits;
		try {
			bits = Integer.parseInt(ltoken.substring(1));
		} catch (NumberFormatException ex) {
			return sum.toString();
		}

		java.math.BigInteger min, max;
		if (isUnsigned) {
			min = java.math.BigInteger.ZERO;
			max = java.math.BigInteger.ONE.shiftLeft(bits).subtract(java.math.BigInteger.ONE);
		} else {
			min = java.math.BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = java.math.BigInteger.ONE.shiftLeft(bits - 1).subtract(java.math.BigInteger.ONE);
		}

		if (sum.compareTo(min) < 0 || sum.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + ltoken + ": " + sum.toString());
		}

		return sum.toString();
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
