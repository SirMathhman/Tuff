package tuff.parse.java;

import tuff.ast.SourceSpan;

import java.util.ArrayList;
import java.util.List;

/**
 * Tiny lexer for the Java subset supported by this project.
 *
 * Notes:
 * - Skips whitespace.
 * - Skips // line comments and /* block comments *\/.
 * - Does NOT implement Java text blocks ("""..."""); triple quotes will be
 * tokenized as regular strings.
 */
public final class JavaLexer {
	public List<JavaToken> lex(String input) {
		List<JavaToken> tokens = new ArrayList<>();
		int i = 0;
		while (i < input.length()) {
			char c = input.charAt(i);

			// whitespace
			if (Character.isWhitespace(c)) {
				i++;
				continue;
			}

			// comments (must be checked before operators)
			if (c == '/' && i + 1 < input.length()) {
				char n = input.charAt(i + 1);
				if (n == '/') {
					i = consumeLineComment(input, i);
					continue;
				}
				if (n == '*') {
					i = consumeBlockComment(input, i);
					continue;
				}
			}

			// string literal
			if (c == '"') {
				int start = i;
				i = consumeQuoted(input, i, '"');
				tokens.add(new JavaToken(JavaTokenType.STRING, input.substring(start, i), new SourceSpan(start, i)));
				continue;
			}

			// char literal
			if (c == '\'') {
				int start = i;
				i = consumeQuoted(input, i, '\'');
				tokens.add(new JavaToken(JavaTokenType.CHAR, input.substring(start, i), new SourceSpan(start, i)));
				continue;
			}

			// identifier (project subset: letter, then letter/digit)
			if (Character.isLetter(c)) {
				int start = i;
				i++;
				while (i < input.length()) {
					char ch = input.charAt(i);
					if (Character.isLetter(ch) || Character.isDigit(ch)) {
						i++;
					} else {
						break;
					}
				}
				tokens.add(new JavaToken(JavaTokenType.IDENT, input.substring(start, i), new SourceSpan(start, i)));
				continue;
			}

			// number
			if (Character.isDigit(c)) {
				int start = i;
				i++;
				while (i < input.length() && Character.isDigit(input.charAt(i))) {
					i++;
				}
				tokens.add(new JavaToken(JavaTokenType.NUMBER, input.substring(start, i), new SourceSpan(start, i)));
				continue;
			}

			// multi-char symbols/operators
			String two = (i + 1 < input.length()) ? input.substring(i, i + 2) : "";
			if (two.equals("->") || two.equals("::") || two.equals(">=") || two.equals("==") || two.equals("!=") ||
					two.equals("&&") || two.equals("||") || two.equals("++") || two.equals("--")) {
				int start = i;
				i += 2;
				tokens.add(new JavaToken(JavaTokenType.SYMBOL, two, new SourceSpan(start, i)));
				continue;
			}

			// single-char symbol
			int start = i;
			i++;
			tokens.add(new JavaToken(JavaTokenType.SYMBOL, String.valueOf(c), new SourceSpan(start, i)));
		}

		tokens.add(new JavaToken(JavaTokenType.EOF, "", new SourceSpan(input.length(), input.length())));
		return tokens;
	}

	private static int consumeLineComment(String input, int start) {
		int i = start + 2;
		while (i < input.length()) {
			char c = input.charAt(i);
			if (c == '\n') {
				return i + 1;
			}
			if (c == '\r') {
				// handle CRLF
				if (i + 1 < input.length() && input.charAt(i + 1) == '\n') {
					return i + 2;
				}
				return i + 1;
			}
			i++;
		}
		return i;
	}

	private static int consumeBlockComment(String input, int start) {
		int i = start + 2;
		while (i < input.length()) {
			if (input.charAt(i) == '*' && i + 1 < input.length() && input.charAt(i + 1) == '/') {
				return i + 2;
			}
			i++;
		}
		return i;
	}

	private static int consumeQuoted(String input, int start, char quote) {
		int i = start + 1;
		while (i < input.length()) {
			char c = input.charAt(i);
			if (c == '\\') {
				// skip escaped character if present
				i = Math.min(i + 2, input.length());
				continue;
			}
			if (c == quote) {
				return i + 1;
			}
			i++;
		}
		return i;
	}
}
