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

		// allow N-ary addition like "1U8 + 2U8 + 3U8"
		String[] parts = input.split("\\+");
		if (parts.length < 2) return null;

		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^([+-]?\\d+)(.*)$");

		String commonToken = null;
		java.math.BigInteger sum = java.math.BigInteger.ZERO;
		for (String part : parts) {
			String operand = part.trim();
			java.util.regex.Matcher om = p.matcher(operand);
			if (!om.find()) return null;
			String od = om.group(1);
			String or = om.group(2).trim();
			String otoken = extractToken(or);
			if (otoken.isEmpty()) return null;
			if (commonToken == null) commonToken = otoken;
			if (!commonToken.equals(otoken)) {
				throw new IllegalArgumentException("mismatched operand types: " + commonToken + " vs " + otoken);
			}

			// validate operand
			validateTokenRange(otoken, od);

			java.math.BigInteger ov = new java.math.BigInteger(normalizeDigits(od));
			sum = sum.add(ov);
		}

		// validate sum within range for token
		// reuse token range calculation
		// compute min/max for token
		boolean isUnsigned = commonToken.startsWith("U");
		int bits;
		try {
			bits = Integer.parseInt(commonToken.substring(1));
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
			throw new IllegalArgumentException("value out of range for " + commonToken + ": " + sum.toString());
		}

		return sum.toString();
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
