package io.github.sirmathhman.tuff.compiler.letbinding;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;

import java.util.HashMap;
import java.util.HashSet;
import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;
import java.util.Set;

public final class StructHandler {
	private StructHandler() {
	}

	public static boolean hasStruct(String expr) {
		return expr.startsWith("struct ");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseStruct(String expr) {
		return parseStructWithRegistry(expr, new HashSet<>(), new HashMap<>())
				.map(StructParseResult::expressionResult);
	}

	public static Result<StructParseResult, CompileError> parseStructWithRegistry(String expr,
			Set<String> definedStructs, Map<String, StructDefinition> structRegistry) {
		// Find the struct name
		var nameStart = 7; // Skip "struct "
		var nameEnd = nameStart;
		while (nameEnd < expr.length() && Character.isJavaIdentifierPart(expr.charAt(nameEnd))) {
			nameEnd++;
		}

		if (nameStart == nameEnd) {
			return Result.err(new CompileError("Struct must have a name"));
		}

		var structName = expr.substring(nameStart, nameEnd);

		// Check for duplicate
		if (definedStructs.contains(structName)) {
			return Result.err(new CompileError("Struct '" + structName + "' is already defined"));
		}

		var remaining = expr.substring(nameEnd).trim();

		if (!remaining.startsWith("{")) {
			return Result.err(new CompileError("Struct definition must have opening brace"));
		}

		var closingBrace = DepthAwareSplitter.findMatchingBrace(remaining, 0);
		if (closingBrace == -1) {
			return Result.err(new CompileError("Struct definition must have closing brace"));
		}

		var body = remaining.substring(1, closingBrace).trim();
		// Calculate afterStruct correctly: it's what comes after the closing brace
		var afterStruct = remaining.substring(closingBrace + 1).trim();

		// Register the struct
		definedStructs.add(structName);

		// Parse struct fields
		ArrayList<StructField> fields = new ArrayList<>();
		if (!body.isEmpty()) {
			var fieldsResult = parseFields(body);
			if (fieldsResult instanceof Result.Err<ArrayList<StructField>, CompileError>) {
				return Result.err(((Result.Err<ArrayList<StructField>, CompileError>) fieldsResult).error());
			}
			fields = ((Result.Ok<ArrayList<StructField>, CompileError>) fieldsResult).value();
		}

		// Store the full struct definition
		var definition = new StructDefinition(structName, fields);
		structRegistry.put(structName, definition);

		// For now, structs always compile to 0 regardless of fields
		// TODO: Use fields for struct instantiation and field access in future
		// iterations
		@SuppressWarnings("unused")
		var _fields = fields;
		ArrayList<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();
		var result = new ExpressionModel.ExpressionResult(0, 0, terms);
		return Result.ok(new StructParseResult(result, afterStruct));
	}

	public record StructParseResult(ExpressionModel.ExpressionResult expressionResult, String remaining) {
	}

	public record StructField(String name, String type) {
	}

	private static Result<ArrayList<StructField>, CompileError> parseFields(String body) {
		ArrayList<StructField> fields = new ArrayList<>();
		var remaining = body;

		while (!remaining.isEmpty()) {
			remaining = remaining.trim();
			if (remaining.isEmpty()) {
				break;
			}

			// Parse field name
			var colonPos = remaining.indexOf(':');
			if (colonPos == -1) {
				return Result.err(new CompileError("Field must have a type annotation (use ':')"));
			}

			var fieldName = remaining.substring(0, colonPos).trim();
			if (fieldName.isEmpty() || !Character.isJavaIdentifierStart(fieldName.charAt(0))) {
				return Result.err(new CompileError("Invalid field name: " + fieldName));
			}

			// Find the end of the type (before semicolon or comma)
			var typeStart = colonPos + 1;
			var typeEnd = typeStart;
			while (typeEnd < remaining.length() && remaining.charAt(typeEnd) != ';' && remaining.charAt(typeEnd) != ',') {
				typeEnd++;
			}

			var fieldType = remaining.substring(typeStart, typeEnd).trim();
			if (fieldType.isEmpty()) {
				return Result.err(new CompileError("Field must have a type"));
			}

			fields.add(new StructField(fieldName, fieldType));

			// Move past the field (including separator if present)
			if (typeEnd < remaining.length() && (remaining.charAt(typeEnd) == ';' || remaining.charAt(typeEnd) == ',')) {
				remaining = remaining.substring(typeEnd + 1);
			} else {
				remaining = remaining.substring(typeEnd);
			}
		}

		return Result.ok(fields);
	}
}