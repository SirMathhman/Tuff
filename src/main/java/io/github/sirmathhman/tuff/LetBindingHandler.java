package io.github.sirmathhman.tuff;

import java.util.List;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class LetBindingHandler {
	private LetBindingHandler() {
	}

	public static Result<Void, CompileError> handleUninitializedVariable(
			String stmt,
			int semiIndex,
			String continuation,
			List<Instruction> instructions) {
		// Extract variable name and type from "let [mut] x : Type;"
		String declPart = stmt.substring(4, semiIndex).trim(); // Skip "let "

		// Check for mut keyword
		boolean isMutable = declPart.startsWith("mut ");
		if (isMutable) {
			declPart = declPart.substring(4).trim(); // Skip "mut "
		}

		if (!declPart.contains(":")) {
			return Result.err(new CompileError(
					"Uninitialized variable must have explicit type annotation"));
		}

		String[] parts = declPart.split(":");
		String varName = parts[0].trim();

		// Check if continuation has assignment pattern
		if (!continuation.contains("=") || !continuation.contains(";")) {
			return Result.err(new CompileError(
					"Uninitialized variable '" + varName + "' must be assigned before use"));
		}

		// Treat uninitialized variable as mutable and handle the assignment
		return handleMutableVariableWithAssignment(varName, null, continuation, instructions, isMutable);
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions) {
		return handleLetBindingWithContinuation(stmt, equalsIndex, semiIndex, continuation, instructions,
				new java.util.HashMap<>(), 100);
	}

	private static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		// Parse variable declaration
		VariableDecl decl = parseVariableDecl(stmt, equalsIndex, semiIndex);
		String varName = decl.varName();
		boolean isMutable = decl.isMutable();
		String valueExpr = decl.valueExpr();

		// Check if continuation starts with "let" (chained binding)
		if (continuation.startsWith("let ")) {
			return handleChainedLetBinding(varName, valueExpr, continuation, instructions,
					variableAddresses, nextMemAddr);
		}

		// If continuation is just the variable name, evaluate the value expression
		if (continuation.equals(varName)) {
			Result<ExpressionModel.ExpressionResult, CompileError> valueResult = App.parseExpressionWithRead(
					valueExpr);
			if (valueResult.isErr()) {
				return Result.err(valueResult.errValue());
			}
			return App.generateInstructions(valueResult.okValue(), instructions);
		}

		// Check if continuation references a previously bound variable
		if (variableAddresses.containsKey(continuation)) {
			return handleVariableReference(valueExpr, continuation, instructions,
					variableAddresses, nextMemAddr);
		}

		// Check if continuation contains assignment (for mutable variables)
		if (continuation.contains("=") && continuation.contains(";")) {
			if (!isMutable) {
				return Result.err(new CompileError(
						"Cannot assign to immutable variable '" + varName + "'. Use 'let mut' to declare a mutable variable."));
			}
			return handleMutableVariableWithAssignment(varName, valueExpr, continuation, instructions);
		}

		// Check if variable is used multiple times in continuation
		java.util.regex.Pattern varPattern = java.util.regex.Pattern.compile("\\b" + varName + "\\b");
		java.util.regex.Matcher matcher = varPattern.matcher(continuation);
		int occurrences = 0;
		while (matcher.find()) {
			occurrences++;
		}

		if (occurrences > 1) {
			return handleMultipleVariableReferences(varName, valueExpr, continuation, occurrences, instructions);
		}

		// Single occurrence - simple substitution
		String substitutedContinuation = continuation.replaceAll("\\b" + varName + "\\b",
				"(" + valueExpr + ")");

		// Parse the substituted continuation expression
		Result<ExpressionModel.ExpressionResult, CompileError> contResult = App.parseExpressionWithRead(
				substitutedContinuation);
		if (contResult.isErr()) {
			return Result.err(contResult.errValue());
		}

		return App.generateInstructions(contResult.okValue(), instructions);
	}

	private static VariableDecl parseVariableDecl(String stmt, int equalsIndex, int semiIndex) {
		// Extract variable name and value expression
		String declPart = stmt.substring(4, equalsIndex).trim(); // Skip "let "
		boolean isMutable = false;
		if (declPart.startsWith("mut ")) {
			isMutable = true;
			declPart = declPart.substring(4).trim(); // Skip "mut "
		}
		String varName;
		if (declPart.contains(":")) {
			String[] parts = declPart.split(":");
			varName = parts[0].trim();
		} else {
			varName = declPart.trim();
		}
		String valueExpr = stmt.substring(equalsIndex + 1, semiIndex).trim();
		return new VariableDecl(varName, isMutable, valueExpr);
	}

	private record VariableDecl(String varName, boolean isMutable, String valueExpr) {
	}

	private static Result<Void, CompileError> handleChainedLetBinding(
			String varName,
			String valueExpr,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		return storeAndThen(valueExpr, instructions, nextMemAddr, () -> {
			// Add this variable to the context
			java.util.Map<String, Integer> newContext = new java.util.HashMap<>(variableAddresses);
			newContext.put(varName, nextMemAddr);

			// Parse the chained let binding
			int nextEqualsIndex = continuation.indexOf('=');
			if (nextEqualsIndex == -1) {
				return Result.err(new CompileError("Invalid let binding: missing '='"));
			}
			int nextSemiIndex = continuation.indexOf(';', nextEqualsIndex);
			if (nextSemiIndex == -1) {
				return Result.err(new CompileError("Invalid let binding: missing ';'"));
			}

			// Extract the second binding's parts
			String secondDeclPart = continuation.substring(4, nextEqualsIndex).trim(); // Skip "let "
			String secondValueExpr = continuation.substring(nextEqualsIndex + 1, nextSemiIndex).trim();
			String nextContinuation = continuation.substring(nextSemiIndex + 1).trim();

			// Check if the second binding declares a pointer type
			boolean isPointerType = false;
			String declaredType = null;
			if (secondDeclPart.contains(":")) {
				String[] parts = secondDeclPart.split(":");
				if (parts.length == 2) {
					declaredType = parts[1].trim();
					isPointerType = declaredType.startsWith("*");
				}
			}

			// For pointer types with reference operator, just continue without type checking
			// For other types, we should validate type compatibility
			if (!isPointerType && !secondValueExpr.startsWith("&")) {
				// Extract the type of the value expression
				java.util.Map<String, String> typeContext = new java.util.HashMap<>();
				typeContext.put(varName, valueExpr);
				
				Result<String, CompileError> valueTypeResult = ExpressionTokens.extractTypeFromExpression(secondValueExpr,
						typeContext);
				if (valueTypeResult.isOk() && declaredType != null) {
					String valueType = valueTypeResult.okValue();
					// Check type compatibility
					if (!ExpressionTokens.isTypeCompatible(valueType, declaredType)) {
						return Result.err(new CompileError("Type mismatch in let binding: variable '" +
								secondDeclPart.split(":")[0].trim() + "' declared as " + declaredType +
								" but initialized with " + valueType));
					}
				}
			}

			// Substitute the first variable in the second binding's value expression
			String substitutedValueExpr = secondValueExpr.replaceAll("\\b" + varName + "\\b", valueExpr);

			// Rebuild the continuation with substituted value
			String substitutedContinuation = "let " + secondDeclPart + " = " + substitutedValueExpr + "; " + nextContinuation;

			// Find indices in the NEW string
			int newEqualsIndex = substitutedContinuation.indexOf('=');
			int newSemiIndex = substitutedContinuation.indexOf(';', newEqualsIndex);

			return handleLetBindingWithContinuation(substitutedContinuation, newEqualsIndex, newSemiIndex,
					nextContinuation, instructions, newContext, nextMemAddr + 1);
		});
	}

	private static Result<Void, CompileError> handleVariableReference(
			String valueExpr,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		return storeAndThen(valueExpr, instructions, nextMemAddr, () -> {
			// Load the referenced variable from memory
			int refAddr = variableAddresses.get(continuation);
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) refAddr));
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		});
	}

	private static Result<Void, CompileError> handleMultipleVariableReferences(
			String varName,
			String valueExpr,
			String continuation,
			int occurrences,
			List<Instruction> instructions) {
		// Variable used multiple times - need to cache value in memory
		Result<Void, CompileError> storeResult = parseAndStoreInMemory(valueExpr, instructions);
		if (storeResult.isErr()) {
			return Result.err(storeResult.errValue());
		}

		int memAddr = 100;

		// For now, handle the specific case of "x + x"
		if (continuation.matches("^\\s*" + java.util.regex.Pattern.quote(varName) + "\\s*\\+\\s*"
				+ java.util.regex.Pattern.quote(varName) + "\\s*$")) {
			// Special case: x + x
			// Load value from memory address into register 1
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) memAddr));
			// Add register 1 to register 0
			instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
			// Result is in register 0, add Halt
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		return Result.err(new CompileError(
				"Multiple variable references not yet fully supported for complex expressions"));
	}

	private static Result<Void, CompileError> parseAndStoreInMemory(String valueExpr,
			List<Instruction> instructions) {
		return storeVariableInMemory(valueExpr, instructions, 100);
	}

	private static Result<Void, CompileError> storeAndThen(
			String valueExpr,
			List<Instruction> instructions,
			int memAddr,
			java.util.function.Supplier<Result<Void, CompileError>> continuation) {
		Result<Void, CompileError> storeResult = storeVariableInMemory(valueExpr, instructions, memAddr);
		if (storeResult.isErr()) {
			return storeResult;
		}
		return continuation.get();
	}

	private static Result<Void, CompileError> storeVariableInMemory(String valueExpr,
			List<Instruction> instructions, int memAddr) {
		// Parse and evaluate value expression
		Result<ExpressionModel.ExpressionResult, CompileError> valueResult = App.parseExpressionWithRead(valueExpr);
		if (valueResult.isErr()) {
			return Result.err(valueResult.errValue());
		}

		// Generate instructions for the value expression
		Result<Void, CompileError> genResult = App.generateInstructions(valueResult.okValue(), instructions);
		if (genResult.isErr()) {
			return Result.err(genResult.errValue());
		}

		// Store result (in register 0) to a memory location
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) memAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> handleMutableVariableWithAssignment(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions) {
		return handleMutableVariableWithAssignment(varName, initialValueExpr, continuation, instructions, false);
	}

	private static Result<Void, CompileError> handleMutableVariableWithAssignment(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions,
			boolean isMutableUninitialized) {
		int memAddr = 100;
		boolean isUninitialized = initialValueExpr == null;

		// Parse and evaluate initial value if provided, store in memory
		if (initialValueExpr != null) {
			Result<Void, CompileError> storeResult = parseAndStoreInMemory(initialValueExpr, instructions);
			if (storeResult.isErr()) {
				return Result.err(storeResult.errValue());
			}
		}

		// Parse continuation which may have multiple assignments and references
		String remaining = continuation;
		int assignmentCount = 0;
		while (true) {
			Result<AssignmentParseResult, CompileError> assignResult = parseAssignment(varName, remaining);
			if (assignResult.isErr()) {
				break; // No more assignments
			}

			AssignmentParseResult parsed = assignResult.okValue();

			// Validate assignment for uninitialized variables
			Result<Void, CompileError> validationResult = validateUninitializedAssignment(isUninitialized,
					varName, assignmentCount, isMutableUninitialized);
			if (validationResult.isErr()) {
				return validationResult;
			}
			assignmentCount++;

			// Parse and evaluate assignment value
			Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(
					parsed.valueExpr());
			if (exprResult.isErr()) {
				return Result.err(exprResult.errValue());
			}

			// Generate instructions for assignment value
			Result<Void, CompileError> assignGenResult = App.generateInstructions(exprResult.okValue(),
					instructions);
			if (assignGenResult.isErr()) {
				return Result.err(assignGenResult.errValue());
			}

			// Store new value in memory
			instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) memAddr));

			// Continue with rest of continuation
			remaining = parsed.remaining();
		}

		// Final part should be variable reference or expression using the variable
		if (remaining.equals(varName)) {
			// Load value from memory into register 0
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) memAddr));
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		return Result.err(new CompileError(
				"Mutable variable continuation must end with variable reference or expression"));
	}

	private static Result<Void, CompileError> validateUninitializedAssignment(
			boolean isUninitialized,
			String varName,
			int assignmentCount) {
		return validateUninitializedAssignment(isUninitialized, varName, assignmentCount, false);
	}

	private static Result<Void, CompileError> validateUninitializedAssignment(
			boolean isUninitialized,
			String varName,
			int assignmentCount,
			boolean isMutableUninitialized) {
		if (isUninitialized && assignmentCount > 0 && !isMutableUninitialized) {
			return Result.err(new CompileError(
					"Uninitialized variable '" + varName + "' can only be assigned once"));
		}
		return Result.ok(null);
	}

	private static Result<AssignmentParseResult, CompileError> parseAssignment(String varName, String remaining) {
		// Check if there's an assignment: varName = expr
		if (!remaining.startsWith(varName + " ") && !remaining.startsWith(varName + "=")) {
			return Result.err(new CompileError("Not an assignment")); // Not an assignment
		}

		int assignEqIndex = remaining.indexOf('=');
		if (assignEqIndex == -1 || !remaining.substring(0, assignEqIndex).trim().equals(varName)) {
			return Result.err(new CompileError("Not an assignment")); // Not an assignment
		}

		// Find semicolon for this assignment
		int depth = 0;
		int assignSemiIndex = -1;
		for (int i = assignEqIndex; i < remaining.length(); i++) {
			char c = remaining.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ';' && depth == 0) {
				assignSemiIndex = i;
				break;
			}
		}

		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid assignment: missing ';'")); // Invalid format
		}

		// Extract assignment value expression
		String assignValueExpr = remaining.substring(assignEqIndex + 1, assignSemiIndex).trim();
		String nextRemaining = remaining.substring(assignSemiIndex + 1).trim();

		return Result.ok(new AssignmentParseResult(assignValueExpr, nextRemaining));
	}

	private record AssignmentParseResult(String valueExpr, String remaining) {
	}
}
