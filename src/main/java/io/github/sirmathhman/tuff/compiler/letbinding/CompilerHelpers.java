package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
		// Check if it's an array - if so, store each element separately
		var trimmed = valueExpr.trim();
		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			var inner = trimmed.substring(1, trimmed.length() - 1);
			var elements = io.github.sirmathhman.tuff.compiler.DepthAwareSplitter
					.splitByDelimiterAtDepthZero(inner, ',');

			// Generate instructions to evaluate and store each element
			for (var i = 0; i < elements.size(); i++) {
				var element = elements.get(i).trim();
				var elemResult = App
						.parseExpressionWithRead(element);
				if (elemResult instanceof Result.Err<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, io.github.sirmathhman.tuff.CompileError> err) {
					return Result.err(err.error());
				}
				var genResult = App.generateInstructions(
						((Result.Ok<io.github.sirmathhman.tuff.compiler.ExpressionModel.ExpressionResult, io.github.sirmathhman.tuff.CompileError>) elemResult)
								.value(),
						instructions);
				if (genResult instanceof Result.Err<Void, io.github.sirmathhman.tuff.CompileError> err) {
					return Result.err(err.error());
				}

				// Store result to memory[memAddr + i]
				instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) (memAddr + i)));
			}
			return Result.ok(null);
		}

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
		var parenDepth = 1; // We start inside the opening paren so depth is 1
		for (var i = startOffset; i < expr.length(); i++) {
			if (expr.charAt(i) == '(')
				parenDepth++;
			else if (expr.charAt(i) == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}

	/**
	 * Count variable occurrences, treating indexed accesses like x[0] and x[1]
	 * as single occurrences for each unique index pattern.
	 * Used for tuple variable substitution logic.
	 */
	public static int countVariableOccurrences(String varName, String continuation) {
		var varPattern = Pattern.compile("\\b" + varName + "\\b");
		var occurrences = 0;
		for (var m = varPattern.matcher(continuation); m.find(); occurrences++) {
			// Check if this occurrence is part of an indexed access like x[...]
			var pos = m.start();
			if (pos + varName.length() < continuation.length()
					&& continuation.charAt(pos + varName.length()) == '[') {
				// This is an indexed access - skip to after the closing bracket
				var depth = 0;
				for (var i = pos + varName.length(); i < continuation.length(); i++) {
					var c = continuation.charAt(i);
					if (c == '[') {
						depth++;
					} else if (c == ']') {
						depth--;
						if (depth == 0) {
							break;
						}
					}
				}
			}
		}
		return occurrences;
	}

	/**
	 * Check if all variable accesses are indexed (e.g., x[0], x[1]).
	 * Returns true if the variable is only used with brackets.
	 * Used for tuple variable substitution logic.
	 */
	public static boolean allAccessesAreIndexed(String varName, String continuation) {
		var varPattern = Pattern.compile("\\b" + varName + "\\b");
		for (var m = varPattern.matcher(continuation); m.find();) {
			var pos = m.start();
			// Check if this is followed by a bracket
			if (pos + varName.length() >= continuation.length()
					|| continuation.charAt(pos + varName.length()) != '[') {
				// Found a non-indexed access
				return false;
			}
		}
		return true;
	}

	/**
	 * Wrap a value for substitution based on its declared type.
	 * Arrays and pointers-to-arrays are wrapped with extra brackets for indexing.
	 */
	public static String wrapValueForSubstitution(String value, String declaredType) {
		var isArrayType = declaredType != null && declaredType.startsWith("[") && declaredType.endsWith("]");
		var isArrayPointerType = declaredType != null &&
														 (declaredType.startsWith("*[") || declaredType.startsWith("*mut ["));

		if ((isArrayType || isArrayPointerType) && value.startsWith("[") && value.endsWith("]")) {
			// All arrays and pointer-to-arrays get wrapped for indexing
			return "[" + value + "]";
		}
		return value;
	}
}
