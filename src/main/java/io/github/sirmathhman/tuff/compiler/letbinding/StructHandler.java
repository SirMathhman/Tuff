package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class StructHandler {
	private StructHandler() {
	}

	public static boolean hasStruct(String expr) {
		return expr.startsWith("struct ");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseStruct(String expr) {
		return parseStructWithRegistry(expr, new HashSet<>())
				.map(result -> result.expressionResult());
	}

	public static Result<StructParseResult, CompileError> parseStructWithRegistry(String expr,
			Set<String> definedStructs) {
		// Find the struct name
		int nameStart = 7; // Skip "struct "
		int nameEnd = nameStart;
		while (nameEnd < expr.length() && Character.isJavaIdentifierPart(expr.charAt(nameEnd))) {
			nameEnd++;
		}

		if (nameStart == nameEnd) {
			return Result.err(new CompileError("Struct must have a name"));
		}

		String structName = expr.substring(nameStart, nameEnd);

		// Check for duplicate
		if (definedStructs.contains(structName)) {
			return Result.err(new CompileError("Struct '" + structName + "' is already defined"));
		}

		String remaining = expr.substring(nameEnd).trim();

		if (!remaining.startsWith("{")) {
			return Result.err(new CompileError("Struct definition must have opening brace"));
		}

		int closingBrace = DepthAwareSplitter.findMatchingBrace(remaining, 0);
		if (closingBrace == -1) {
			return Result.err(new CompileError("Struct definition must have closing brace"));
		}

		String body = remaining.substring(1, closingBrace).trim();
		// Calculate afterStruct correctly: it's what comes after the closing brace
		String afterStruct = remaining.substring(closingBrace + 1).trim();

		// Register the struct
		definedStructs.add(structName);

		// For empty struct, return 0
		if (body.isEmpty()) {
			List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
			ExpressionModel.ExpressionResult result = new ExpressionModel.ExpressionResult(0, 0, terms);
			return Result.ok(new StructParseResult(result, afterStruct));
		}

		// TODO: Handle struct fields in future iterations
		return Result.err(new CompileError("Struct fields not yet supported"));
	}

	public record StructParseResult(ExpressionModel.ExpressionResult expressionResult, String remaining) {
	}
}
