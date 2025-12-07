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

		// Special-case numeric literal "100" — return as-is
		// If the input is a signed integer string (e.g. 123, -7, +0) return as-is
		if (input.matches("[-+]?\\d+")) {
			return input;
		}

		// Accept an integer followed by an optional integer width/type suffix.
		// Supported suffixes: U8, U16, U32, U64, I8, I16, I32, I64.
		// If present, return only the integer portion.
		java.util.regex.Matcher m = java.util.regex.Pattern
				.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64))?$")
				.matcher(input);
		if (m.matches()) {
			String number = m.group(1);
			String unsignedOrSigned = m.group(2); // either "U" or "I" when present

			// Disallow negative numbers with unsigned suffixes (e.g. "-100U8")
			if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
				throw new IllegalArgumentException("unsigned type with negative value");
			}

			// If a width suffix is present, validate the numeric range for that width.
			String width = m.group(3); // one of 8,16,32,64 or null
			if (width != null) {
				java.math.BigInteger value = new java.math.BigInteger(number);
				switch (width) {
					case "8":
						if ("U".equals(unsignedOrSigned)) {
							if (value.compareTo(java.math.BigInteger.ZERO) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(255)) > 0) {
								throw new IllegalArgumentException("value out of range for U8");
							}
						} else {
							if (value.compareTo(java.math.BigInteger.valueOf(-128)) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(127)) > 0) {
								throw new IllegalArgumentException("value out of range for I8");
							}
						}
						break;
					case "16":
						if ("U".equals(unsignedOrSigned)) {
							if (value.compareTo(java.math.BigInteger.ZERO) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(65535)) > 0) {
								throw new IllegalArgumentException("value out of range for U16");
							}
						} else {
							if (value.compareTo(java.math.BigInteger.valueOf(-32768)) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(32767)) > 0) {
								throw new IllegalArgumentException("value out of range for I16");
							}
						}
						break;
					case "32":
						if ("U".equals(unsignedOrSigned)) {
							java.math.BigInteger maxU32 = new java.math.BigInteger("4294967295");
							if (value.compareTo(java.math.BigInteger.ZERO) < 0 || value.compareTo(maxU32) > 0) {
								throw new IllegalArgumentException("value out of range for U32");
							}
						} else {
							if (value.compareTo(java.math.BigInteger.valueOf(Integer.MIN_VALUE)) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(Integer.MAX_VALUE)) > 0) {
								throw new IllegalArgumentException("value out of range for I32");
							}
						}
						break;
					case "64":
						if ("U".equals(unsignedOrSigned)) {
							java.math.BigInteger maxU64 = new java.math.BigInteger("18446744073709551615");
							if (value.compareTo(java.math.BigInteger.ZERO) < 0 || value.compareTo(maxU64) > 0) {
								throw new IllegalArgumentException("value out of range for U64");
							}
						} else {
							if (value.compareTo(java.math.BigInteger.valueOf(Long.MIN_VALUE)) < 0
									|| value.compareTo(java.math.BigInteger.valueOf(Long.MAX_VALUE)) > 0) {
								throw new IllegalArgumentException("value out of range for I64");
							}
						}
						break;
					default:
						break;
				}
			}

			return number;
		}
		throw new IllegalArgumentException("interpret: non-empty non-integer input not supported");
	}
}
