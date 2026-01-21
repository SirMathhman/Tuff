package io.github.sirmathhman.tuff.compiler.letbinding.type_aliases;

import java.util.Map;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;

public class TypeAliasHandler {

	public record TypeAliasParseResult(String aliasName, String targetType, String remaining) {
	}

	public static boolean isTypeAlias(String stmt) {
		return stmt.trim().startsWith("type ");
	}

	public static Result<TypeAliasParseResult, CompileError> parseTypeAlias(String stmt,
			Map<String, String> typeAliasRegistry) {
		String trimmed = stmt.trim();

		if (!trimmed.startsWith("type ")) {
			return Result.err(new CompileError("Expected type alias definition"));
		}

		String afterType = trimmed.substring(5).trim();

		// Find the '=' sign
		int equalsIndex = afterType.indexOf('=');
		if (equalsIndex == -1) {
			return Result.err(new CompileError("Type alias missing '=' sign"));
		}

		String aliasNamePart = afterType.substring(0, equalsIndex).trim();
		String targetTypePart = afterType.substring(equalsIndex + 1).trim();

		// Find the semicolon that terminates the alias
		int semiIndex = targetTypePart.indexOf(';');
		if (semiIndex == -1) {
			return Result.err(new CompileError("Type alias missing terminating semicolon"));
		}

		String targetType = targetTypePart.substring(0, semiIndex).trim();
		String remaining = targetTypePart.substring(semiIndex + 1).trim();

		// Validate alias name
		if (!isValidIdentifier(aliasNamePart)) {
			return Result.err(new CompileError("Invalid type alias name: " + aliasNamePart));
		}

		// Check for duplicate alias
		if (typeAliasRegistry.containsKey(aliasNamePart)) {
			return Result.err(new CompileError("Type alias '" + aliasNamePart + "' already defined"));
		}

		// Validate target type
		if (!isValidTargetType(targetType)) {
			return Result.err(new CompileError("Invalid target type for alias: " + targetType));
		}

		// Register the alias
		typeAliasRegistry.put(aliasNamePart, targetType);

		return Result.ok(new TypeAliasParseResult(aliasNamePart, targetType, remaining));
	}

	public static String resolveType(String typeName, Map<String, String> typeAliasRegistry) {
		if (typeAliasRegistry.containsKey(typeName)) {
			String resolved = typeAliasRegistry.get(typeName);
			// Recursively resolve in case of chained aliases
			return resolveType(resolved, typeAliasRegistry);
		}
		return typeName;
	}

	private static boolean isValidIdentifier(String name) {
		if (name == null || name.isEmpty()) {
			return false;
		}
		if (!Character.isLetter(name.charAt(0)) && name.charAt(0) != '_') {
			return false;
		}
		for (int i = 1; i < name.length(); i++) {
			char c = name.charAt(i);
			if (!Character.isLetterOrDigit(c) && c != '_') {
				return false;
			}
		}
		return true;
	}

	private static boolean isValidTargetType(String type) {
		// Check if it's a basic valid type by testing compatibility with itself
		if (ExpressionTokens.isTypeCompatible(type, type)) {
			return true;
		}

		// Check for pointer types
		if (type.startsWith("*")) {
			String baseType = type.substring(1);
			if (baseType.startsWith("mut ")) {
				baseType = baseType.substring(4);
			}
			return ExpressionTokens.isTypeCompatible(baseType, baseType);
		}

		// Check for array types or tuple types
		if ((type.startsWith("[") && type.endsWith("]")) ||
				(type.startsWith("(") && type.endsWith(")"))) {
			return true;
		}

		return false;
	}
}
