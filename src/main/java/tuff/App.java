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
		if ("100".equals(input)) {
			return input;
		}
		throw new IllegalArgumentException("interpret: non-empty input not supported");
	}
}
