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
					return new java.math.BigInteger[]{java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(255)};
				}
				return new java.math.BigInteger[]{java.math.BigInteger.valueOf(-128), java.math.BigInteger.valueOf(127)};
			case "16":
				if (isUnsigned) {
					return new java.math.BigInteger[]{java.math.BigInteger.ZERO, java.math.BigInteger.valueOf(65535)};
				}
				return new java.math.BigInteger[]{java.math.BigInteger.valueOf(-32768), java.math.BigInteger.valueOf(32767)};
			case "32":
				if (isUnsigned) {
					return new java.math.BigInteger[]{java.math.BigInteger.ZERO, new java.math.BigInteger("4294967295")};
				}
				return new java.math.BigInteger[]{java.math.BigInteger.valueOf(Integer.MIN_VALUE), java.math.BigInteger.valueOf(Integer.MAX_VALUE)};
			case "64":
				if (isUnsigned) {
					return new java.math.BigInteger[]{java.math.BigInteger.ZERO, new java.math.BigInteger("18446744073709551615")};
				}
				return new java.math.BigInteger[]{java.math.BigInteger.valueOf(Long.MIN_VALUE), java.math.BigInteger.valueOf(Long.MAX_VALUE)};
			default:
				return new java.math.BigInteger[]{java.math.BigInteger.ZERO.negate(), java.math.BigInteger.ZERO};
		}
	}
}
