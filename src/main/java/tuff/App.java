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

		// Simple addition expressions, possibly chained, like "100U8 + 50U8" or "1U8 +
		// 2U8 + 3U8"
		if (input.contains("+")) {
			String[] parts = input.split("\\s*\\+\\s*");
			if (parts.length > 1) {
				return evaluateAddition(parts);
			}
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

		// If all operands share exact signedness and width, validate sum fits that
		// range
		boolean allSameType = true;
		String refSign = operands.get(0).unsignedOrSigned;
		String refWidth = operands.get(0).width;
		for (Operand op : operands) {
			if ((refSign == null) ^ (op.unsignedOrSigned == null)) {
				allSameType = false;
				break;
			}
			if ((refWidth == null) ^ (op.width == null)) {
				allSameType = false;
				break;
			}
			if (refSign != null && !refSign.equals(op.unsignedOrSigned)) {
				allSameType = false;
				break;
			}
			if (refWidth != null && !refWidth.equals(op.width)) {
				allSameType = false;
				break;
			}
		}

		if (allSameType && refWidth != null) {
			validateRange(sum.toString(), refSign, refWidth);
		}

		return sum.toString();
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
}
