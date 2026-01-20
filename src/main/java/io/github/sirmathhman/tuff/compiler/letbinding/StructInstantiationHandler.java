package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class StructInstantiationHandler {
	private StructInstantiationHandler() {
	}

	public static boolean isStructInstantiation(String expr, Map<String, StructDefinition> structRegistry) {
		// Check if expression starts with a struct name followed by {
		int spacePos = expr.indexOf(' ');
		if (spacePos == -1) {
			return false;
		}

		String potentialName = expr.substring(0, spacePos);
		return structRegistry.containsKey(potentialName) && expr.trim().substring(potentialName.length()).trim().startsWith("{");
	}

	public static Result<StructInstantiationResult, CompileError> parseStructInstantiation(String expr,
			Map<String, StructDefinition> structRegistry) {
		// Extract struct name
		int spacePos = expr.indexOf(' ');
		if (spacePos == -1) {
			return Result.err(new CompileError("Invalid struct instantiation"));
		}

		String structName = expr.substring(0, spacePos);
		StructDefinition definition = structRegistry.get(structName);
		if (definition == null) {
			return Result.err(new CompileError("Undefined struct: " + structName));
		}

		String remaining = expr.substring(spacePos).trim();
		if (!remaining.startsWith("{")) {
			return Result.err(new CompileError("Struct instantiation must have opening brace"));
		}

		int closingBrace = DepthAwareSplitter.findMatchingBrace(remaining, 0);
		if (closingBrace == -1) {
			return Result.err(new CompileError("Struct instantiation must have closing brace"));
		}

		String body = remaining.substring(1, closingBrace).trim();
		String afterInstantiation = remaining.substring(closingBrace + 1).trim();

		// Parse field assignments
		Result<Map<String, String>, CompileError> fieldsResult = parseFieldAssignments(body, definition);
		if (fieldsResult instanceof Result.Err<Map<String, String>, CompileError>) {
			return Result.err(((Result.Err<Map<String, String>, CompileError>) fieldsResult).error());
		}

		// For now, return a literal 0 with metadata about the struct
		List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
		ExpressionModel.ExpressionResult result = new ExpressionModel.ExpressionResult(0, 0, terms);
		Map<String, String> fieldValues = ((Result.Ok<Map<String, String>, CompileError>) fieldsResult).value();
		return Result.ok(new StructInstantiationResult(result, afterInstantiation, structName, fieldValues));
	}

	private static Result<Map<String, String>, CompileError> parseFieldAssignments(String body,
			StructDefinition definition) {
		Map<String, String> fieldValues = new HashMap<>();
		String fieldRemaining = body;

		while (!fieldRemaining.isEmpty()) {
			fieldRemaining = fieldRemaining.trim();
			if (fieldRemaining.isEmpty()) {
				break;
			}

			// Parse one field assignment
			Result<FieldAssignment, CompileError> result = parseOneFieldAssignment(fieldRemaining);
			if (result instanceof Result.Err<FieldAssignment, CompileError>) {
				return Result.err(((Result.Err<FieldAssignment, CompileError>) result).error());
			}

			FieldAssignment assignment = ((Result.Ok<FieldAssignment, CompileError>) result).value();

			// Validate field exists
			if (definition.getField(assignment.fieldName()) == null) {
				return Result.err(new CompileError("Struct '" + definition.name() + "' has no field '" + assignment.fieldName() + "'"));
			}

			fieldValues.put(assignment.fieldName(), assignment.fieldValue());
			fieldRemaining = assignment.remaining();
		}

		// Verify all fields are assigned
		for (StructHandler.StructField field : definition.fields()) {
			if (!fieldValues.containsKey(field.name())) {
				return Result.err(new CompileError("Struct field '" + field.name() + "' not assigned"));
			}
		}

		return Result.ok(fieldValues);
	}

	private static Result<FieldAssignment, CompileError> parseOneFieldAssignment(String text) {
		// Find field name
		int colonPos = text.indexOf(':');
		if (colonPos == -1) {
			return Result.err(new CompileError("Field assignment must have colon"));
		}

		String fieldName = text.substring(0, colonPos).trim();
		if (!isValidFieldName(fieldName)) {
			return Result.err(new CompileError("Invalid field name: " + fieldName));
		}

		// Find the end of the value (before comma or end)
		int valueStart = colonPos + 1;
		int valueEnd = valueStart;
		int depth = 0;
		while (valueEnd < text.length()) {
			char c = text.charAt(valueEnd);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ',' && depth == 0) {
				break;
			}
			valueEnd++;
		}

		String fieldValue = text.substring(valueStart, valueEnd).trim();
		if (fieldValue.isEmpty()) {
			return Result.err(new CompileError("Field value cannot be empty"));
		}

		// Determine remaining text
		String remaining = "";
		if (valueEnd < text.length() && text.charAt(valueEnd) == ',') {
			remaining = text.substring(valueEnd + 1);
		} else if (valueEnd < text.length()) {
			remaining = text.substring(valueEnd);
		}

		return Result.ok(new FieldAssignment(fieldName, fieldValue, remaining));
	}

	private static boolean isValidFieldName(String name) {
		return !name.isEmpty() && Character.isJavaIdentifierStart(name.charAt(0));
	}

	public record StructInstantiationResult(ExpressionModel.ExpressionResult expressionResult, String remaining,
			String structName, Map<String, String> fieldValues) {
	}

	private record FieldAssignment(String fieldName, String fieldValue, String remaining) {
	}
}
