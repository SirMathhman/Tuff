package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.lib.ArrayList;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

/**
 * Handler for mutable variable assignments (x = value, x += value, etc).
 */
public final class MutableAssignmentHandler {
	private MutableAssignmentHandler() {
	}

	public record AssignmentContext(ArrayList<Instruction> instructions, int nextMemAddr) {
	}

	public static Result<ArrayList<Instruction>, CompileError> handleAssignment(
			String varName,
			String continuation,
			boolean isUninitialized,
			boolean isMutableUninitialized,
			AssignmentContext ctx) {
		var instructions = ctx.instructions();
		var nextMemAddr = ctx.nextMemAddr();
		var remaining = continuation;
		var assignmentCount = 0;
		while (true) {
			var assignResult = LetBindingHandler
					.parseAssignment(varName, remaining);
			if (!(assignResult instanceof Result.Ok<LetBindingHandler.AssignmentParseResult, CompileError> assignOk)) {
				break; // No more assignments
			}

			var parsed = assignOk.value();
			var validationResult = validateUninitializedAssignment(isUninitialized,
					varName, assignmentCount, isMutableUninitialized);
			if (validationResult instanceof Result.Err<Void, CompileError> err)
				return Result.err(err.error());
			assignmentCount++;

			if (parsed.isDereference()) {
				var parseResult = parseAndEvaluateExpression(parsed.valueExpr(), instructions);
				if (parseResult instanceof Result.Err<ArrayList<Instruction>, CompileError> err)
					return Result.err(err.error());
				instructions = ((Result.Ok<ArrayList<Instruction>, CompileError>) parseResult).value();
				instructions = instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) nextMemAddr));
				instructions = instructions.add(new Instruction(Operation.Store, Variant.IndirectAddress, 0, 1L));
			} else {
				Result<ArrayList<Instruction>, CompileError> processResult;
				if (parsed.compoundOp() != null) {
					processResult = CompoundAssignmentHandler.handle(
							parsed.valueExpr(), parsed.compoundOp(), nextMemAddr, instructions);
				} else {
					processResult = LetBindingHandler.processAssignmentValue(parsed.valueExpr(), instructions, nextMemAddr);
				}
				if (processResult instanceof Result.Err<ArrayList<Instruction>, CompileError> err)
					return Result.err(err.error());
				instructions = ((Result.Ok<ArrayList<Instruction>, CompileError>) processResult).value();
			}
			remaining = parsed.remaining();
		}
		return Result.ok(instructions);
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

	static Result<ArrayList<Instruction>, CompileError> parseAndEvaluateExpression(String valueExpr,
			ArrayList<Instruction> instructions) {
		return App.parseExpressionWithRead(valueExpr)
				.flatMap(expr -> App.generateInstructions(expr, instructions));
	}
}
