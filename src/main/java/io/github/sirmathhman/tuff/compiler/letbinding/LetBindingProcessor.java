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
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Processes let binding continuations. Extracted from LetBindingHandler to keep
 * method lengths under the checkstyle limit.
 */
public final class LetBindingProcessor {
	private LetBindingProcessor() {
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
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions,
			Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		return process(stmt, equalsIndex, semiIndex, continuation, instructions, variableAddresses, nextMemAddr,
				new java.util.HashMap<>());
	}

	public static Result<Void, CompileError> process(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions,
			Map<String, Integer> variableAddresses,
			int nextMemAddr,
			Map<String, StructDefinition> structRegistry) {
		VariableDecl decl = parseVariableDecl(stmt, equalsIndex, semiIndex);
		String varName = decl.varName();

		// Try early return cases first
		Result<Void, CompileError> earlyResult = tryEarlyReturns(varName, decl, continuation, instructions,
				variableAddresses, nextMemAddr);
		if (earlyResult != null) {
			return earlyResult;
		}

		// Handle struct field access on declared struct variables (e.g., point.x +
		// point.y)
		if (decl.declaredType() != null && continuation.contains(varName + ".")) {
			Result<Void, CompileError> structAccessResult = handleStructFieldAccess(varName, decl, continuation,
					instructions, structRegistry);
			if (structAccessResult != null) {
				return structAccessResult;
			}
			// If struct parsing fails, fall through to normal path
		}

		// Handle variable substitution cases
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
				.parseExpressionWithRead(substitutedContinuation);
		return contResult.match(expr -> App.generateInstructions(expr, instructions), Result::err);
	}

	private static Result<Void, CompileError> tryEarlyReturns(String varName, VariableDecl decl,
			String continuation, List<Instruction> instructions,
			Map<String, Integer> variableAddresses, int nextMemAddr) {
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
							: App.parseExpressionWithRead(decl.valueExpr());
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
