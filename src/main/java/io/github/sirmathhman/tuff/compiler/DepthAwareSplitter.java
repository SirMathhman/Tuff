package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.lib.ArrayList;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class DepthAwareSplitter {
	private DepthAwareSplitter() {
	}

	/**
	 * Find the index of a semicolon at depth 0 in the given string,
	 * accounting for nested parentheses and braces.
	 *
	 * @param text       the text to search
	 * @param startIndex the index to start searching from
	 * @return the index of the semicolon, or -1 if not found
	 */
	public static int findSemicolonAtDepthZero(String text, int startIndex) {
		var depth = 0;
		for (var i = startIndex; i < text.length(); i++) {
			var c = text.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ';' && depth == 0) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Load a reference from memory and return it (for ending continuations).
	 *
	 * @param instructions the instruction list to add to
	 * @param refAddr      the address to load from
	 */
	public static void addLoadAndHalt(ArrayList<Instruction> instructions, long refAddr) {
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, refAddr));
		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
	}

	/**
	 * Find the matching closing brace for an opening brace.
	 *
	 * @param str          the string containing the braces
	 * @param openBraceIdx the index of the opening brace
	 * @return the index of the matching closing brace, or -1 if not found
	 */
	public static int findMatchingBrace(String str, int openBraceIdx) {
		var count = 1;
		for (var i = openBraceIdx + 1; i < str.length(); i++) {
			if (str.charAt(i) == '{')
				count++;
			else if (str.charAt(i) == '}') {
				count--;
				if (count == 0)
					return i;
			}
		}
		return -1;
	}

	/**
	 * Split an expression by a delimiter while respecting parenthesis depth.
	 *
	 * @param expr      The expression to split
	 * @param delimiter The character to split on
	 * @return A list of tokens separated by the delimiter
	 */
	public static ArrayList<String> splitByDelimiterAtDepthZero(String expr, char delimiter) {
		DelimiterChecker singleDelimiter = (c, i) -> c == delimiter;
		return splitWithDelimiterChecker(expr, singleDelimiter, 1);
	}

	/**
	 * Split by double-character delimiter (e.g., "||") at depth zero.
	 *
	 * @param expr       The expression to split
	 * @param delimiter1 First character of the delimiter
	 * @param delimiter2 Second character of the delimiter
	 * @return A list of tokens separated by the two-character delimiter
	 */
	public static ArrayList<String> splitByDoubleDelimiterAtDepthZero(String expr, char delimiter1,
			char delimiter2) {
		DelimiterChecker doubleDelimiter = (c, i) -> c == delimiter1 && i + 1 < expr.length()
				&& expr.charAt(i + 1) == delimiter2;
		return splitWithDelimiterChecker(expr, doubleDelimiter, 2);
	}

	@FunctionalInterface
	private interface DelimiterChecker {
		boolean isDelimiter(char c, int index);
	}

	/**
	 * Split by keyword (e.g., "is") at depth zero, ensuring word boundary.
	 *
	 * @param expr    The expression to split
	 * @param keyword The keyword to split by (e.g., "is")
	 * @return A list of tokens separated by the keyword
	 */
	public static ArrayList<String> splitByKeywordAtDepthZero(String expr, String keyword) {
		DelimiterChecker keywordChecker = (c, i) -> {
			if (i + keyword.length() > expr.length()) {
				return false;
			}
			if (!expr.substring(i, i + keyword.length()).equals(keyword)) {
				return false;
			}
			// Check word boundaries
			var validBefore = (i == 0 || !Character.isLetterOrDigit(expr.charAt(i - 1)));
			var validAfter = (i + keyword.length() >= expr.length()
												|| !Character.isLetterOrDigit(expr.charAt(i + keyword.length())));
			return validBefore && validAfter;
		};
		return splitWithDelimiterChecker(expr, keywordChecker, keyword.length());
	}

	private static ArrayList<String> splitWithDelimiterChecker(String expr, DelimiterChecker checker,
			int delimiterLength) {
		ArrayList<String> result = new ArrayList<>();
		var token = new StringBuilder();
		var depth = 0;
		var bracketDepth = 0;

		for (var i = 0; i < expr.length(); i++) {
			var c = expr.charAt(i);

			if (c == '(' || c == '{') {
				depth++;
				token.append(c);
			} else if (c == ')' || c == '}') {
				depth--;
				token.append(c);
			} else if (c == '[') {
				bracketDepth++;
				token.append(c);
			} else if (c == ']') {
				bracketDepth--;
				token.append(c);
			} else if (depth == 0 && bracketDepth == 0 && checker.isDelimiter(c, i)) {
				result.add(token.toString().trim());
				token = new StringBuilder();
				i += delimiterLength - 1;
			} else {
				token.append(c);
			}
		}

		if (token.length() > 0) {
			result.add(token.toString().trim());
		}

		return result;
	}
}
