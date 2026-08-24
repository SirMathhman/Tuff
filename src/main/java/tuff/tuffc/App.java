package tuff.tuffc;

/**
 * Simple entry point for the tuffc project.
 */
public class App {

	public static void main(String[] args) {
		System.out.println(greeting());
	}

	/**
	 * @return a friendly greeting
	 */
	public static String greeting() {
		return "Hello, Maven!";
	}

	/**
	 * Evaluates an expression.
	 *
	 * @param expression the expression to evaluate
	 * @return the numeric value of the expression
	 * @throws UnsupportedOperationException for expressions that are not a
	 *                                       {@code return <int>;} statement
	 */
	public static int evaluate(String expression) {
		if (expression == null || expression.isEmpty()) {
			return 0;
		}
		String trimmed = expression.trim();
		if (trimmed.startsWith("return ") && trimmed.endsWith(";")) {
			String value = trimmed.substring("return ".length(), trimmed.length() - 1).trim();
			return Integer.parseInt(value);
		}
		throw new UnsupportedOperationException("evaluate is not implemented for: " + expression);
	}
}
