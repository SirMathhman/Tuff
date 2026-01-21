package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import java.util.Map;

public final class FieldAccessHandler {
	private FieldAccessHandler() {
	}

	public static boolean hasFieldAccess(String expr) {
		return expr.contains(".");
	}

	public static Result<FieldAccessResult, CompileError> parseFieldAccess(String expr,
			Map<String, StructDefinition> structRegistry) {
		// expr should start with . or contain a dot for field access
		var dotPos = expr.indexOf('.');

		if (dotPos < 0) {
			return Result.err(new CompileError("Invalid field access: no dot found"));
		}

		if (dotPos == expr.length() - 1) {
			return Result.err(new CompileError("Invalid field access: missing field name"));
		}

		// Extract field name after dot
		var afterDot = expr.substring(dotPos + 1);
		var fieldNameEnd = 0;

		while (fieldNameEnd < afterDot.length() && Character.isJavaIdentifierPart(afterDot.charAt(fieldNameEnd))) {
			fieldNameEnd++;
		}

		var fieldName = afterDot.substring(0, fieldNameEnd);
		if (fieldName.isEmpty()) {
			return Result.err(new CompileError("Invalid field name"));
		}

		var remaining = afterDot.substring(fieldNameEnd).trim();

		return Result.ok(new FieldAccessResult(fieldName, expr.substring(0, dotPos).trim(), remaining));
	}

	public record FieldAccessResult(String fieldName, String baseExpr, String remaining) {
	}
}
