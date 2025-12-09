package tuff;

import java.math.BigInteger;

/**
 * Utility class for validating that numeric values fit within typed integer
 * ranges.
 * Supports unsigned (U8, U16, U32, U64) and signed (I8, I16, I32, I64) types.
 */
public final class TokenRange {

	/**
	 * Validate that a numeric value fits within the bit-width range of its token
	 * type.
	 * Throws IllegalArgumentException if value is out of range or token is invalid.
	 */
	public static void validateTokenRange(String token, String digits) {
		boolean isUnsigned = token.startsWith("U");
		boolean isSigned = token.startsWith("I");

		if (!isUnsigned && !isSigned)
			return; // unknown token type

		String numberForParse = normalizeDigits(digits);
		if (isUnsigned && numberForParse.startsWith("-")) {
			throw new IllegalArgumentException("negative value not allowed for " + token + ": " + digits);
		}

		BigInteger value;
		try {
			value = new BigInteger(numberForParse);
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

		BigInteger min, max;
		if (isUnsigned) {
			min = BigInteger.ZERO;
			max = BigInteger.ONE.shiftLeft(bits).subtract(BigInteger.ONE);
		} else {
			min = BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = BigInteger.ONE.shiftLeft(bits - 1).subtract(BigInteger.ONE);
		}

		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + token + ": " + digits);
		}
	}

	/**
	 * Check that a computed value fits within the range of its declared token type.
	 * Called after arithmetic operations to ensure results don't overflow.
	 */
	public static void checkValueInRange(String token, BigInteger value) {
		boolean isUnsigned = token.startsWith("U");
		boolean isSigned = token.startsWith("I");
		if (!isUnsigned && !isSigned)
			return;
		if (token.length() < 2)
			return;
		int bits;
		try {
			bits = Integer.parseInt(token.substring(1));
		} catch (NumberFormatException ex) {
			return;
		}
		BigInteger min, max;
		if (isUnsigned) {
			min = BigInteger.ZERO;
			max = BigInteger.ONE.shiftLeft(bits).subtract(BigInteger.ONE);
		} else {
			min = BigInteger.ONE.shiftLeft(bits - 1).negate();
			max = BigInteger.ONE.shiftLeft(bits - 1).subtract(BigInteger.ONE);
		}
		if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
			throw new IllegalArgumentException("value out of range for " + token + ": " + value.toString());
		}
	}

	private static String normalizeDigits(String digits) {
		return digits.startsWith("+") ? digits.substring(1) : digits;
	}
}
