package tuff;

public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty()) return "";
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^\\d+").matcher(input);
		return m.find() ? m.group(0) : "";
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
