package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.vm.Instruction;

/**
 * Processes for loop continuations in let bindings. Extracted from
 * LetBindingHandler to keep file length under the
 * checkstyle limit.
 */
public final class ForLoopProcessor {
	private ForLoopProcessor() {
	}

	public static Result<Void, CompileError> handleForLoopAfterLet(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions,
			LetBindingProcessor.MutableVarContext ctx) {
		var variableAddresses = ctx.variableAddresses();
		var nextMemAddr = ctx.nextMemAddr();
		// Store the initial value at the correct memory address
		var storeResult = CompilerHelpers.parseAndStoreInMemory(initialValueExpr, instructions,
																														nextMemAddr);
		if (storeResult instanceof Result.Err<Void, CompileError>)
			return storeResult;

		// Add variable to context
		Map<String, Integer> context = new java.util.HashMap<>(variableAddresses);
		context.put(varName, nextMemAddr);

		// Extract just the for loop part (from "for" to the first semicolon after the
		// loop body closes)
		var forLoopEnd = findForLoopEnd(continuation);
		if (forLoopEnd == -1) {
			return Result.err(new CompileError("Malformed for loop"));
		}

		var forLoopPart = continuation.substring(0, forLoopEnd).trim();
		var afterForLoop = continuation.substring(forLoopEnd).trim();

		// Delegate to ForLoopHandler
		var forLoopResult = ForLoopHandler.handleForLoop(forLoopPart, instructions, context);
		if (forLoopResult instanceof Result.Err<Void, CompileError>) {
			return forLoopResult;
		}

		// Handle the continuation after the for loop
		if (!afterForLoop.isEmpty()) {
			if (afterForLoop.equals(varName)) {
				// Return the variable value
				CompilerHelpers.loadVariableAndHalt(instructions, (long) nextMemAddr);
				return Result.ok(null);
			}
			// Check if the continuation is another variable reference in context
			if (context.containsKey(afterForLoop)) {
				// Load the variable from memory
				int refAddr = context.get(afterForLoop);
				CompilerHelpers.loadVariableAndHalt(instructions, (long) refAddr);
				return Result.ok(null);
			}
			// Otherwise, recursively process as a new statement/expression
			return App.parseStatement(afterForLoop, instructions);
		}

		return Result.ok(null);
	}

	private static int findForLoopEnd(String str) {
		// Find the for (...) part and then find the semicolon that ends the body
		if (!str.startsWith("for")) {
			return -1;
		}

		var parenStart = str.indexOf('(');
		if (parenStart == -1)
			return -1;

		var parenDepth = 1;
		var parenEnd = -1;
		for (var i = parenStart + 1; i < str.length(); i++) {
			if (str.charAt(i) == '(')
				parenDepth++;
			else if (str.charAt(i) == ')')
				parenDepth--;
			if (parenDepth == 0) {
				parenEnd = i;
				break;
			}
		}

		if (parenEnd == -1)
			return -1;

		// Find the semicolon after the closing paren
		var semiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(str, parenEnd + 1);
		if (semiIdx == -1)
			return -1;

		return semiIdx + 1; // Include the semicolon in the loop part
	}
}
