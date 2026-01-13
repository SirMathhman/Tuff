package com.example;

import java.util.Optional;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	/**
	 * Interpret the given string and return a Result containing the int or an error message.
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
		return Result.ok(Integer.parseInt(numStr));
	}
}