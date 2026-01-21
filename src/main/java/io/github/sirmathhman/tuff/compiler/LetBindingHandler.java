package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.lib.ArrayList;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.CompilerHelpers;
import io.github.sirmathhman.tuff.compiler.letbinding.ForLoopProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor;
import io.github.sirmathhman.tuff.compiler.letbinding.LetBindingProcessor.MutableVarContext;
import io.github.sirmathhman.tuff.compiler.letbinding.YieldBlockProcessor;
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
			ArrayList<Instruction> instructions) {
		var declPart = stmt.substring(4, semiIndex).trim();
		var isMutable = declPart.startsWith("mut ");
		if (isMutable)
			declPart = declPart.substring(4).trim();
		if (!declPart.contains(":"))
			return Result.err(new CompileError("Uninitialized variable must have explicit type annotation"));
		var varName = declPart.split(":")[0].trim();
		if (continuation.trim().startsWith("if ("))
			return handleConditionalAssignmentToUninitializedVariable(varName, continuation, instructions);
		if (!continuation.contains("=") || !continuation.contains(";"))
			return Result.err(new CompileError("Uninitialized variable '" + varName + "' must be assigned before use"));
		var ctx = new MutableVarContext(new java.util.HashMap<>(), 100);
		return handleMutableVariableWithAssignment(varName, null, continuation, isMutable,
				new MutableVarAssignmentContext(instructions, ctx));
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt,
			int equalsIndex,
			int semiIndex,
			String continuation,
			ArrayList<Instruction> instructions) {
		var ctx = new LetBindingProcessor.ProcessContext(
				instructions, new java.util.HashMap<>(), 100, new java.util.HashMap<>(),
				new java.util.HashMap<>(), new java.util.HashMap<>());
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	public static Result<Void, CompileError> handleLetBindingWithContinuation(
			String stmt, int equalsIndex, int semiIndex, String continuation,
			LetBindingProcessor.ProcessContext ctx) {
		return LetBindingProcessor.process(stmt, equalsIndex, semiIndex, continuation, ctx);
	}

	public static Result<Void, CompileError> handleScopedBlock(
			String varName,
			String initialValueExpr,
			String continuation,
			ArrayList<Instruction> instructions,
			MutableVarContext ctx) {
		var variableAddresses = ctx.variableAddresses();
		var nextMemAddr = ctx.nextMemAddr();
		var instr = instructions;
		var cont = continuation.trim();
		if (!cont.startsWith("{"))
			return Result.err(new CompileError("Expected '{' for scoped block"));
		var closingBrace = DepthAwareSplitter.findMatchingBrace(cont, 0);
		if (closingBrace == -1)
			return Result.err(new CompileError("Unmatched '{' in scoped block"));
		var blockContent = cont.substring(1, closingBrace).trim();
		var afterBrace = cont.substring(closingBrace + 1).trim();
		if (initialValueExpr != null) {
			var storeResult = parseAndStoreInMemory(initialValueExpr, instr);
			if (storeResult instanceof Result.Err<Void, CompileError>)
				return storeResult;
		}
		var remaining = blockContent;
		while (true) {
			var assignResult = parseAssignment(varName, remaining);
			if (!(assignResult instanceof Result.Ok<AssignmentParseResult, CompileError> assignOk))
				break;
			var parsed = assignOk.value();
			var processResult = processAssignmentValue(parsed.valueExpr(), instr, nextMemAddr);
			if (processResult instanceof Result.Err<Void, CompileError>)
				return processResult;
			remaining = parsed.remaining();
		}
		if (!remaining.isEmpty() && !remaining.equals(varName))
			return Result.err(new CompileError("Scoped block must end with variable reference, but got: " + remaining));
		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) nextMemAddr));
		if (!afterBrace.isEmpty() && !afterBrace.equals(varName)) {
			java.util.Map<String, Integer> contextWithVar = new java.util.HashMap<>(variableAddresses);
			contextWithVar.put(varName, nextMemAddr);
			return handleVariableReference(varName, afterBrace, instr, contextWithVar, nextMemAddr);
		}
		return Result.ok(null);
	}

	public static Result<Void, CompileError> handleYieldBlock(
			String varName,
			String blockContent,
			String continuation,
			ArrayList<Instruction> instructions,
			int storeAddr) {
		return YieldBlockProcessor.handleYieldBlock(varName, blockContent, continuation, instructions, storeAddr);
	}

	public static Result<Void, CompileError> handleWhileLoopAfterLet(String varName, String initialValueExpr,
			String continuation, ArrayList<Instruction> instructions, MutableVarContext ctx) {
		var variableAddresses = ctx.variableAddresses();
		var nextMemAddr = ctx.nextMemAddr();
		// Store the initial value at the correct memory address
		var storeResult = CompilerHelpers.parseAndStoreInMemory(initialValueExpr, instructions,
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
			String continuation, ArrayList<Instruction> instructions, MutableVarContext ctx) {
		return ForLoopProcessor.handleForLoopAfterLet(varName, initialValueExpr, continuation, instructions, ctx);
	}

	public static Result<Void, CompileError> handleChainedLetBinding(
			String varName,
			String valueExpr,
			String continuation,
			ArrayList<Instruction> instructions,
			MutableVarContext ctx) {
		var nextMemAddr = ctx.nextMemAddr();
		return storeAndThen(valueExpr, instructions, nextMemAddr,
				() -> continueChainedLetBinding(varName, valueExpr, continuation, instructions, ctx));
	}

	private record ChainedLetParts(String declPart, String valueExpr, String continuation) {
	}

	private static Result<ChainedLetParts, CompileError> parseChainedLetParts(String continuation) {
		var nextEqualsIndex = continuation.indexOf('=');
		if (nextEqualsIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing '='"));
		}
		var nextSemiIndex = continuation.indexOf(';', nextEqualsIndex);
		if (nextSemiIndex == -1) {
			return Result.err(new CompileError("Invalid let binding: missing ';'"));
		}
		var secondDeclPart = continuation.substring(4, nextEqualsIndex).trim();
		var secondValueExpr = continuation.substring(nextEqualsIndex + 1, nextSemiIndex).trim();
		var nextContinuation = continuation.substring(nextSemiIndex + 1).trim();
		return Result.ok(new ChainedLetParts(secondDeclPart, secondValueExpr, nextContinuation));
	}

	private static Result<Void, CompileError> validateChainedLetType(String varName, String valueExpr,
			ChainedLetParts parts) {
		var secondDeclPart = parts.declPart();
		var secondValueExpr = parts.valueExpr();
		var isPointerType = false;
		String declaredType = null;
		if (secondDeclPart.contains(":")) {
			var declParts = secondDeclPart.split(":");
			if (declParts.length == 2) {
				declaredType = declParts[1].trim();
				isPointerType = declaredType.startsWith("*");
			}
		}
		if (isPointerType || secondValueExpr.startsWith("&") || declaredType == null) {
			return Result.ok(null);
		}
		java.util.Map<String, String> typeContext = new java.util.HashMap<>();
		typeContext.put(varName, valueExpr);
		var valueTypeResult = ExpressionTokens.extractTypeFromExpression(secondValueExpr,
				typeContext);
		if (valueTypeResult instanceof Result.Err<String, CompileError>) {
			return Result.ok(null);
		}
		var valueType = ((Result.Ok<String, CompileError>) valueTypeResult).value();
		if (ExpressionTokens.isTypeCompatible(valueType, declaredType)) {
			return Result.ok(null);
		}
		var variableName = secondDeclPart.split(":")[0].trim();
		return Result.err(new CompileError("Type mismatch in let binding: variable '" + variableName +
				"' declared as " + declaredType + " but initialized with " + valueType));
	}

	private static Result<Void, CompileError> continueChainedLetBinding(String varName, String valueExpr,
			String continuation, ArrayList<Instruction> instructions, MutableVarContext ctx) {
		java.util.Map<String, Integer> newContext = new java.util.HashMap<>(ctx.variableAddresses());
		newContext.put(varName, ctx.nextMemAddr());
		var partsResult = parseChainedLetParts(continuation);
		if (partsResult instanceof Result.Err<ChainedLetParts, CompileError> partsErr) {
			return Result.err(partsErr.error());
		}
		var parts = ((Result.Ok<ChainedLetParts, CompileError>) partsResult).value();
		var typeResult = validateChainedLetType(varName, valueExpr, parts);
		if (typeResult instanceof Result.Err<Void, CompileError>) {
			return typeResult;
		}
		var substitutedValueExpr = parts.valueExpr();
		if (!substitutedValueExpr.trim().startsWith("&")) {
			substitutedValueExpr = substitutedValueExpr.replaceAll("\\b" + varName + "\\b", valueExpr);
		}
		var substitutedContinuation = "let " + parts.declPart() + " = " + substitutedValueExpr + "; "
				+ parts.continuation();
		var newEqualsIndex = substitutedContinuation.indexOf('=');
		var newSemiIndex = substitutedContinuation.indexOf(';', newEqualsIndex);
		var processCtx = new LetBindingProcessor.ProcessContext(
				instructions, newContext, ctx.nextMemAddr() + 1, new java.util.HashMap<>(),
				new java.util.HashMap<>(), new java.util.HashMap<>());
		return handleLetBindingWithContinuation(substitutedContinuation, newEqualsIndex, newSemiIndex,
				parts.continuation(), processCtx);
	}

	public static Result<Void, CompileError> handleVariableReference(
			String valueExpr,
			String continuation,
			ArrayList<Instruction> instructions,
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
			ArrayList<Instruction> instructions) {
		var instr = instructions;
		// Variable used multiple times - need to cache value in memory
		var storeResult = parseAndStoreInMemory(valueExpr, instr);
		if (storeResult instanceof Result.Err<Void, CompileError> storeErr) {
			return Result.err(storeErr.error());
		}

		var memAddr = 100;

		// For now, handle the specific case of "x + x"
		if (continuation.matches("^\\s*" + java.util.regex.Pattern.quote(varName) + "\\s*\\+\\s*"
				+ java.util.regex.Pattern.quote(varName) + "\\s*$")) {
			// Special case: x + x
			// Load value from memory address into register 1
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) memAddr));
			// Add register 1 to register 0
			instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
			// Result is in register 0, add Halt
			instr = instr.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		return Result.err(new CompileError(
				"Multiple variable references not yet fully supported for complex expressions"));
	}

	private static Result<Void, CompileError> parseAndStoreInMemory(String valueExpr,
			ArrayList<Instruction> instructions) {
		return CompilerHelpers.parseAndStoreInMemory(valueExpr, instructions, 100);
	}

	private static Result<Void, CompileError> storeAndThen(
			String valueExpr,
			ArrayList<Instruction> instructions,
			int memAddr,
			java.util.function.Supplier<Result<Void, CompileError>> continuation) {
		var storeResult = CompilerHelpers.parseAndStoreInMemory(valueExpr, instructions, memAddr);
		if (storeResult instanceof Result.Err<Void, CompileError>) {
			return storeResult;
		}
		return continuation.get();
	}

	public record MutableVarAssignmentContext(ArrayList<Instruction> instructions, MutableVarContext varCtx) {
	}

	public static Result<Void, CompileError> handleMutableVariableWithAssignment(
			String varName,
			String initialValueExpr,
			String continuation,
			boolean isMutableUninitialized,
			MutableVarAssignmentContext ctx) {
		var instr = ctx.instructions();
		var nextMemAddr = ctx.varCtx().nextMemAddr();
		var variableAddresses = ctx.varCtx().variableAddresses();
		var isUninitialized = initialValueExpr == null;
		java.util.Map<String, Integer> addresses = new java.util.HashMap<>(variableAddresses);
		addresses.put(varName, nextMemAddr);

		// Parse and evaluate initial value if provided, store in memory
		if (initialValueExpr != null) {
			var storeResult = parseAndStoreInMemory(initialValueExpr, instr);
			if (storeResult instanceof Result.Err<Void, CompileError>)
				return storeResult;
		}

		// Use MutableAssignmentHandler to process assignments
		var assignmentResult = MutableAssignmentHandler.handleAssignment(varName, continuation,
				isUninitialized, isMutableUninitialized,
				new MutableAssignmentHandler.AssignmentContext(instr, nextMemAddr));
		if (assignmentResult instanceof Result.Err<Void, CompileError>)
			return assignmentResult;

		// Final part should be variable reference or expression
		var remaining = continuation;
		// Find final remaining after all assignments
		while (true) {
			var eqIndex = remaining.indexOf('=');
			if (eqIndex == -1)
				break;
			var semiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, eqIndex);
			if (semiIndex == -1)
				break;
			remaining = remaining.substring(semiIndex + 1).trim();
		}

		// Normalize this.varName to varName
		var normalizedRemaining = remaining.replaceAll("\\bthis\\." + varName + "\\b", varName);

		if (normalizedRemaining.equals(varName)) {
			CompilerHelpers.loadVariableAndHalt(instr, (long) nextMemAddr);
			return Result.ok(null);
		}

		// Check if remaining contains variable references or is an expression
		if (normalizedRemaining.contains(varName)) {
			// Parse the expression - it will treat varName as a variable reference
			// The variable is already stored at nextMemAddr from the assignment
			var exprResult = App.parseExpressionWithRead(
					normalizedRemaining);
			if (exprResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok) {
				// Now we need to load the variable value and execute the expression
				// First load the variable from memory into a register
				instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) nextMemAddr));
				// Then generate instructions for the expression
				// But we need to substitute varName with a load instruction...
				// This is complex. For now, let's just return the expression result
				return App.generateInstructions(ok.value(), instr);
			}
		}

		// Check if remaining is a while loop
		if (normalizedRemaining.startsWith("while (")) {
			return WhileLoopHandler.handleWhileLoop(normalizedRemaining, "", instr, addresses);
		}

		return Result.err(new CompileError(

				"Mutable variable continuation must end with variable reference or expression"));
	}

	static Result<Void, CompileError> processAssignmentValue(String valueExpr, ArrayList<Instruction> instructions,
			int nextMemAddr) {
		var instr = instructions;
		var exprResult = App.parseExpressionWithRead(valueExpr);
		if (exprResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> exprErr)
			return Result.err(exprErr.error());
		var exprOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) exprResult)
				.value();
		var assignGenResult = App.generateInstructions(exprOk, instr);
		if (assignGenResult instanceof Result.Err<Void, CompileError>)
			return assignGenResult;
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) nextMemAddr));
		return Result.ok(null);
	}

	static Result<AssignmentParseResult, CompileError> parseAssignment(String varName, String remaining) {
		var trimmed = remaining.trim();
		var isDereference = trimmed.startsWith("*");
		String assignTarget;
		if (isDereference)
			assignTarget = "*" + varName;
		else
			assignTarget = varName;
		var thisTarget = "this." + varName;

		// Check if assignment uses this.varName syntax
		if (!isDereference && (trimmed.startsWith(thisTarget + " ") || trimmed.startsWith(thisTarget + "="))) {
			assignTarget = thisTarget;
		}

		if (!trimmed.startsWith(assignTarget + " ") && !trimmed.startsWith(assignTarget + "=")) {
			return Result.err(new CompileError("Not an assignment"));
		}
		var assignEqIndex = remaining.indexOf('=');
		if (assignEqIndex == -1) {
			return Result.err(new CompileError("Not an assignment"));
		}
		var beforeEq = remaining.substring(0, assignEqIndex).trim();
		String compoundOp = null;
		if (!beforeEq.equals(assignTarget)) {
			if (beforeEq.length() > assignTarget.length()) {
				var potential = beforeEq.substring(assignTarget.length()).trim();
				if (potential.length() == 1 && (potential.equals("+") || potential.equals("-")
						|| potential.equals("*") || potential.equals("/"))) {
					compoundOp = potential;
				} else {
					return Result.err(new CompileError("Not an assignment"));
				}
			} else {
				return Result.err(new CompileError("Not an assignment"));
			}
		} else {
			// Simple assignment
		}
		var assignSemiIndex = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, assignEqIndex);
		if (assignSemiIndex == -1) {
			return Result.err(new CompileError("Invalid assignment: missing ';'"));
		}
		var assignValueExpr = remaining.substring(assignEqIndex + 1, assignSemiIndex).trim();
		var nextRemaining = remaining.substring(assignSemiIndex + 1).trim();
		return Result.ok(new AssignmentParseResult(assignValueExpr, nextRemaining, isDereference, compoundOp));
	}

	static record AssignmentParseResult(String valueExpr, String remaining, boolean isDereference, String compoundOp) {
	}

	private static Result<Void, CompileError> handleConditionalAssignmentToUninitializedVariable(String varName, String s,
			ArrayList<Instruction> instructions) {
		return ConditionalExpressionHandler.buildConditionalAssignmentChain(varName, s, instructions, true);
	}

}
