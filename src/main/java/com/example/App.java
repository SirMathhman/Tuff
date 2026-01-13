package com.example;

import java.util.Optional;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	private static final java.util.Map<String, java.math.BigInteger[]> SUFFIX_RANGES;
	static {
		SUFFIX_RANGES = new java.util.HashMap<>();
		SUFFIX_RANGES.put(
			"U8",
			new java.math.BigInteger[] {
				java.math.BigInteger.ZERO,
				java.math.BigInteger.valueOf(255)
			}
		);
		SUFFIX_RANGES.put(
			"U16",
			new java.math.BigInteger[] {
				java.math.BigInteger.ZERO,
				java.math.BigInteger.valueOf(65535)
			}
		);
		java.math.BigInteger u32Max = java.math.BigInteger.ONE
			.shiftLeft(32)
			.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
			"U32",
			new java.math.BigInteger[] { java.math.BigInteger.ZERO, u32Max }
		);

		java.math.BigInteger u64Max = java.math.BigInteger.ONE
			.shiftLeft(64)
			.subtract(
				java.math.BigInteger.ONE
			);
		SUFFIX_RANGES.put(
			"U64",
			new java.math.BigInteger[] {
				java.math.BigInteger.ZERO,
				u64Max
			}
		);
		SUFFIX_RANGES.put(
			"I8",
			new java.math.BigInteger[] {
				java.math.BigInteger.valueOf(-128),
				java.math.BigInteger.valueOf(127)
			}
		);
		SUFFIX_RANGES.put(
			"I16",
			new java.math.BigInteger[] {
				java.math.BigInteger.valueOf(-32768),
				java.math.BigInteger.valueOf(32767)
			}
		);
		java.math.BigInteger i32Min = java.math.BigInteger.valueOf(-1).shiftLeft(31);
		java.math.BigInteger i32Max = java.math.BigInteger.valueOf(1).shiftLeft(31)
			.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
			"I32",
			new java.math.BigInteger[] { i32Min, i32Max }
		);
		java.math.BigInteger i64Min = java.math.BigInteger.valueOf(-1).shiftLeft(63);
		java.math.BigInteger i64Max = java.math.BigInteger.valueOf(1).shiftLeft(63)
			.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
			"I64",
			new java.math.BigInteger[] { i64Min, i64Max }
		);
	}

	/**
	 * Interpret the given string and return a Result containing the int or an error
	 * message.
	 * Current implementation parses decimal integers and tolerates
	 * trailing non-digit characters (e.g., "100U8" -> 100).
	 */
	public static Result<java.math.BigInteger, String> interpret(String input) {
		Optional<String> maybeInput = Optional.ofNullable(input);
		if (maybeInput.isEmpty()) {
			return Result.err("input missing");
		}
		String s = maybeInput.get().trim();
		int len = s.length();
		if (len == 0) {
			return Result.err("empty string");
		}
		int i = 0;
		// handle optional sign
		if (i < len && (s.charAt(i) == '+' || s.charAt(i) == '-')) {
			i++;
		}
		int startDigits = i;
		while (i < len && Character.isDigit(s.charAt(i))) {
			i++;
		}
		if (i == startDigits) {
			// no digits found at start
			return Result.err("For input string: \"" + s + "\"");
		}
		String numStr = s.substring(0, i);
		java.math.BigInteger value = new java.math.BigInteger(numStr);

		String suffix = s.substring(i);
		if (suffix.isEmpty()) {
			return Result.ok(value);
		}

		// Lookup suffix ranges in a map to reduce cyclomatic complexity
		if (SUFFIX_RANGES.containsKey(suffix)) {
			java.math.BigInteger[] range = SUFFIX_RANGES.get(suffix);
			java.math.BigInteger min = range[0];
			java.math.BigInteger max = range[1];
			if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
				return Result.err("value out of range for " + suffix);
			}
			return Result.ok(value);
		}

		// Unknown suffix: reject negative numbers with suffix, otherwise accept
		if (s.charAt(0) == '-' && !suffix.isEmpty()) {
			return Result.err("Negative numbers with suffix not supported");
		}
		return Result.ok(value);
	}

}