package tuff;

public final class TypeUtils {
	private TypeUtils() {
		// Utility class
	}

	public static boolean isSignedInteger(String s) {
		return s != null && s.matches("[-+]?\\d+");
	}

	public static String[] combineKinds(Operand a, Operand b) {
		String aKind = (a.unsignedOrSigned != null && a.width != null) ? a.unsignedOrSigned + a.width : null;
		String bKind = (b.unsignedOrSigned != null && b.width != null) ? b.unsignedOrSigned + b.width : null;
		if (aKind != null && bKind != null) {
			if (!aKind.equals(bKind))
				throw new IllegalArgumentException("mixed typed operands not supported");
			return new String[] { a.unsignedOrSigned, a.width };
		}
		if (aKind != null)
			return new String[] { a.unsignedOrSigned, a.width };
		if (bKind != null)
			return new String[] { b.unsignedOrSigned, b.width };
		return new String[] { null, null };
	}

	public static String singleTypedKind(java.util.List<Operand> operands) {
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

	public static void validateRange(String number, String unsignedOrSigned, String width) {
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
			case "Size":
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

	public static java.math.BigInteger computeBinaryOp(java.math.BigInteger a, java.math.BigInteger b, String op) {
		if (("/".equals(op) || "%".equals(op)) && java.math.BigInteger.ZERO.equals(b)) {
			throw new IllegalArgumentException("division by zero");
		}
		if ("+".equals(op)) {
			return a.add(b);
		}
		if ("-".equals(op)) {
			return a.subtract(b);
		}
		if ("*".equals(op)) {
			return a.multiply(b);
		}
		if ("/".equals(op)) {
			return a.divide(b);
		}
		if ("%".equals(op)) {
			return a.remainder(b);
		}
		throw new IllegalArgumentException("unknown operator " + op);
	}
}
