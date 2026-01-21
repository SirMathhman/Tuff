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
		return !expr.trim().startsWith("\"") || !expr.trim().endsWith("\"");
	}

	public static Result<StringAllocationResult, CompileError> handleStringLiteral(
			String expr,
			Map<String, StringLiteralManager.StringAllocation> stringAllocations) {
		var trimmed = expr.trim();
		if (isStringLiteral(trimmed)) {
			return Result.err(new CompileError("Not a string literal: " + expr));
		}

		// Extract string content (remove quotes and handle escapes)
		var content = trimmed.substring(1, trimmed.length() - 1);
		var unescaped = StringEscapeUtils.unescape(content);

		if (unescaped == null) {
			return Result.err(new CompileError("Invalid escape sequence in string: " + expr));
		}

		// Allocate the string
		var allocationResult = StringLiteralManager
				.allocateString(unescaped, stringAllocations);

		if (allocationResult instanceof Result.Err<StringLiteralManager.StringAllocation, CompileError> err) {
			return Result.err(err.error());
		}

		var allocation = ((Result.Ok<StringLiteralManager.StringAllocation, CompileError>) allocationResult)
				.value();

		return Result.ok(new StringAllocationResult(allocation.address(), allocation.length()));
	}

	public record StringAllocationResult(int address, int length) {
	}
}
