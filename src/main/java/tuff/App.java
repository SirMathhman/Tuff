package tuff;

public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	public static String interpret(String input) {
		if (input == null || input.isEmpty())
			return "";
		java.util.regex.Pattern p = java.util.regex.Pattern.compile("^(\\d+)(.*)$");
		java.util.regex.Matcher m = p.matcher(input);
		if (!m.find()) return "";
		String digits = m.group(1);
		String rest = m.group(2);
		// If the token uses a U8 suffix, validate it's within 0..255
		if (rest.startsWith("U8")) {
			try {
				int val = Integer.parseInt(digits);
				if (val < 0 || val > 255) {
					throw new IllegalArgumentException("value out of range for U8: " + digits);
				}
			} catch (NumberFormatException ex) {
				throw new IllegalArgumentException("invalid number for U8: " + digits, ex);
			}
		}
		return digits;
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
