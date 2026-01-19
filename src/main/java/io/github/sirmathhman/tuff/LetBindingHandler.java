package io.github.sirmathhman.tuff;

import java.util.List;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class LetBindingHandler {
	private LetBindingHandler() {
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions) {
		// Extract variable name and value expression
		String declPart = stmt.substring(4, equalsIndex).trim(); // Skip "let "
		String varName;
		if (declPart.contains(":")) {
			String[] parts = declPart.split(":");
			varName = parts[0].trim();
		} else {
			varName = declPart.trim();
		}
		String valueExpr = stmt.substring(equalsIndex + 1, semiIndex).trim();

		// If continuation is just the variable name, evaluate the value expression
		if (continuation.equals(varName)) {
			Result<ExpressionModel.ExpressionResult, CompileError> valueResult = App.parseExpressionWithRead(
					valueExpr);
			if (valueResult.isErr()) {
				return Result.err(valueResult.errValue());
			}
			return App.generateInstructions(valueResult.okValue(), instructions);
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

	private static Result<Void, CompileError> handleMultipleVariableReferences(
			String varName,
			String valueExpr,
			String continuation,
			int occurrences,
			List<Instruction> instructions) {
		// Variable used multiple times - need to cache value in memory
		// Parse the value expression
		Result<ExpressionModel.ExpressionResult, CompileError> valueResult = App.parseExpressionWithRead(valueExpr);
		if (valueResult.isErr()) {
			return Result.err(valueResult.errValue());
		}

		// Generate instructions for the value expression
		Result<Void, CompileError> genResult = App.generateInstructions(valueResult.okValue(), instructions);
		if (genResult.isErr()) {
			return Result.err(genResult.errValue());
		}

		// Store result (in register 0) to a memory location (use address 100)
		int memAddr = 100;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) memAddr));

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
}
