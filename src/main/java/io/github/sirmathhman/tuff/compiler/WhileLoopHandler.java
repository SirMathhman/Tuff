package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.CompilerHelpers;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.lib.ArrayList;
import java.util.Map;

public final class WhileLoopHandler {
	private WhileLoopHandler() {
	}

	public static boolean hasWhileLoop(String stmt) {
		return stmt.startsWith("while (");
	}

	public static Result<Void, CompileError> handleWhileLoop(String stmt, String continuation,
			ArrayList<Instruction> instructions, Map<String, Integer> variableAddresses) {
		var instr = instructions;
		var conditionEnd = CompilerHelpers.findConditionEnd(stmt, 7);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed while loop: missing closing paren for condition"));
		}

		var condition = stmt.substring(7, conditionEnd);
		var remaining = stmt.substring(conditionEnd + 1).trim();
		var loopParts = parseLoopParts(remaining, continuation);

		var loopStartIdx = instr.size();

		var condResult = evaluateLoopCondition(condition, variableAddresses, instr);
		if (condResult instanceof Result.Err<Void, CompileError>) {
			return condResult;
		}

		instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 2, -1L));
		instr = instr.add(new Instruction(Operation.Add, Variant.Immediate, 2, 0L));

		var exitJumpIdx = instr.size();
		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, null));

		if (!loopParts.body.contains("=")) {
			return Result.err(new CompileError("While loop body must contain assignment"));
		}

		var bodyResult = parseLoopBody(loopParts.body, instr, variableAddresses);
		if (bodyResult instanceof Result.Err<Void, CompileError>) {
			return bodyResult;
		}

		instr = instr.add(new Instruction(Operation.Jump, Variant.Immediate, 0, (long) loopStartIdx));
		var exitIdx = instr.size();
		instr = instr.set(exitJumpIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 2L, (long) exitIdx));

		return handleAfterLoop(loopParts.afterLoop, variableAddresses, instr);
	}

	private static class LoopParts {
		final String body;
		final String afterLoop;

		LoopParts(String body, String afterLoop) {
			this.body = body;
			this.afterLoop = afterLoop;
		}
	}

	private static LoopParts parseLoopParts(String remaining, String continuation) {
		if (remaining.startsWith("{")) {
			var closeIdx = DepthAwareSplitter.findMatchingBrace(remaining, 0);
			if (closeIdx != -1) {
				var body = remaining.substring(1, closeIdx).trim();
				var afterLoop = remaining.substring(closeIdx + 1).trim();
				return new LoopParts(body, afterLoop);
			}
		}

		var semiIdx = findSemicolonAtDepth(remaining);
		if (semiIdx == -1) {
			return new LoopParts(remaining, continuation);
		}

		var body = remaining.substring(0, semiIdx).trim();
		var afterLoop = remaining.substring(semiIdx + 1).trim();
		return new LoopParts(body, afterLoop);
	}

	private static Result<Void, CompileError> handleAfterLoop(String afterLoop, Map<String, Integer> variableAddresses,
			ArrayList<Instruction> instructions) {
		var instr = instructions;
		if (afterLoop.isEmpty()) {
			return Result.ok(null);
		}

		if (variableAddresses.containsKey(afterLoop)) {
			instr = instr
					.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) variableAddresses.get(afterLoop)));
			instr = instr.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
			return Result.ok(null);
		}

		return App.parseStatement(afterLoop, instr);
	}

	private static Result<Void, CompileError> parseLoopBody(String body, ArrayList<Instruction> instructions,
			Map<String, Integer> variableAddresses) {
		var parts = body.split("=", 2);
		if (parts.length != 2) {
			return Result.err(new CompileError("Invalid loop body: expected assignment"));
		}

		var lhs = parts[0].trim();
		var rhs = parts[1].trim();
		var operator = extractCompoundOp(lhs);

		if (operator != null) {
			return handleCompoundOp(lhs.substring(0, lhs.length() - 1).trim(), rhs, operator, instructions,
					variableAddresses);
		}

		var varAddr = variableAddresses.get(lhs);
		if (varAddr == null) {
			return Result.err(new CompileError("Undefined variable: " + lhs));
		}

		if (rhs.startsWith(lhs)) {
			return handleSelfReferentialAssignment(lhs, varAddr, rhs.substring(lhs.length()).trim(), instructions);
		}

		return parseAndGenerateExpression(rhs, instructions, varAddr);
	}

	private static Result<Void, CompileError> parseAndGenerateExpression(String expr, ArrayList<Instruction> instructions,
			Integer storeAddr) {
		var instr = instructions;
		var rhsResult = App.parseExpressionWithRead(expr);
		if (rhsResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> err) {
			return Result.err(err.error());
		}
		if (!(rhsResult instanceof Result.Ok<ExpressionModel.ExpressionResult, CompileError> ok)) {
			return Result.err(new CompileError("Internal error: expected Ok or Err parsing RHS"));
		}

		var genResult = App.generateInstructions(ok.value(), instr);
		if (genResult instanceof Result.Err<Void, CompileError>) {
			return genResult;
		}

		if (storeAddr != null) {
			instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) storeAddr));
		}
		return Result.ok(null);
	}

	private static String extractCompoundOp(String lhs) {
		if (lhs.endsWith("+"))
			return "+=";
		if (lhs.endsWith("-"))
			return "-=";
		if (lhs.endsWith("*"))
			return "*=";
		if (lhs.endsWith("/"))
			return "/=";
		return null;
	}

	private static Result<Void, CompileError> handleCompoundOp(String varName, String rhs, String operator,
			ArrayList<Instruction> instructions, Map<String, Integer> variableAddresses) {
		var instr = instructions;
		var varAddr = variableAddresses.get(varName);
		if (varAddr == null) {
			return Result.err(new CompileError("Undefined variable: " + varName));
		}

		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		var parseResult = parseAndGenerateExpression(rhs, instr, null);
		if (parseResult instanceof Result.Err<Void, CompileError>) {
			return parseResult;
		}

		var op = switch (operator) {
			case "+=" -> Operation.Add;
			case "-=" -> Operation.Sub;
			case "*=" -> Operation.Mul;
			case "/=" -> Operation.Div;
			default -> throw new IllegalArgumentException("Unknown operator: " + operator);
		};

		instr = instr.add(new Instruction(op, Variant.Immediate, 0, 0L));
		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> handleSelfReferentialAssignment(String varName, int varAddr,
			String rhsAfterVar, ArrayList<Instruction> instructions) {
		var instr = instructions;
		if (rhsAfterVar.isEmpty()) {
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));
			instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
			return Result.ok(null);
		}

		if ("-+*/".indexOf(rhsAfterVar.substring(0, 1)) == -1) {
			return Result.err(new CompileError("Invalid operator in assignment: " + rhsAfterVar));
		}

		var opChar = rhsAfterVar.charAt(0);
		var expr = rhsAfterVar.substring(1).trim();

		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) varAddr));

		try {
			var literalValue = Long.parseLong(expr);
			instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 1, literalValue));
			var op = getOperationFromChar(opChar);
			instr = instr.add(new Instruction(op, Variant.Immediate, 0, 1L));
		} catch (NumberFormatException e) {
			var complexResult = handleComplexRhsExpression(opChar, expr, instr);
			if (complexResult instanceof Result.Err<Void, CompileError>) {
				return complexResult;
			}
		}

		instr = instr.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, (long) varAddr));
		return Result.ok(null);
	}

	private static Result<Void, CompileError> handleComplexRhsExpression(char opChar, String expr,
			ArrayList<Instruction> instructions) {
		@SuppressWarnings("unchecked")
		ArrayList<Instruction>[] holder = (ArrayList<Instruction>[]) new ArrayList<?>[1];
		holder[0] = instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, 0L))
				.add(new Instruction(Operation.Add, Variant.Immediate, 1, 0L));
		Result<Void, CompileError> genResult = App.parseExpressionWithRead(expr)
				.match(parsed -> App.generateInstructions(parsed, holder[0]), Result::err);
		if (genResult instanceof Result.Err<Void, CompileError>) {
			return genResult;
		}

		if (opChar == '-') {
			holder[0] = holder[0].add(new Instruction(Operation.Sub, Variant.Immediate, 1, 0L))
					.add(new Instruction(Operation.Load, Variant.Immediate, 0, 0L))
					.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
		} else {
			var op = getOperationFromChar(opChar);
			holder[0] = holder[0].add(new Instruction(op, Variant.Immediate, 0, 1L));
		}

		return Result.ok(null);
	}

	private static Operation getOperationFromChar(char opChar) {
		return switch (opChar) {
			case '+' -> Operation.Add;
			case '-' -> Operation.Sub;
			case '*' -> Operation.Mul;
			case '/' -> Operation.Div;
			default -> throw new IllegalArgumentException();
		};
	}

	private static int findSemicolonAtDepth(String str) {
		var depth = 0;
		for (var i = 0; i < str.length(); i++) {
			var c = str.charAt(i);
			if (c == '(' || c == '{')
				depth++;
			else if (c == ')' || c == '}')
				depth--;
			else if (c == ';' && depth == 0)
				return i;
		}
		return -1;
	}

	private static Result<Void, CompileError> evaluateLoopCondition(String condition,
			Map<String, Integer> variableAddresses, ArrayList<Instruction> instructions) {
		var instr = instructions;
		var parts = findComparisonParts(condition);
		var operator = findComparisonOperator(condition);

		if (parts == null || parts.length != 2) {
			return Result.err(new CompileError("Invalid condition: " + condition));
		}

		var lhs = parts[0].trim();
		var rhs = parts[1].trim();

		var lhsAddr = variableAddresses.get(lhs);
		if (lhsAddr == null) {
			return Result.err(new CompileError("Undefined variable in condition: " + lhs));
		}

		instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, (long) lhsAddr));

		var rhsAddr = variableAddresses.get(rhs);
		if (rhsAddr != null) {
			instr = instr.add(new Instruction(Operation.Load, Variant.DirectAddress, 1, (long) rhsAddr));
		} else {
			try {
				var rhsValue = Long.parseLong(rhs);
				instr = instr.add(new Instruction(Operation.Load, Variant.Immediate, 1, rhsValue));
			} catch (NumberFormatException e) {
				return Result.err(new CompileError("Invalid RHS in condition: " + rhs));
			}
		}

		return applyComparisonOp(operator, instr);
	}

	private static String[] findComparisonParts(String condition) {
		if (condition.contains("=="))
			return condition.split("==", 2);
		if (condition.contains("!="))
			return condition.split("!=", 2);
		if (condition.contains("<="))
			return condition.split("<=", 2);
		if (condition.contains(">="))
			return condition.split(">=", 2);
		if (condition.contains("<"))
			return condition.split("<", 2);
		if (condition.contains(">"))
			return condition.split(">", 2);
		return null;
	}

	private static String findComparisonOperator(String condition) {
		if (condition.contains("=="))
			return "==";
		if (condition.contains("!="))
			return "!=";
		if (condition.contains("<="))
			return "<=";
		if (condition.contains(">="))
			return ">=";
		if (condition.contains("<"))
			return "<";
		if (condition.contains(">"))
			return ">";
		return null;
	}

	private static Result<Void, CompileError> applyComparisonOp(String operator, ArrayList<Instruction> instructions) {
		var instr = instructions;
		switch (operator) {
			case "==" -> instr = instr.add(new Instruction(Operation.Equal, Variant.Immediate, 0, 1L));
			case "!=" -> instr = instr.add(new Instruction(Operation.Equal, Variant.Immediate, 0, 1L))
					.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
			case "<" -> instr = instr.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L));
			case ">" -> instr = instr.add(new Instruction(Operation.GreaterThan, Variant.Immediate, 0, 1L));
			case "<=" -> instr = instr.add(new Instruction(Operation.GreaterThan, Variant.Immediate, 0, 1L))
					.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
			case ">=" -> instr = instr.add(new Instruction(Operation.LessThan, Variant.Immediate, 0, 1L))
					.add(new Instruction(Operation.LogicalNot, Variant.Immediate, 0, 0L));
		}
		return Result.ok(null);
	}
}
