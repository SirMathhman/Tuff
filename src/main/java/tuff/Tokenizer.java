package tuff;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lexical analyzer for the typed integer expression language.
 * Converts input strings into tokens for parsing and evaluation.
 */
public final class Tokenizer {

	/**
	 * Tokenize an input string into a list of tokens.
	 * Supports operators (+, -, *), parentheses/braces for grouping,
	 * numeric literals with type suffixes, and identifiers.
	 * Returns null if tokenization fails (e.g., mismatched braces).
	 */
	public static List<String> tokenize(String input) {
		List<String> tokens = new ArrayList<>();
		int i = 0;
		while (i < input.length()) {
			char c = input.charAt(i);
			if (Character.isWhitespace(c)) {
				i++;
				continue;
			}
			if (c == '(' || c == ')') {
				tokens.add(String.valueOf(c));
				i++;
				continue;
			}
			if (c == '{') {
				// extract full block including nested braces as a single token
				int depth = 1;
				int j = i + 1;
				for (; j < input.length(); j++) {
					char cc = input.charAt(j);
					if (cc == '{')
						depth++;
					else if (cc == '}') {
						depth--;
						if (depth == 0)
							break;
					}
				}
				if (j >= input.length())
					return null; // mismatched brace
				String block = input.substring(i, j + 1);
				tokens.add(block);
				i = j + 1;
				continue;
			}
			if (c == '}') {
				return null; // stray closing brace
			}
			if (isStandaloneOperator(input, i)) {
				tokens.add(String.valueOf(c));
				i++;
				continue;
			}
			// operand: either signed/unsigned digits with optional suffix, or an identifier
			Matcher m = Pattern.compile("[+-]?\\d+[A-Za-z0-9]*|[A-Za-z_][A-Za-z0-9_]*")
					.matcher(input.substring(i));
			if (!m.lookingAt())
				return null;
			String tok = m.group();
			tokens.add(tok);
			i += tok.length();
		}
		return tokens;
	}

	private static boolean isStandaloneOperator(String input, int i) {
		char c = input.charAt(i);
		if (c == '*')
			return true;
		if ((c == '+' || c == '-') && i + 1 < input.length() && Character.isDigit(input.charAt(i + 1))) {
			return false; // Leading sign, not operator
		}
		return c == '+' || c == '-';
	}
}
