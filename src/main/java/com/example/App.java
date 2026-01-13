package com.example;

import java.util.Optional;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff!");
		System.out.println("Java version: " + System.getProperty("java.version"));
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
			return Result.err("null");
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

		// Unsigned ranges
		switch (suffix) {
			case "U8": {
				java.math.BigInteger min = java.math.BigInteger.ZERO;
				java.math.BigInteger max = java.math.BigInteger.valueOf(255);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for U8");
				}
				return Result.ok(value);
			}
			case "U16": {
				java.math.BigInteger min = java.math.BigInteger.ZERO;
				java.math.BigInteger max = java.math.BigInteger.valueOf(65535);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for U16");
				}
				return Result.ok(value);
			}
			case "U32": {
				java.math.BigInteger min = java.math.BigInteger.ZERO;
				java.math.BigInteger max = java.math.BigInteger.ONE.shiftLeft(32).subtract(java.math.BigInteger.ONE);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for U32");
				}
				return Result.ok(value);
			}
			case "U64": {
				java.math.BigInteger min = java.math.BigInteger.ZERO;
				java.math.BigInteger max = java.math.BigInteger.ONE.shiftLeft(64).subtract(java.math.BigInteger.ONE);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for U64");
				}
				return Result.ok(value);
			}

			// Signed ranges
			case "I8": {
				java.math.BigInteger min = java.math.BigInteger.valueOf(-128);
				java.math.BigInteger max = java.math.BigInteger.valueOf(127);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for I8");
				}
				return Result.ok(value);
			}
			case "I16": {
				java.math.BigInteger min = java.math.BigInteger.valueOf(-32768);
				java.math.BigInteger max = java.math.BigInteger.valueOf(32767);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for I16");
				}
				return Result.ok(value);
			}
			case "I32": {
				java.math.BigInteger min = java.math.BigInteger.valueOf(-1).shiftLeft(31);
				java.math.BigInteger max = java.math.BigInteger.valueOf(1).shiftLeft(31).subtract(java.math.BigInteger.ONE);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for I32");
				}
				return Result.ok(value);
			}
			case "I64": {
				java.math.BigInteger min = java.math.BigInteger.valueOf(-1).shiftLeft(63);
				java.math.BigInteger max = java.math.BigInteger.valueOf(1).shiftLeft(63).subtract(java.math.BigInteger.ONE);
				if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
					return Result.err("value out of range for I64");
				}
				return Result.ok(value);
			}
			default: {
				// For unknown suffixes, reject if the original had a sign and trailing content
				if (s.charAt(0) == '-' && !suffix.isEmpty()) {
					return Result.err("Negative numbers with suffix not supported");
				}
				return Result.ok(value);
			}
		}
	}

}