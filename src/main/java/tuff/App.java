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

		// Accept an integer followed by an optional U8 suffix (e.g. "100U8").
		// Return only the integer portion when present.
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:U8)?$").matcher(input);
		if (m.matches()) {
			return m.group(1);
		}
		throw new IllegalArgumentException("interpret: non-empty non-integer input not supported");
	}
}
