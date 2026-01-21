package io.github.sirmathhman.tuff.compiler.strings;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;

/**
 * Handles string indexing expressions like "test"[0] to extract character
 * codes.
 */
public final class StringIndexingHandler {
	private StringIndexingHandler() {
	}

	/**
	 * Parse string indexing: "string"[index] -> character code at index
	 * Returns the character code (long value) or an error if parsing fails.
	 */
	public static Result<Long, CompileError> parseStringIndexing(String literal) {
		// Pattern: "string"[index]
		// Find the closing quote of the string
		var quoteStart = literal.indexOf('"');
		if (quoteStart == -1) {
			return Result.err(new CompileError("No opening quote found in string indexing"));
		}

		var quoteEnd = -1;
		var escaped = false;
		for (var i = quoteStart + 1; i < literal.length(); i++) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (literal.charAt(i) == '\\') {
				escaped = true;
				continue;
			}
			if (literal.charAt(i) == '"') {
				quoteEnd = i;
				break;
			}
		}

		if (quoteEnd == -1) {
			return Result.err(new CompileError("No closing quote found in string indexing"));
		}

		// Check for [index] pattern after the closing quote
		var afterQuote = literal.substring(quoteEnd + 1).trim();
		if (!afterQuote.startsWith("[") || !afterQuote.endsWith("]")) {
			return Result.err(new CompileError("Expected [index] after string literal"));
		}

		// Extract the index
		var indexStr = afterQuote.substring(1, afterQuote.length() - 1).trim();
		int index;
		try {
			index = Integer.parseInt(indexStr);
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Invalid index in string indexing: " + indexStr));
		}

		// Extract and unescape the string content
		var stringContent = literal.substring(quoteStart + 1, quoteEnd);
		var unescaped = StringEscapeUtils.unescape(stringContent);

		if (unescaped == null) {
			return Result.err(new CompileError("Invalid escape sequence in string: " + literal));
		}

		// Check bounds
		if (index < 0 || index >= unescaped.length()) {
			return Result.err(new CompileError(
					"String index " + index + " out of bounds (string length " + unescaped.length() + ")"));
		}

		// Return the character code at the index
		var ch = unescaped.charAt(index);
		return Result.ok((long) ch);
	}
}
