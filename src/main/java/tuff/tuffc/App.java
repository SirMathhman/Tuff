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
	 * @throws UnsupportedOperationException for non-empty expressions (not yet
	 *                                       implemented)
	 */
	public static int evaluate(String expression) {
		if (expression == null || expression.isEmpty()) {
			return 0;
		}
		throw new UnsupportedOperationException("evaluate is not implemented for non-empty expressions");
	}
}
