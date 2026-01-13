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
	public static Result<Integer, String> interpret(String input) {
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
		boolean negative = false;
		if (i < len && (s.charAt(i) == '+' || s.charAt(i) == '-')) {
			negative = (s.charAt(i) == '-');
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
		// If negative and there is trailing non-digit content, reject
		if (negative && i < len) {
			return Result.err("Negative numbers with suffix not supported");
		}
		String numStr = s.substring(0, i);
		int value = Integer.parseInt(numStr);

		String suffix = s.substring(i);
		if (suffix.isEmpty()) {
			return Result.ok(value);
		}

		// Handle unsigned 8-bit suffix: value must be in [0,255]
		if ("U8".equals(suffix)) {
			if (value < 0 || value > 255) {
				return Result.err("value out of range for U8");
			}
			return Result.ok(value);
		}

		// Unknown suffixes are accepted by ignoring them (legacy behavior)
		return Result.ok(value);
	}
}