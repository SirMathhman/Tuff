package io.github.sirmathhman.tuff.compiler;

public final class DepthAwareSplitter {
	private DepthAwareSplitter() {
	}

	/**
	 * Split an expression by a delimiter while respecting parenthesis depth.
	 *
	 * @param expr      The expression to split
	 * @param delimiter The character to split on
	 * @return A list of tokens separated by the delimiter
	 */
	public static java.util.List<String> splitByDelimiterAtDepthZero(String expr, char delimiter) {
		DelimiterChecker singleDelimiter = (c, i) -> c == delimiter;
		return splitWithDelimiterChecker(expr, singleDelimiter);
	}

	/**
	 * Split by double-character delimiter (e.g., "||") at depth zero.
	 *
	 * @param expr       The expression to split
	 * @param delimiter1 First character of the delimiter
	 * @param delimiter2 Second character of the delimiter
	 * @return A list of tokens separated by the two-character delimiter
	 */
	public static java.util.List<String> splitByDoubleDelimiterAtDepthZero(String expr, char delimiter1,
			char delimiter2) {
		DelimiterChecker doubleDelimiter = (c, i) -> c == delimiter1 && i + 1 < expr.length()
				&& expr.charAt(i + 1) == delimiter2;
		return splitWithDelimiterChecker(expr, doubleDelimiter);
	}

	private static java.util.List<String> splitWithDelimiterChecker(String expr, DelimiterChecker checker) {
		java.util.List<String> result = new java.util.ArrayList<>();
		StringBuilder token = new StringBuilder();
		int depth = 0;

		for (int i = 0; i < expr.length(); i++) {
			char c = expr.charAt(i);

			if (c == '(' || c == '{') {
				depth++;
				token.append(c);
			} else if (c == ')' || c == '}') {
				depth--;
				token.append(c);
			} else if (checker.isDelimiter(c, i) && depth == 0) {
				result.add(token.toString().trim());
				token = new StringBuilder();
				// Skip second character of double delimiter
				// For == and ||, second char equals first char
				// For !=, second char is = but first is !
				// For <=, second char is = but first is <
				if (i + 1 < expr.length()) {
					char nextChar = expr.charAt(i + 1);
					if (nextChar == c || (c == '!' && nextChar == '=') || (c == '<' && nextChar == '=')) {
						i++;
					}
				}
			} else {
				token.append(c);
			}
		}

		if (token.length() > 0) {
			result.add(token.toString().trim());
		}

		return result;
	}

	@FunctionalInterface
	private interface DelimiterChecker {
		boolean isDelimiter(char c, int index);
	}
}
