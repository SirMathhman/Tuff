package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import java.util.ArrayList;
import java.util.List;

public final class StructHandler {
	private StructHandler() {
	}

	public static boolean hasStruct(String expr) {
		return expr.startsWith("struct ");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseStruct(String expr) {
		// Format: struct StructName { fields... }
		// For now, empty struct {} evaluates to 0

		// Find the struct name
		int nameStart = 7; // Skip "struct "
		int nameEnd = nameStart;
		while (nameEnd < expr.length() && Character.isJavaIdentifierPart(expr.charAt(nameEnd))) {
			nameEnd++;
		}

		if (nameStart == nameEnd) {
			return Result.err(new CompileError("Struct must have a name"));
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

		// For empty struct, just return 0
		if (body.isEmpty()) {
			List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
			return Result.ok(new ExpressionModel.ExpressionResult(0, 0, terms));
		}

		// TODO: Handle struct fields in future iterations
		return Result.err(new CompileError("Struct fields not yet supported"));
	}
}
