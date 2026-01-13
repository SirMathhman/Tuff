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
				});
		SUFFIX_RANGES.put(
				"U16",
				new java.math.BigInteger[] {
						java.math.BigInteger.ZERO,
						java.math.BigInteger.valueOf(65535)
				});
		java.math.BigInteger u32Max = java.math.BigInteger.ONE
				.shiftLeft(32)
				.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
				"U32",
				new java.math.BigInteger[] { java.math.BigInteger.ZERO, u32Max });

		java.math.BigInteger u64Max = java.math.BigInteger.ONE
				.shiftLeft(64)
				.subtract(
						java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
				"U64",
				new java.math.BigInteger[] {
						java.math.BigInteger.ZERO,
						u64Max
				});
		SUFFIX_RANGES.put(
				"I8",
				new java.math.BigInteger[] {
						java.math.BigInteger.valueOf(-128),
						java.math.BigInteger.valueOf(127)
				});
		SUFFIX_RANGES.put(
				"I16",
				new java.math.BigInteger[] {
						java.math.BigInteger.valueOf(-32768),
						java.math.BigInteger.valueOf(32767)
				});
		java.math.BigInteger i32Min = java.math.BigInteger.valueOf(-1).shiftLeft(31);
		java.math.BigInteger i32Max = java.math.BigInteger.valueOf(1).shiftLeft(31)
				.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
				"I32",
				new java.math.BigInteger[] { i32Min, i32Max });
		java.math.BigInteger i64Min = java.math.BigInteger.valueOf(-1).shiftLeft(63);
		java.math.BigInteger i64Max = java.math.BigInteger.valueOf(1).shiftLeft(63)
				.subtract(java.math.BigInteger.ONE);
		SUFFIX_RANGES.put(
				"I64",
				new java.math.BigInteger[] { i64Min, i64Max });
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
		if (s.contains("+")) {
			// simple binary addition: left + right
			String[] parts = s.split("\\+", 2);
			if (parts.length != 2) {
				return Result.err("invalid expression");
			}
			Result<Operand, String> left = parseOperand(parts[0].trim());
			if (left.isErr()) {
				return Result.err(left.getError());
			}
			Result<Operand, String> right = parseOperand(parts[1].trim());
			if (right.isErr()) {
				return Result.err(right.getError());
			}
			Operand L = left.get();
			Operand R = right.get();
			// require matching suffix or both empty
			if (!L.suffix.equals(R.suffix)) {
				return Result.err("mismatched suffixes");
			}
			java.math.BigInteger sum = L.value.add(R.value);
			if (L.suffix.isEmpty()) {
				return Result.ok(sum);
			}
			// validate result against suffix range
			java.math.BigInteger[] range = SUFFIX_RANGES.get(L.suffix);
			if (range != null) {
				if (sum.compareTo(range[0]) < 0 || sum.compareTo(range[1]) > 0) {
					return Result.err("value out of range for " + L.suffix);
				}
			}
			return Result.ok(sum);
		}
		// single value
		return parseOperand(s).map(o -> o.value).isOk() ? Result.ok(parseOperand(s).get().value)
			: Result.err(parseOperand(s).getError());
	}

	private static final class Operand {
		final java.math.BigInteger value;
		final String suffix;
		Operand(java.math.BigInteger v, String s) {
			this.value = v;
			this.suffix = s;
		}
	}

	private static Result<Operand, String> parseOperand(String s) {
		if (s == null) {
			return Result.err("input missing");
		}
		String str = s.trim();
		if (str.length() == 0) {
			return Result.err("empty string");
		}
		int i = 0;
		boolean negative = false;
		if (i < str.length() && (str.charAt(i) == '+' || str.charAt(i) == '-')) {
			negative = (str.charAt(i) == '-');
			i++;
		}
		int startDigits = i;
		while (i < str.length() && Character.isDigit(str.charAt(i))) {
			i++;
		}
		if (i == startDigits) {
			return Result.err("For input string: \"" + str + "\"");
		}
		String numStr = str.substring(startDigits, i);
		java.math.BigInteger value = new java.math.BigInteger((negative ? "-" : "") + numStr);
		String suffix = str.substring(i);
		if (!suffix.isEmpty()) {
			// allow negative only for signed suffixes (I8,I16,I32,I64)
			if (negative && suffix.startsWith("U")) {
				return Result.err("Negative numbers with suffix not supported");
			}
			if (SUFFIX_RANGES.containsKey(suffix)) {
				java.math.BigInteger[] range = SUFFIX_RANGES.get(suffix);
				if (value.compareTo(range[0]) < 0 || value.compareTo(range[1]) > 0) {
					return Result.err("value out of range for " + suffix);
				}
			}
		}
		return Result.ok(new Operand(value, suffix));
	}

}