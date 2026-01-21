package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.DereferenceAssignmentHandler;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;
import io.github.sirmathhman.tuff.compiler.LetBindingHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Processes let binding continuations. Extracted from LetBindingHandler to keep
 * method lengths under the checkstyle limit.
 */
public final class LetBindingProcessor {
	private LetBindingProcessor() {
	}

	public record ProcessContext(
			List<Instruction> instructions,
			Map<String, Integer> variableAddresses,
			int nextMemAddr,
			Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
	}

	private static VariableDecl parseVariableDecl(String stmt, int equalsIndex, int semiIndex) {
		String declPart = stmt.substring(4, equalsIndex).trim();
		boolean isMutable = false;
		if (declPart.startsWith("mut ")) {
			isMutable = true;
			declPart = declPart.substring(4).trim();
		}
		String varName;
		String declaredType = null;
		if (declPart.contains(":")) {
			String[] parts = declPart.split(":");
			varName = parts[0].trim();
			declaredType = parts[1].trim();
		} else {
			varName = declPart.trim();
		}
		String valueExpr = stmt.substring(equalsIndex + 1, semiIndex).trim();
		return new VariableDecl(varName, isMutable, valueExpr, declaredType);
	}

	private static Result<Void, CompileError> handleStructFieldAccessOnFunctionCallResult(String varName,
			VariableDecl decl, String continuation, List<Instruction> instructions,
			Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Check if valueExpr is a function call
		String valueExpr = decl.valueExpr().trim();
		if (!FunctionHandler.isFunctionCall(valueExpr, functionRegistry)) {
			return null;
		}

		// Get the function definition and return type
		FunctionHandler.FunctionDef funcDef = getFunctionDef(valueExpr,
				functionRegistry);
		if (funcDef == null) {
			return null;
		}

		String returnType = funcDef.returnType();
		if (returnType == null || !structRegistry.containsKey(returnType)) {
			return null;
		}

		// Extract used fields from continuation
		java.util.Set<String> usedFields = extractUsedFields(varName, continuation);
		if (usedFields.isEmpty()) {
			return null;
		}

		// Extract field values from function body
		java.util.Map<String, String> fieldValues = extractFieldValuesFromFunctionBody(funcDef.body().trim());
		if (fieldValues == null || fieldValues.isEmpty()) {
			return null;
		}

		// Verify all fields exist
		StructDefinition structDef = structRegistry.get(returnType);
		if (!verifyFields(usedFields, fieldValues, structDef, returnType)) {
			return Result.err(new CompileError("Field verification failed for struct '" + returnType + "'"));
		}

		// Replace field accesses with their values
		String substitutedContinuation = replaceFieldAccesses(varName, continuation, usedFields, fieldValues);

		// Parse the substituted continuation
		Result<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, CompileError> contResult = App
				.parseExpressionWithRead(substitutedContinuation, functionRegistry);
		return contResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
	}

	private static FunctionHandler.FunctionDef getFunctionDef(String valueExpr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		int parenIndex = valueExpr.indexOf('(');
		if (parenIndex <= 0) {
			return null;
		}
		String functionName = valueExpr.substring(0, parenIndex).trim();
		return functionRegistry.get(functionName);
	}

	private static java.util.Set<String> extractUsedFields(String varName, String continuation) {
		java.util.Set<String> usedFields = new java.util.HashSet<>();
		java.util.regex.Pattern fieldAccessPattern = java.util.regex.Pattern
				.compile("\\b" + java.util.regex.Pattern.quote(varName) + "\\.([a-zA-Z_][a-zA-Z0-9_]*)\\b");
		java.util.regex.Matcher matcher = fieldAccessPattern.matcher(continuation);
		while (matcher.find()) {
			usedFields.add(matcher.group(1));
		}
		return usedFields;
	}

	private static boolean verifyFields(java.util.Set<String> usedFields,
			java.util.Map<String, String> fieldValues, StructDefinition structDef, String structName) {
		for (String field : usedFields) {
			boolean fieldExists = structDef.fields().stream()
					.anyMatch(f -> f.name().equals(field));
			if (!fieldExists || !fieldValues.containsKey(field)) {
				return false;
			}
		}
		return true;
	}

	private static String replaceFieldAccesses(String varName, String continuation,
			java.util.Set<String> usedFields, java.util.Map<String, String> fieldValues) {
		String result = continuation;
		for (String field : usedFields) {
			String fieldValue = fieldValues.get(field);
			result = result.replaceAll("\\b" + java.util.regex.Pattern.quote(varName) + "\\." + field + "\\b",
					"(" + fieldValue + ")");
		}
		return result;
	}

	private static java.util.Map<String, String> extractFieldValuesFromFunctionBody(String body) {
		// Try to extract struct initialization from body
		// Body format: Point { x : read I32, y : read I32 }
		// We need to find { ... } and extract field: value pairs

		int openBrace = body.indexOf('{');
		int closeBrace = body.lastIndexOf('}');

		if (openBrace == -1 || closeBrace == -1 || closeBrace <= openBrace) {
			return null;
		}

		String structInit = body.substring(openBrace + 1, closeBrace);
		java.util.Map<String, String> fieldValues = new java.util.HashMap<>();

		// Parse field: value pairs
		// Split by comma at depth 0
		java.util.List<String> assignments = new java.util.ArrayList<>();
		StringBuilder current = new StringBuilder();
		int depth = 0;

		for (int i = 0; i < structInit.length(); i++) {
			char c = structInit.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ',' && depth == 0) {
				if (current.length() > 0) {
					assignments.add(current.toString().trim());
				}
				current = new StringBuilder();
				continue;
			}
			current.append(c);
		}
		if (current.length() > 0) {
			assignments.add(current.toString().trim());
		}

		// Parse each assignment
		for (String assignment : assignments) {
			int colonIndex = assignment.indexOf(':');
			if (colonIndex > 0) {
				String fieldName = assignment.substring(0, colonIndex).trim();
				String fieldValue = assignment.substring(colonIndex + 1).trim();
				fieldValues.put(fieldName, fieldValue);
			}
		}

		return fieldValues.isEmpty() ? null : fieldValues;
	}

	private static Result<Void, CompileError> handleStructFieldAccess(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions, Map<String, StructDefinition> structRegistry) {
		// Try to parse the struct value expression directly using struct instantiation
		// handler
		Result<StructInstantiationHandler.StructInstantiationResult, CompileError> structResult = StructInstantiationHandler
				.parseStructInstantiation(decl.valueExpr(), structRegistry);
		if (structResult instanceof Result.Ok<StructInstantiationHandler.StructInstantiationResult, CompileError> ok) {
			StructInstantiationHandler.StructInstantiationResult instResult = ok.value();

			// Replace all field accesses in continuation (e.g., point.x -> (fieldX),
			// point.y -> (fieldY))
			String result = continuation;
			java.util.Set<String> usedFields = new java.util.HashSet<>();
			java.util.regex.Pattern fieldPattern = java.util.regex.Pattern
					.compile("\\b" + varName + "\\.([a-zA-Z_][a-zA-Z0-9_]*)\\b");
			java.util.regex.Matcher matcher = fieldPattern.matcher(continuation);

			while (matcher.find()) {
				String fieldName = matcher.group(1);
				usedFields.add(fieldName);
			}

			// Verify all fields exist before replacement
			for (String field : usedFields) {
				if (!instResult.fieldValues().containsKey(field)) {
					return Result.err(
							new CompileError("Field '" + field + "' not found in struct '" + decl.declaredType() + "'"));
				}
			}

			// Replace field accesses with their values
			for (String field : usedFields) {
				String fieldValue = instResult.fieldValues().get(field);
				result = result.replaceAll("\\b" + varName + "\\." + field + "\\b", "(" + fieldValue + ")");
			}

			// Parse the substituted continuation
			Result<ExpressionModel.ExpressionResult, CompileError> contResult = App.parseExpressionWithRead(result);
			return contResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
		}
		// If struct parsing fails, return null to fall through
		return null;
	}

	public static Result<Void, CompileError> process(
			String stmt, int equalsIndex, int semiIndex, String continuation,
			List<Instruction> instructions, Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		ProcessContext ctx = new ProcessContext(instructions, variableAddresses, nextMemAddr,
				new java.util.HashMap<>(), new java.util.HashMap<>());
		return process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	public static Result<Void, CompileError> process(
			String stmt, int equalsIndex, int semiIndex, String continuation, ProcessContext ctx) {
		VariableDecl decl = parseVariableDecl(stmt, equalsIndex, semiIndex);
		String varName = decl.varName();
		Result<Void, CompileError> earlyResult = tryEarlyReturns(varName, decl, continuation, ctx.instructions(),
				ctx.variableAddresses(), ctx.nextMemAddr(), ctx.functionRegistry());
		if (earlyResult != null)
			return earlyResult;
		Result<Void, CompileError> structAccessResult = handleAllStructFieldAccess(varName, decl, continuation,
				ctx.instructions(), ctx.structRegistry(), ctx.functionRegistry());
		if (structAccessResult != null)
			return structAccessResult;
		return completeVariableSubstitution(varName, decl, continuation, ctx.instructions(), ctx.functionRegistry());
	}

	private static Result<Void, CompileError> tryEarlyReturns(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, Integer> variableAddresses, int nextMemAddr) {
		return tryEarlyReturns(varName, decl, continuation, instructions, variableAddresses, nextMemAddr,
				new java.util.HashMap<>());
	}

	private static Result<Void, CompileError> tryEarlyReturns(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, Integer> variableAddresses, int nextMemAddr,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Handle yield blocks
		if (decl.valueExpr().trim().startsWith("{")) {
			String blockContent = decl.valueExpr().trim();
			int closingBrace = DepthAwareSplitter.findMatchingBrace(blockContent, 0);
			if (closingBrace != -1) {
				String inner = blockContent.substring(1, closingBrace).trim();
				if (inner.contains("yield")) {
					return LetBindingHandler.handleYieldBlock(varName, inner, continuation, instructions, nextMemAddr);
				}
			}
		}

		if (continuation.trim().startsWith("{")) {
			return LetBindingHandler.handleScopedBlock(varName, decl.valueExpr(), continuation, instructions,
					variableAddresses, nextMemAddr);
		}
		if (continuation.startsWith("let ")) {
			return LetBindingHandler.handleChainedLetBinding(varName, decl.valueExpr(), continuation, instructions,
					variableAddresses, nextMemAddr);
		}
		if (continuation.startsWith("while (") && decl.isMutable()) {
			return LetBindingHandler.handleWhileLoopAfterLet(varName, decl.valueExpr(), continuation, instructions,
					variableAddresses, nextMemAddr);
		}
		if (continuation.equals(varName)) {
			Result<ExpressionModel.ExpressionResult, CompileError> valueResult = ConditionalExpressionHandler
					.hasConditional(decl.valueExpr())
							? ConditionalExpressionHandler.parseConditional(decl.valueExpr())
							: App.parseExpressionWithRead(decl.valueExpr(), functionRegistry);
			return valueResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
		}
		if (variableAddresses.containsKey(continuation)) {
			return LetBindingHandler.handleVariableReference(decl.valueExpr(), continuation, instructions,
					variableAddresses, nextMemAddr);
		}
		if (continuation.contains("=") && continuation.contains(";")) {
			if (continuation.trim().startsWith("*")) {
				return DereferenceAssignmentHandler.handle(varName, decl.valueExpr(), continuation, instructions,
						variableAddresses);
			}
			if (!decl.isMutable()) {
				return Result.err(new CompileError("Cannot assign to immutable variable '" + varName + "'. Use 'let mut'."));
			}
			return LetBindingHandler.handleMutableVariableWithAssignment(varName, decl.valueExpr(), continuation,
					instructions, false, variableAddresses, nextMemAddr);
		}
		return null;
	}

	private static Result<Void, CompileError> handleAllStructFieldAccess(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions, Map<String, StructDefinition> structRegistry,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		// Handle struct field access on declared struct variables
		if (decl.declaredType() != null && continuation.contains(varName + ".")) {
			Result<Void, CompileError> structAccessResult = handleStructFieldAccess(varName, decl, continuation,
					instructions, structRegistry);
			if (structAccessResult != null) {
				return structAccessResult;
			}
		}

		// Handle struct field access on function call results
		if (decl.declaredType() == null && continuation.contains(varName + ".")) {
			Result<Void, CompileError> functionCallStructAccessResult = handleStructFieldAccessOnFunctionCallResult(
					varName, decl, continuation, instructions, structRegistry, functionRegistry);
			if (functionCallStructAccessResult != null) {
				return functionCallStructAccessResult;
			}
		}
		return null;
	}

	private static Result<Void, CompileError> completeVariableSubstitution(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		java.util.regex.Pattern varPattern = java.util.regex.Pattern.compile("\\b" + varName + "\\b");
		int occurrences = 0;
		for (java.util.regex.Matcher m = varPattern.matcher(continuation); m.find(); occurrences++)
			;
		if (occurrences > 1) {
			return LetBindingHandler.handleMultipleVariableReferences(varName, decl.valueExpr(), continuation,
					occurrences, instructions);
		}
		String substitutedContinuation = continuation.replaceAll("\\b" + varName + "\\b",
				"(" + decl.valueExpr() + ")");
		Result<Void, CompileError> typeCheckResult = validateContinuationTypes(continuation, varName,
				decl.valueExpr());
		if (typeCheckResult instanceof Result.Err<Void, CompileError>) {
			return typeCheckResult;
		}
		Result<ExpressionModel.ExpressionResult, CompileError> contResult = App
				.parseExpressionWithRead(substitutedContinuation, functionRegistry);
		return contResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
	}

	private static Result<Void, CompileError> validateContinuationTypes(String continuation, String varName,
			String valueExpr) {
		if (!continuation.contains("*")) {
			return Result.ok(null);
		}
		java.util.Map<String, String> typeContext = new java.util.HashMap<>();
		Result<String, CompileError> boundVarTypeResult = ExpressionTokens.extractTypeFromExpression(valueExpr,
				typeContext);
		return boundVarTypeResult.match(boundVarType -> {
			typeContext.put(varName, boundVarType);
			Result<String, CompileError> contTypeResult = ExpressionTokens.extractTypeFromExpression(continuation,
					typeContext);
			if (contTypeResult instanceof Result.Err<String, CompileError> contTypeErr) {
				return Result.err(contTypeErr.error());
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
	}
}
