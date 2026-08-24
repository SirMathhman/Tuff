package tuff.tuffc;

import java.util.HashMap;
import java.util.Map;

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
	 * Evaluates a program consisting of {@code let <name> = <int>;} statements
	 * followed by a {@code return <value>;} statement, where {@code <value>} is
	 * an integer literal or a previously declared variable name.
	 *
	 * @param expression the program to evaluate
	 * @return the numeric value of the return statement
	 * @throws UnsupportedOperationException for unsupported statements
	 */
	public static int evaluate(String expression) {
		if (expression == null || expression.isEmpty()) {
			return 0;
		}
		Map<String, Integer> variables = new HashMap<>();
		int result = 0;
		for (String statement : expression.split(";")) {
			String trimmed = statement.trim();
			if (trimmed.isEmpty()) {
				continue;
			}
			if (trimmed.startsWith("let ")) {
				String body = trimmed.substring("let ".length()).trim();
				int eq = body.indexOf('=');
				if (eq < 0) {
					throw new UnsupportedOperationException("Invalid let statement: " + trimmed);
				}
				String name = body.substring(0, eq).trim();
				variables.put(name, Integer.parseInt(body.substring(eq + 1).trim()));
			} else if (trimmed.startsWith("return ")) {
				String value = trimmed.substring("return ".length()).trim();
				result = resolve(value, variables);
			} else {
				throw new UnsupportedOperationException("Unsupported statement: " + trimmed);
			}
		}
		return result;
	}

	private static int resolve(String value, Map<String, Integer> variables) {
		if (variables.containsKey(value)) {
			return variables.get(value);
		}
		return Integer.parseInt(value);
	}
}
