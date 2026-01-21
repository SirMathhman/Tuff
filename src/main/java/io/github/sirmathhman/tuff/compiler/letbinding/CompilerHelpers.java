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

	/**
	 * Count variable occurrences, treating indexed accesses like x[0] and x[1]
	 * as single occurrences for each unique index pattern.
	 * Used for tuple variable substitution logic.
	 */
	public static int countVariableOccurrences(String varName, String continuation) {
		Pattern varPattern = Pattern.compile("\\b" + varName + "\\b");
		int occurrences = 0;
		for (Matcher m = varPattern.matcher(continuation); m.find(); occurrences++) {
			// Check if this occurrence is part of an indexed access like x[...]
			int pos = m.start();
			if (pos + varName.length() < continuation.length()
					&& continuation.charAt(pos + varName.length()) == '[') {
				// This is an indexed access - skip to after the closing bracket
				int depth = 0;
				for (int i = pos + varName.length(); i < continuation.length(); i++) {
					char c = continuation.charAt(i);
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
		Pattern varPattern = Pattern.compile("\\b" + varName + "\\b");
		for (Matcher m = varPattern.matcher(continuation); m.find();) {
			int pos = m.start();
			// Check if this is followed by a bracket
			if (pos + varName.length() >= continuation.length()
					|| continuation.charAt(pos + varName.length()) != '[') {
				// Found a non-indexed access
				return false;
			}
		}
		return true;
	}
}
