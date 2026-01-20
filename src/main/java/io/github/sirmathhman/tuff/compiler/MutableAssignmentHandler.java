package io.github.sirmathhman.tuff.compiler;

import java.util.List;

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

	public static Result<Void, CompileError> handleAssignment(
			String varName,
			String continuation,
			List<Instruction> instructions,
			int nextMemAddr,
			boolean isUninitialized,
			boolean isMutableUninitialized) {
		String remaining = continuation;
		int assignmentCount = 0;
		while (true) {
			Result<LetBindingHandler.AssignmentParseResult, CompileError> assignResult = LetBindingHandler
					.parseAssignment(varName, remaining);
			if (!(assignResult instanceof Result.Ok<LetBindingHandler.AssignmentParseResult, CompileError> assignOk)) {
				break; // No more assignments
			}

			LetBindingHandler.AssignmentParseResult parsed = assignOk.value();
			Result<Void, CompileError> validationResult = validateUninitializedAssignment(isUninitialized,
					varName, assignmentCount, isMutableUninitialized);
			if (validationResult instanceof Result.Err<Void, CompileError>)
				return validationResult;
			assignmentCount++;

			if (parsed.isDereference()) {
				Result<Void, CompileError> parseResult = parseAndEvaluateExpression(parsed.valueExpr(), instructions);
				if (parseResult instanceof Result.Err<Void, CompileError>)
					return parseResult;
				instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) nextMemAddr));
				instructions.add(new Instruction(Operation.Store, Variant.IndirectAddress, 0, 1L));
			} else {
				Result<Void, CompileError> processResult;
				if (parsed.compoundOp() != null) {
					processResult = CompoundAssignmentHandler.handle(
							parsed.valueExpr(), parsed.compoundOp(), nextMemAddr, instructions);
				} else {
					processResult = LetBindingHandler.processAssignmentValue(parsed.valueExpr(), instructions, nextMemAddr);
				}
				if (processResult instanceof Result.Err<Void, CompileError>)
					return processResult;
			}
			remaining = parsed.remaining();
		}
		return Result.ok(null);
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

	static Result<Void, CompileError> parseAndEvaluateExpression(String valueExpr, List<Instruction> instructions) {
		return App.parseExpressionWithRead(valueExpr)
				.match(expr -> App.generateInstructions(expr, instructions), Result::err);
	}
}
