package io.github.sirmathhman.tuff.compiler;

import java.util.List;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.CompilerHelpers;
import io.github.sirmathhman.tuff.compiler.letbinding.ForLoopProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.StructDefinition;
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
		String declPart = stmt.substring(4, semiIndex).trim();
		boolean isMutable = declPart.startsWith("mut ");
		if (isMutable)
			declPart = declPart.substring(4).trim();
		if (!declPart.contains(":"))
			return Result.err(new CompileError("Uninitialized variable must have explicit type annotation"));
		String varName = declPart.split(":")[0].trim();
		if (continuation.trim().startsWith("if ("))
			return handleConditionalAssignmentToUninitializedVariable(varName, continuation, instructions);
		if (!continuation.contains("=") || !continuation.contains(";"))
			return Result.err(new CompileError("Uninitialized variable '" + varName + "' must be assigned before use"));
		return handleMutableVariableWithAssignment(varName, null, continuation, instructions, isMutable,
				new java.util.HashMap<>(), 100);
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions) {
		LetBindingProcessor.ProcessContext ctx = new LetBindingProcessor.ProcessContext(
				instructions, new java.util.HashMap<>(), 100, new java.util.HashMap<>(),
				new java.util.HashMap<>());
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, StructDefinition> structRegistry,
			java.util.Map<String, FunctionHandler.FunctionDef> functionRegistry) {
		LetBindingProcessor.ProcessContext ctx = new LetBindingProcessor.ProcessContext(
				instructions, new java.util.HashMap<>(), 100, structRegistry, functionRegistry);
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	private static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt, int equalsIndex, int semiIndex, String continuation,
			List<Instruction> instructions, java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		LetBindingProcessor.ProcessContext ctx = new LetBindingProcessor.ProcessContext(
				instructions, variableAddresses, nextMemAddr, new java.util.HashMap<>(),
				new java.util.HashMap<>());
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	private static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt, int equalsIndex, int semiIndex, String continuation,
			LetBindingProcessor.ProcessContext ctx) {
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	public static Result<Void, CompileError> handleScopedBlock(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		continuation = continuation.trim();
		if (!continuation.startsWith("{"))
			return Result.err(new CompileError("Expected '{' for scoped block"));
		int closingBrace = DepthAwareSplitter.findMatchingBrace(continuation, 0);
		if (closingBrace == -1)
			return Result.err(new CompileError("Unmatched '{' in scoped block"));
		String blockContent = continuation.substring(1, closingBrace).trim();
		String afterBrace = continuation.substring(closingBrace + 1).trim();
		if (initialValueExpr != null) {
			Result<Void, CompileError> storeResult = parseAndStoreInMemory(initialValueExpr, instructions);
			if (storeResult instanceof Result.Err<Void, CompileError>)
				return storeResult;
		}
		String remaining = blockContent;
		while (true) {
			Result<AssignmentParseResult, CompileError> assignResult = parseAssignment(varName, remaining);
			if (!(assignResult instanceof Result.Ok<AssignmentParseResult, CompileError> assignOk))
				break;
			AssignmentParseResult parsed = assignOk.value();
			Result<Void, CompileError> processResult = processAssignmentValue(parsed.valueExpr(), instructions, nextMemAddr);
			if (processResult instanceof Result.Err<Void, CompileError>)
				return processResult;
			remaining = parsed.remaining();
		}
		if (!remaining.isEmpty() && !remaining.equals(varName))
			return Result.err(new CompileError("Scoped block must end with variable reference, but got: " + remaining));
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) nextMemAddr));
		if (!afterBrace.isEmpty() && !afterBrace.equals(varName)) {
			java.util.Map<String, Integer> contextWithVar = new java.util.HashMap<>(variableAddresses);
			contextWithVar.put(varName, nextMemAddr);
			return handleVariableReference(varName, afterBrace, instructions, contextWithVar, nextMemAddr);
		}
		return Result.ok(null);
	}

	public static Result<Void, CompileError> handleYieldBlock(
			String varName,
			String blockContent,
			String continuation,
			List<Instruction> instructions,
			int storeAddr) {
		// Find yield keyword
		int yieldIdx = blockContent.indexOf("yield");
		if (yieldIdx == -1)
			return Result.err(new CompileError("Expected 'yield' in block"));

		// Get content before yield (statements to execute)
		String beforeYield = blockContent.substring(0, yieldIdx).trim();

		// Get yield expression (after 'yield' keyword)
		String afterYield = blockContent.substring(yieldIdx + 5).trim();

		// Remove trailing semicolon from afterYield if present
		if (afterYield.endsWith(";"))
			afterYield = afterYield.substring(0, afterYield.length() - 1).trim();

		// Execute statements before yield
		if (!beforeYield.isEmpty()) {
			String[] statements = beforeYield.split(";");
			for (String stmt : statements) {
				stmt = stmt.trim();
				if (!stmt.isEmpty()) {
					Result<Void, CompileError> stmtResult = App.parseStatement(stmt, instructions);
					if (stmtResult instanceof Result.Err<Void, CompileError>)
						return stmtResult;
				}
			}
		}

		// Evaluate yield expression
		Result<ExpressionModel.ExpressionResult, CompileError> yieldResult = App.parseExpressionWithRead(afterYield);
		if (yieldResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> yieldErr)
			return Result.err(yieldErr.error());
		ExpressionModel.ExpressionResult yieldOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) yieldResult)
				.value();

		// Generate instructions for the yield expression
		Result<Void, CompileError> genResult = App.generateInstructions(yieldOk, instructions);
		if (genResult instanceof Result.Err<Void, CompileError>)
			return genResult;

		// Store result to memory address
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) storeAddr));

		// Load result back to register 0
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) storeAddr));

		// Handle continuation if not empty
		if (!continuation.isEmpty() && !continuation.equals(varName)) {
			return App.parseStatement(continuation, instructions);
		}

		return Result.ok(null);
	}

	public static Result<Void, CompileError> handleWhileLoopAfterLet(String varName, String initialValueExpr,
			String continuation, List<Instruction> instructions, java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		// Store the initial value at the correct memory address
		Result<Void, CompileError> storeResult = CompilerHelpers.parseAndStoreInMemory(initialValueExpr, instructions,
				nextMemAddr);
		if (storeResult instanceof Result.Err<Void, CompileError>)
			return storeResult;

		// Add variable to context
		java.util.Map<String, Integer> context = new java.util.HashMap<>(variableAddresses);
		context.put(varName, nextMemAddr);

		// Delegate to WhileLoopHandler with the context containing the variable
		return WhileLoopHandler.handleWhileLoop(continuation, "", instructions, context);
	}

	public static Result<Void, CompileError> handleForLoopAfterLet(String varName, String initialValueExpr,
			String continuation, List<Instruction> instructions, java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		return ForLoopProcessor.handleForLoopAfterLet(varName, initialValueExpr, continuation, instructions,
				variableAddresses, nextMemAddr);
	}

	public static Result<Void, CompileError> handleChainedLetBinding(
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
			// For pointer types with reference operator, just continue without type
			// checking
			// For other types, we should validate type compatibility
			if (!isPointerType && !secondValueExpr.startsWith("&")) {
				// Extract the type of the value expression
				java.util.Map<String, String> typeContext = new java.util.HashMap<>();
				typeContext.put(varName, valueExpr);

				Result<String, CompileError> valueTypeResult = ExpressionTokens.extractTypeFromExpression(secondValueExpr,
						typeContext);
				if (declaredType != null && valueTypeResult instanceof Result.Ok<String, CompileError> valueTypeOk) {
					String valueType = valueTypeOk.value();
					// Check type compatibility
					if (!ExpressionTokens.isTypeCompatible(valueType, declaredType)) {
						return Result.err(new CompileError("Type mismatch in let binding: variable '" +
								secondDeclPart.split(":")[0].trim() + "' declared as " + declaredType +
								" but initialized with " + valueType));
					}
				}
			}

			// Substitute the first variable in the second binding's value expression
			// BUT: Skip substitution for reference expressions since they should refer to
			// variable names, not values
			String substitutedValueExpr = secondValueExpr;
			if (!secondValueExpr.trim().startsWith("&")) {
				substitutedValueExpr = secondValueExpr.replaceAll("\\b" + varName + "\\b", valueExpr);
			}
			// Rebuild the continuation with substituted value
			String substitutedContinuation = "let " + secondDeclPart + " = " + substitutedValueExpr + "; " + nextContinuation;

			// Find indices in the NEW string
			int newEqualsIndex = substitutedContinuation.indexOf('=');
			int newSemiIndex = substitutedContinuation.indexOf(';', newEqualsIndex);

			return handleLetBindingWithContinuation(substitutedContinuation, newEqualsIndex, newSemiIndex,
					nextContinuation, instructions, newContext, nextMemAddr + 1);
		});
	}

	public static Result<Void, CompileError> handleVariableReference(
			String valueExpr,
			String continuation,
			List<Instruction> instructions,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		return storeAndThen(valueExpr, instructions, nextMemAddr, () -> {
			// Load the referenced variable from memory
			int refAddr = variableAddresses.get(continuation);
			DepthAwareSplitter.addLoadAndHalt(instructions, (long) refAddr);
			return Result.ok(null);
		});
	}

	public static Result<Void, CompileError> handleMultipleVariableReferences(
			String varName,
			String valueExpr,
			String continuation,
			int occurrences,
			List<Instruction> instructions) {
		// Variable used multiple times - need to cache value in memory
		Result<Void, CompileError> storeResult = parseAndStoreInMemory(valueExpr, instructions);
		if (storeResult instanceof Result.Err<Void, CompileError> storeErr) {
			return Result.err(storeErr.error());
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
		return CompilerHelpers.parseAndStoreInMemory(valueExpr, instructions, 100);
	}

	private static Result<Void, CompileError> storeAndThen(
			String valueExpr,
			List<Instruction> instructions,
			int memAddr,
			java.util.function.Supplier<Result<Void, CompileError>> continuation) {
		Result<Void, CompileError> storeResult = CompilerHelpers.parseAndStoreInMemory(valueExpr, instructions, memAddr);
		if (storeResult instanceof Result.Err<Void, CompileError>) {
			return storeResult;
		}
		return continuation.get();
	}

	public static Result<Void, CompileError> handleMutableVariableWithAssignment(
			String varName,
			String initialValueExpr,
			String continuation,
			List<Instruction> instructions,
			boolean isMutableUninitialized,
			java.util.Map<String, Integer> variableAddresses,
			int nextMemAddr) {
		boolean isUninitialized = initialValueExpr == null;
		java.util.Map<String, Integer> addresses = new java.util.HashMap<>(variableAddresses);
		addresses.put(varName, nextMemAddr);

		// Parse and evaluate initial value if provided, store in memory
		if (initialValueExpr != null) {
			Result<Void, CompileError> storeResult = parseAndStoreInMemory(initialValueExpr, instructions);
			if (storeResult instanceof Result.Err<Void, CompileError>)
				return storeResult;
		}

		// Use MutableAssignmentHandler to process assignments
		Result<Void, CompileError> assignmentResult = MutableAssignmentHandler.handleAssignment(
				varName, continuation, instructions, nextMemAddr, isUninitialized, isMutableUninitialized);
		if (assignmentResult instanceof Result.Err<Void, CompileError>)
			return assignmentResult;

		// Final part should be variable reference
		String remaining = continuation;
		// Find final remaining after all assignments
		while (true) {
			int eqIndex = remaining.indexOf('=');
			if (eqIndex == -1)
				break;
			int semiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, eqIndex);
			if (semiIndex == -1)
				break;
			remaining = remaining.substring(semiIndex + 1).trim();
		}

		if (remaining.equals(varName)) {
			CompilerHelpers.loadVariableAndHalt(instructions, (long) nextMemAddr);
			return Result.ok(null);
		}

		// Check if remaining is a while loop
		if (remaining.startsWith("while (")) {
			return WhileLoopHandler.handleWhileLoop(remaining, "", instructions, addresses);
		}

		return Result.err(new CompileError(
				"Mutable variable continuation must end with variable reference or expression"));
	}

	static Result<Void, CompileError> processAssignmentValue(String valueExpr, List<Instruction> instructions,
			int nextMemAddr) {
		Result<ExpressionModel.ExpressionResult, CompileError> exprResult = App.parseExpressionWithRead(valueExpr);
		if (exprResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> exprErr)
			return Result.err(exprErr.error());
		ExpressionModel.ExpressionResult exprOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) exprResult)
				.value();
		Result<Void, CompileError> assignGenResult = App.generateInstructions(exprOk, instructions);
		if (assignGenResult instanceof Result.Err<Void, CompileError>)
			return assignGenResult;
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) nextMemAddr));
		return Result.ok(null);
	}

	static Result<AssignmentParseResult, CompileError> parseAssignment(String varName, String remaining) {
		String trimmed = remaining.trim();
		boolean isDereference = trimmed.startsWith("*");
		String assignTarget = isDereference ? ("*" + varName) : varName;
		if (!trimmed.startsWith(assignTarget + " ") && !trimmed.startsWith(assignTarget + "=")) {
			return Result.err(new CompileError("Not an assignment"));
		}
		int assignEqIndex = remaining.indexOf('=');
		if (assignEqIndex == -1) {
			return Result.err(new CompileError("Not an assignment"));
		}
		String beforeEq = remaining.substring(0, assignEqIndex).trim();
		String compoundOp = null;
		if (beforeEq.equals(assignTarget)) {
			// Simple assignment
		} else if (beforeEq.length() > assignTarget.length()) {
			String potential = beforeEq.substring(assignTarget.length()).trim();
			if (potential.length() == 1 && (potential.equals("+") || potential.equals("-")
					|| potential.equals("*") || potential.equals("/"))) {
				compoundOp = potential;
			} else {
				return Result.err(new CompileError("Not an assignment"));
			}
		} else {
			return Result.err(new CompileError("Not an assignment"));
		}
		int assignSemiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, assignEqIndex);
		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid assignment: missing ';'"));
		}
		String assignValueExpr = remaining.substring(assignEqIndex + 1, assignSemiIndex).trim();
		String nextRemaining = remaining.substring(assignSemiIndex + 1).trim();
		return Result.ok(new AssignmentParseResult(assignValueExpr, nextRemaining, isDereference, compoundOp));
	}

	static record AssignmentParseResult(String valueExpr, String remaining, boolean isDereference, String compoundOp) {
	}

	private static Result<Void, CompileError> handleConditionalAssignmentToUninitializedVariable(String varName, String s,
			List<Instruction> instructions) {
		return ConditionalExpressionHandler.buildConditionalAssignmentChain(varName, s, instructions, true);
	}

}
