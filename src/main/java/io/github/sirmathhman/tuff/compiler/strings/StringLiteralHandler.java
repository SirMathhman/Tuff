package io.github.sirmathhman.tuff.compiler.strings;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import java.util.Map;

/**
 * Handles string literal detection and allocation.
 */
public final class StringLiteralHandler {
	private StringLiteralHandler() {
	}

	public static boolean isStringLiteral(String expr) {
		return expr.trim().startsWith("\"") && expr.trim().endsWith("\"");
	}

	public static Result<StringAllocationResult, CompileError> handleStringLiteral(
			String expr,
			Map<String, StringLiteralManager.StringAllocation> stringAllocations) {
		String trimmed = expr.trim();
		if (!isStringLiteral(trimmed)) {
			return Result.err(new CompileError("Not a string literal: " + expr));
		}

		// Extract string content (remove quotes and handle escapes)
		String content = trimmed.substring(1, trimmed.length() - 1);
		String unescaped = unescapeString(content);

		if (unescaped == null) {
			return Result.err(new CompileError("Invalid escape sequence in string: " + expr));
		}

		// Allocate the string
		Result<StringLiteralManager.StringAllocation, CompileError> allocationResult =
				StringLiteralManager.allocateString(unescaped, stringAllocations);

		if (allocationResult instanceof Result.Err<StringLiteralManager.StringAllocation, CompileError> err) {
			return Result.err(err.error());
		}

		StringLiteralManager.StringAllocation allocation =
				((Result.Ok<StringLiteralManager.StringAllocation, CompileError>) allocationResult).value();

		return Result.ok(new StringAllocationResult(allocation.address(), allocation.length()));
	}

	private static String unescapeString(String escaped) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < escaped.length(); i++) {
			char c = escaped.charAt(i);
			if (c == '\\' && i + 1 < escaped.length()) {
				char next = escaped.charAt(i + 1);
				switch (next) {
					case '0' -> sb.append('\0');
					case 'n' -> sb.append('\n');
					case 't' -> sb.append('\t');
					case 'r' -> sb.append('\r');
					case '\\' -> sb.append('\\');
					case '"' -> sb.append('"');
					case '\'' -> sb.append('\'');
					default -> {
						return null; // Invalid escape
					}
				}
				i++; // Skip the next character
			} else {
				sb.append(c);
			}
		}
		return sb.toString();
	}

	public record StringAllocationResult(int address, int length) {
	}
}
