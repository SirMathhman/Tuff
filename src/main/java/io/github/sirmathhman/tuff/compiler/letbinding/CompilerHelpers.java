package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

/**
 * Shared utility methods for the compiler to reduce code duplication.
 */
public final class CompilerHelpers {

	private CompilerHelpers() {
	}

	/**
	 * Load a variable from memory and halt execution.
	 * Used by continuation handlers to return variable values.
	 */
	public static void loadVariableAndHalt(List<Instruction> instructions, long memAddr) {
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, memAddr));
		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
	}

	/**
	 * Parse an expression and store the result to a memory address.
	 * Combines expression parsing, instruction generation, and store operation.
	 * Used by LetBindingHandler and ForLoopProcessor.
	 */
	public static Result<Void, CompileError> parseAndStoreInMemory(String valueExpr,
			List<Instruction> instructions, int memAddr) {
		return App.parseExpressionWithRead(valueExpr)
				.flatMap(expr -> App.generateInstructions(expr, instructions))
				.map(ignored -> {
					// Store result (in register 0) to a memory location
					instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) memAddr));
					return null;
				});
	}

	/**
	 * Parse and generate instructions for an expression.
	 * Combines expression parsing and instruction generation.
	 * Used by ForLoopHandler and WhileLoopHandler for RHS expression evaluation.
	 */
	public static Result<Void, CompileError> parseAndGenerateExpression(String expr,
			List<Instruction> instructions) {
		return App.parseExpressionWithRead(expr)
				.flatMap(parsed -> App.generateInstructions(parsed, instructions));
	}

	/**
	 * Find the closing parenthesis of a condition/loop header.
	 * Used by ForLoopHandler and WhileLoopHandler.
	 */
	public static int findConditionEnd(String expr, int startOffset) {
		int parenDepth = 1; // We start inside the opening paren so depth is 1
		for (int i = startOffset; i < expr.length(); i++) {
			if (expr.charAt(i) == '(')
				parenDepth++;
			else if (expr.charAt(i) == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}
}
