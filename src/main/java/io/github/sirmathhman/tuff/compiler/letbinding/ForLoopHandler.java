package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.List;
import java.util.Map;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.DepthAwareSplitter;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class ForLoopHandler {
	private ForLoopHandler() {
	}

	public static Result<Void, CompileError> handleForLoop(String stmt, List<Instruction> instructions,
			Map<String, Integer> externalVariables) {
		stmt = stmt.trim();
		int conditionEnd = CompilerHelpers.findConditionEnd(stmt, 5);
		if (conditionEnd == -1) {
			return Result
					.err(new CompileError("Malformed for loop: missing closing paren for condition. Statement: " + stmt));
		}

		String condition = stmt.substring(5, conditionEnd);
		String remaining = stmt.substring(conditionEnd + 1).trim();

		Result<ForLoopCondition, CompileError> parseResult = parseForLoopCondition(condition);
		if (parseResult instanceof Result.Err<ForLoopCondition, CompileError> parseErr) {
			return Result.err(parseErr.error());
		}
		ForLoopCondition loopCond = ((Result.Ok<ForLoopCondition, CompileError>) parseResult).value();

		if (remaining.isEmpty()) {
			return Result.err(new CompileError("For loop requires body"));
		}

		Result<Integer, CompileError> setupResult = setupLoopVariables(loopCond.startExpr(), loopCond.endExpr(),
				instructions, externalVariables, loopCond.iterVarName());
		if (setupResult instanceof Result.Err<Integer, CompileError> setupErr) {
			return Result.err(setupErr.error());
		}
		Integer iterVarAddr = ((Result.Ok<Integer, CompileError>) setupResult).value();
		int loopConditionIdx = instructions.size();

		// Load and compare loop condition
		addLoopConditionComparison(instructions, iterVarAddr);

		// Placeholder for exit jump
		int exitJumpIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		// Parse body
		Result<Void, CompileError> bodyResult = parseForLoopBody(remaining, iterVarAddr, loopCond.iterVarName(),
				instructions, externalVariables);
		if (bodyResult instanceof Result.Err<Void, CompileError>) {
			return bodyResult;
		}

		// Increment iterator and jump back
		addLoopIncrement(instructions, iterVarAddr, loopConditionIdx);

		// Set exit jump
		int exitIdx = instructions.size();
		instructions.set(exitJumpIdx, new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 2L, (long) exitIdx));

		// Handle after-loop continuation
		return handleLoopContinuation(remaining, instructions);
	}

	private static void addLoopConditionComparison(List<Instruction> instructions, Integer iterVarAddr) {
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) iterVarAddr));
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, 201L));
		instructions.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, -1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 2, 0L));
	}

	private static void addLoopIncrement(List<Instruction> instructions, Integer iterVarAddr, int loopConditionIdx) {
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) iterVarAddr));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, 1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) iterVarAddr));
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopConditionIdx));
	}

	private static Result<Void, CompileError> handleLoopContinuation(String remaining, List<Instruction> instructions) {
		int bodyEndSemiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(remaining, 0);
		if (bodyEndSemiIdx != -1 && bodyEndSemiIdx + 1 < remaining.length()) {
			String afterLoop = remaining.substring(bodyEndSemiIdx + 1).trim();
			if (!afterLoop.isEmpty()) {
				return App.parseStatement(afterLoop, instructions);
			}
		}
		return Result.ok(null);
	}

	private static Result<Integer, CompileError> setupLoopVariables(
			String startExpr,
			String endExpr,
			List<Instruction> instructions,
			Map<String, Integer> externalVariables,
			String iterVarName) {
		Integer iterVarAddr = externalVariables.getOrDefault(iterVarName, 200);

		// Parse and evaluate start value
		if (externalVariables.containsKey(startExpr)) {
			Integer startVarAddr = externalVariables.get(startExpr);
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) startVarAddr));
		} else {
			Result<ExpressionModel.ExpressionResult, CompileError> startResult = App.parseExpressionWithRead(startExpr);
			if (startResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> startErr) {
				return Result.err(startErr.error());
			}
			ExpressionModel.ExpressionResult startOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) startResult)
					.value();
			Result<Void, CompileError> genStart = App.generateInstructions(startOk, instructions);
			if (genStart instanceof Result.Err<Void, CompileError> genStartErr) {
				return Result.err(genStartErr.error());
			}
		}

		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) iterVarAddr));

		// Parse and evaluate end value
		if (externalVariables.containsKey(endExpr)) {
			Integer endVarAddr = externalVariables.get(endExpr);
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) endVarAddr));
		} else {
			Result<ExpressionModel.ExpressionResult, CompileError> endResult = App.parseExpressionWithRead(endExpr);
			if (endResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> endErr) {
				return Result.err(endErr.error());
			}
			ExpressionModel.ExpressionResult endOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) endResult)
					.value();
			Result<Void, CompileError> genEnd = App.generateInstructions(endOk, instructions);
			if (genEnd instanceof Result.Err<Void, CompileError> genEndErr) {
				return Result.err(genEndErr.error());
			}
		}

		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 201L));
		return Result.ok(iterVarAddr);
	}

	private static Result<ForLoopCondition, CompileError> parseForLoopCondition(String condition) {
		if (!condition.startsWith("let mut ")) {
			return Result.err(new CompileError("For loop requires 'let mut' iterator variable. Got: " + condition));
		}

		String afterLet = condition.substring(8);
		int inIndex = afterLet.indexOf(" in ");
		if (inIndex == -1) {
			return Result.err(new CompileError("For loop requires 'in' keyword"));
		}

		String iterVarName = afterLet.substring(0, inIndex).trim();
		String rangeExpr = afterLet.substring(inIndex + 4).trim();

		int dotDotIndex = findRangeSeparator(rangeExpr);
		if (dotDotIndex == -1) {
			return Result.err(new CompileError("For loop range must use '..' syntax"));
		}

		String startExpr = rangeExpr.substring(0, dotDotIndex).trim();
		String endExpr = rangeExpr.substring(dotDotIndex + 2).trim();

		return Result.ok(new ForLoopCondition(iterVarName, startExpr, endExpr));
	}

	private static int findRangeSeparator(String expr) {
		int depth = 0;
		for (int i = 0; i < expr.length() - 1; i++) {
			if (expr.charAt(i) == '(')
				depth++;
			else if (expr.charAt(i) == ')')
				depth--;
			else if (depth == 0 && expr.charAt(i) == '.' && expr.charAt(i + 1) == '.') {
				return i;
			}
		}
		return -1;
	}

	private static Result<Void, CompileError> parseForLoopBody(String body, Integer iterVarAddr, String iterVarName,
			List<Instruction> instructions, Map<String, Integer> externalVariables) {
		body = body.trim();

		// Find the end of the body (first semicolon at depth 0)
		int semiIdx = DepthAwareSplitter.findSemicolonAtDepthZero(body, 0);
		if (semiIdx == -1) {
			return Result.err(new CompileError("For loop body must end with semicolon"));
		}

		String bodyStmt = body.substring(0, semiIdx).trim();

		// Parse body as a statement (assignment or expression)
		if (bodyStmt.contains("+=") || bodyStmt.contains("-=") || bodyStmt.contains("*=") || bodyStmt.contains("/=")) {
			// Compound assignment
			return handleCompoundAssignmentInForLoop(bodyStmt, iterVarAddr, iterVarName, instructions, externalVariables);
		}

		// For now, just execute as expression
		Result<ExpressionModel.ExpressionResult, CompileError> bodyResult = App.parseExpressionWithRead(bodyStmt);
		if (bodyResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> bodyErr) {
			return Result.err(bodyErr.error());
		}
		ExpressionModel.ExpressionResult bodyOk = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) bodyResult)
				.value();
		return App.generateInstructions(bodyOk, instructions);
	}

	private static Result<Void, CompileError> handleCompoundAssignmentInForLoop(String stmt, Integer iterVarAddr,
			String iterVarName, List<Instruction> instructions, Map<String, Integer> externalVariables) {
		// Format: "var += expr" or similar
		String[] parts = stmt.split("\\+=|-=|\\*=|/=");
		if (parts.length != 2) {
			return Result.err(new CompileError("Invalid compound assignment"));
		}

		String varName = parts[0].trim();
		String exprStr = parts[1].trim();

		// Get variable address from external variables
		if (!externalVariables.containsKey(varName)) {
			return Result.err(new CompileError("Undefined variable: " + varName));
		}

		Integer varAddr = externalVariables.get(varName);

		// Determine the operator
		char opChar;
		if (stmt.contains("+="))
			opChar = '+';
		else if (stmt.contains("-="))
			opChar = '-';
		else if (stmt.contains("*="))
			opChar = '*';
		else if (stmt.contains("/="))
			opChar = '/';
		else
			return Result.err(new CompileError("Unknown compound operator"));

		// Load variable value
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		// Parse and evaluate right-hand side expression
		// If the RHS is just the loop iterator, load it directly to reg[3]
		if (exprStr.equals(iterVarName)) {
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 3, (long) iterVarAddr));
		} else {
			Result<Void, CompileError> genResult = CompilerHelpers.parseAndGenerateExpression(exprStr, instructions);
			if (genResult instanceof Result.Err<Void, CompileError>) {
				return genResult;
			}
		}

		// Apply the operation: registers[0] op= registers[0]
		// Variable is in reg[0], rhs result is in reg[0] or reg[3]
		// We need to do: result = var op rhs

		// Load variable again to reg[1]
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) varAddr));
		// Determine which register has the RHS
		int rhsReg = exprStr.equals(iterVarName) ? 3 : 0;
		// RHS result is in rhsReg, now do: reg[1] = reg[1] op reg[rhsReg]
		Operation op = switch (opChar) {
			case '+' -> Operation.Add;
			case '-' -> Operation.Sub;
			case '*' -> Operation.Mul;
			case '/' -> Operation.Div;
			default -> throw new IllegalArgumentException();
		};

		instructions.add(new Instruction(op, Variant.Immediate, 1, (long) rhsReg));
		// Store back to variable: result is now in reg[1]
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 1, (long) varAddr));

		return Result.ok(null);
	}

	record ForLoopCondition(String iterVarName, String startExpr, String endExpr) {
	}
}
