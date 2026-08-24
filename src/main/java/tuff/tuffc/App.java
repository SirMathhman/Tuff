package tuff.tuffc;

import java.util.HashMap;
import java.util.Map;

import tuff.tuffc.error.Diagnostic;
import tuff.tuffc.error.ErrorKind;
import tuff.tuffc.error.Result;

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
	 * followed by a single {@code return <value>;} statement, where
	 * {@code <value>} is an integer literal or a previously declared variable
	 * name.
	 *
	 * <p>
	 * No production code path throws; every failure is returned as a
	 * structured {@link Diagnostic} inside the {@link Result}.
	 *
	 * @param expression the program to evaluate
	 * @return the numeric value of the return statement, or a diagnostic
	 */
	public static Result<Integer> evaluate(String expression) {
		if (expression == null || expression.isEmpty()) {
			return Result.fail(new Diagnostic(ErrorKind.EMPTY_PROGRAM, "", "The program is empty."));
		}
		Map<String, Integer> variables = new HashMap<>();
		for (String statement : expression.split(";")) {
			String trimmed = statement.trim();
			if (trimmed.isEmpty()) {
				continue;
			}
			if (trimmed.startsWith("let ")) {
				String body = trimmed.substring("let ".length()).trim();
				int eq = body.indexOf('=');
				if (eq < 0) {
					return Result.fail(new Diagnostic(ErrorKind.INVALID_LET_STATEMENT, trimmed,
							"Missing '=' in let statement."));
				}
				String name = body.substring(0, eq).trim();
				String valueText = body.substring(eq + 1).trim();
				Integer value = parseInteger(valueText);
				if (value == null) {
					return Result.fail(new Diagnostic(ErrorKind.INVALID_INTEGER, trimmed,
							"'" + valueText + "' is not a valid integer."));
				}
				variables.put(name, value);
			} else if (trimmed.startsWith("return ")) {
				String value = trimmed.substring("return ".length()).trim();
				Integer resolved = resolve(value, variables);
				if (resolved == null) {
					return Result.fail(new Diagnostic(ErrorKind.UNDEFINED_VARIABLE, trimmed,
							"'" + value + "' is not a declared variable or integer."));
				}
				return Result.ok(resolved);
			} else {
				return Result.fail(new Diagnostic(ErrorKind.UNSUPPORTED_STATEMENT, trimmed,
						"Statement is not a 'let' or 'return' statement."));
			}
		}
		return Result.fail(new Diagnostic(ErrorKind.UNSUPPORTED_STATEMENT, expression,
				"The program has no 'return <value>;' statement."));
	}

	private static Integer resolve(String value, Map<String, Integer> variables) {
		if (variables.containsKey(value)) {
			return variables.get(value);
		}
		return parseInteger(value);
	}

	private static Integer parseInteger(String text) {
		try {
			return Integer.parseInt(text);
		} catch (NumberFormatException e) {
			return null;
		}
	}
}
