package com.example;

public class App {
	public static void main(String[] args) {
		System.out.println("Hello from Tuff!");
		System.out.println("Java version: " + System.getProperty("java.version"));
	}

	/**
	 * Interpret the given string and return an int.
	 * Current implementation parses decimal integers and tolerates
	 * trailing non-digit characters (e.g., "100U8" -> 100).
	 */
	public static int interpret(String input) {
		if (input == null) {
			throw new NumberFormatException("null");
		}
		String s = input.trim();
		int len = s.length();
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
			throw new NumberFormatException("For input string: \"" + input + "\"");
		}
		String numStr = s.substring(0, i);
		return Integer.parseInt(numStr);
	}
}