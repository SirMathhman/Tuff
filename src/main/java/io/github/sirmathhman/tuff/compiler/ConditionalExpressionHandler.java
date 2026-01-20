package io.github.sirmathhman.tuff.compiler;

import io.github.sirmathhman.tuff.App;
import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import java.util.ArrayList;
import java.util.List;

public final class ConditionalExpressionHandler {
	private ConditionalExpressionHandler() {
	}

	public static boolean hasConditional(String expr) {
		return expr.startsWith("if (");
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseConditional(String expr) {
		// Format: if (condition) trueValue else falseValue
		int conditionEnd = findConditionEnd(expr);
		if (conditionEnd == -1) {
			return Result.err(new CompileError("Malformed conditional: missing closing paren for condition"));
		}

		String condition = expr.substring(4, conditionEnd);
		String remaining = expr.substring(conditionEnd + 1).trim();

		int elseIndex = findElseKeyword(remaining);
		if (elseIndex == -1) {
			return Result.err(new CompileError("Malformed conditional: missing 'else' clause"));
		}

		return parseConditionAndBranches(condition, remaining, elseIndex);
	}

	public static int findConditionEnd(String expr) {
		int parenDepth = 1;
		for (int i = 4; i < expr.length(); i++) {
			char c = expr.charAt(i);
			if (c == '(')
				parenDepth++;
			else if (c == ')')
				parenDepth--;
			if (parenDepth == 0)
				return i;
		}
		return -1;
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseConditionAndBranches(
			String condition, String remaining, int elseIndex) {
		String trueExpr = remaining.substring(0, elseIndex).trim();
		String falseExpr = remaining.substring(elseIndex + 4).trim();

		Result<ExpressionModel.ExpressionResult, CompileError> condResult = parseExpressionForConditional(condition);
		if (condResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return condResult;

		// Validate that the condition is a Bool type
		Result<String, CompileError> condTypeResult = ExpressionTokens.extractTypeFromExpression(condition,
				new java.util.HashMap<>());
		Result<Void, CompileError> typeValidation = condTypeResult.match(condType -> {
			if (!condType.equals("Bool")) {
				return Result.err(new CompileError("Conditional expression requires Bool type, but got " + condType));
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
		if (typeValidation instanceof Result.Err<Void, CompileError> typeErr) {
			return Result.err(typeErr.error());
		}

		Result<ExpressionModel.ExpressionResult, CompileError> trueResult = parseExpressionForConditional(trueExpr);
		if (trueResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return trueResult;

		Result<ExpressionModel.ExpressionResult, CompileError> falseResult = parseExpressionForConditional(falseExpr);
		if (falseResult instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError>)
			return falseResult;

		ExpressionModel.ExpressionResult cond = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) condResult)
				.value();
		ExpressionModel.ExpressionResult trueVal = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) trueResult)
				.value();
		ExpressionModel.ExpressionResult falseVal = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) falseResult)
				.value();

		ExpressionModel.ExpressionTerm branchMarker = new ExpressionModel.ExpressionTerm(
				-3, (int) trueVal.literalValue, false, false, false, false, false, false, false);
		ExpressionModel.ExpressionTerm elseMarker = new ExpressionModel.ExpressionTerm(
				-4, (int) falseVal.literalValue, false, false, false, false, false, false, false);

		List<ExpressionModel.ExpressionTerm> allTerms = new ArrayList<>(cond.terms);
		allTerms.add(branchMarker);
		allTerms.addAll(trueVal.terms);
		allTerms.add(elseMarker);
		allTerms.addAll(falseVal.terms);

		int totalReads = cond.readCount + trueVal.readCount + falseVal.readCount;
		return Result.ok(new ExpressionModel.ExpressionResult(totalReads, 0, allTerms));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionForConditional(
			String expr) {
		// Simplified parser that handles comparisons - delegate to comparison parsing
		// or additive if no comparison
		expr = expr.trim();

		// Handle nested conditionals
		if (expr.startsWith("if ("))
			return parseConditional(expr);

		// Try comparison operators
		var le = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '<', '=');
		if (le.size() > 1)
			return ComparisonOperatorHandler.parseLessOrEqualExpression(le);
		var ge = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '>', '=');
		if (ge.size() > 1)
			return ComparisonOperatorHandler.parseGreaterOrEqualExpression(ge);
		var lt = DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '<');
		if (lt.size() > 1)
			return ComparisonOperatorHandler.parseLessThanExpression(lt);
		var gt = DepthAwareSplitter.splitByDelimiterAtDepthZero(expr, '>');
		if (gt.size() > 1)
			return ComparisonOperatorHandler.parseGreaterThanExpression(gt);
		var eq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '=', '=');
		if (eq.size() > 1)
			return ComparisonOperatorHandler.parseEqualityExpression(eq);
		var neq = DepthAwareSplitter.splitByDoubleDelimiterAtDepthZero(expr, '!', '=');
		if (neq.size() > 1)
			return ComparisonOperatorHandler.parseInequalityExpression(neq);

		// No comparison, parse as additive
		return AdditiveExpressionParser.parseAdditive(expr);
	}

	private static int findElseKeyword(String expr) {
		int depth = 0;
		for (int i = 0; i < expr.length() - 3; i++) {
			char c = expr.charAt(i);
			if (c == '(' || c == '{')
				depth++;
			else if (c == ')' || c == '}')
				depth--;
			else if (depth == 0 && expr.startsWith("else", i)) {
				// Make sure 'else' is not part of a larger word
				if ((i == 0 || !Character.isLetterOrDigit(expr.charAt(i - 1)))
						&& (i + 4 >= expr.length() || !Character.isLetterOrDigit(expr.charAt(i + 4)))) {
					return i;
				}
			}
		}
		return -1;
	}

	public static Result<Void, CompileError> buildConditionalAssignmentChain(String varName, String s,
			List<Instruction> instructions, boolean isFirst) {
		if (!s.startsWith("if ("))
			return Result.err(new CompileError("Expected 'if'"));
		int cEnd = findConditionEnd(s);
		if (cEnd == -1)
			return Result.err(new CompileError("Malformed"));
		String cond = s.substring(4, cEnd), r = s.substring(cEnd + 1).trim();
		if (!r.startsWith(varName + " =") && !r.startsWith(varName + "="))
			return Result.err(new CompileError("Expected assign"));
		int eqIdx = r.indexOf('='), sIdx = DepthAwareSplitter.findSemicolonAtDepthZero(r, eqIdx);
		if (sIdx == -1)
			return Result.err(new CompileError("Missing ';'"));
		String trueVal = r.substring(eqIdx + 1, sIdx).trim(), r2 = r.substring(sIdx + 1).trim();
		if (!r2.startsWith("else "))
			return Result.err(new CompileError("Expected 'else'"));

		Result<Void, CompileError> condCheckResult = validateCondition(cond);
		if (condCheckResult instanceof Result.Err<Void, CompileError>)
			return condCheckResult;

		r2 = r2.substring(5).trim();
		Result<ExpressionModel.ExpressionResult, CompileError> condRes = App.parseExpressionWithRead(cond);
		if (condRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> condErr)
			return Result.err(condErr.error());
		ExpressionModel.ExpressionResult condExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) condRes)
				.value();
		Result<Void, CompileError> genCond = App.generateInstructions(condExpr, instructions);
		if (genCond instanceof Result.Err<Void, CompileError>)
			return Result.err(new CompileError("Bad cond"));
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, -1L));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, 1, 0L));
		int jumpElseIdx = instructions.size();
		instructions.add(new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1L, 0L));

		Result<Integer, CompileError> trueResult = processTrueBranch(trueVal, instructions);
		if (trueResult instanceof Result.Err<Integer, CompileError> trueErr)
			return Result.err(trueErr.error());
		int jumpEndIdx = ((Result.Ok<Integer, CompileError>) trueResult).value();

		instructions.set(jumpElseIdx,
				new Instruction(Operation.JumpIfLessThanZero, Variant.Immediate, 1L, (long) instructions.size()));
		Result<Void, CompileError> falseResult = processFalseBranch(varName, r2, instructions);
		if (falseResult instanceof Result.Err<Void, CompileError>)
			return falseResult;

		instructions.set(jumpEndIdx, new Instruction(Operation.Jump, Variant.Immediate, 0, (long) instructions.size()));
		if (isFirst) {
			instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, 100L));
			instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
		}
		return Result.ok(null);
	}

	private static Result<Void, CompileError> validateCondition(String cond) {
		Result<String, CompileError> typeRes = ExpressionTokens.extractTypeFromExpression(cond, new java.util.HashMap<>());
		return typeRes.match(type -> {
			if (!type.equals("Bool")) {
				return Result.err(new CompileError("Expect Bool"));
			}
			return Result.ok(null);
		}, err -> Result.ok(null));
	}

	private static Result<Integer, CompileError> processTrueBranch(String trueVal, List<Instruction> instructions) {
		Result<ExpressionModel.ExpressionResult, CompileError> trueRes = App.parseExpressionWithRead(trueVal);
		if (trueRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> trueErr) {
			return Result.err(trueErr.error());
		}
		ExpressionModel.ExpressionResult trueExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) trueRes)
				.value();
		Result<Void, CompileError> genTrue = App.generateInstructions(trueExpr, instructions);
		if (genTrue instanceof Result.Err<Void, CompileError>) {
			return Result.err(new CompileError("Bad true"));
		}
		instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 100L));
		int jumpEndIdx = instructions.size();
		instructions.add(new Instruction(Operation.Jump, Variant.Immediate, 0, 0L));
		return Result.ok(jumpEndIdx);
	}

	private static Result<Void, CompileError> processFalseBranch(String varName, String r2,
			List<Instruction> instructions) {
		if (r2.startsWith("if (")) {
			return buildConditionalAssignmentChain(varName, r2, instructions, false);
		} else if (r2.startsWith(varName + " =") || r2.startsWith(varName + "=")) {
			int eqIdx = r2.indexOf('=');
			int sIdx = DepthAwareSplitter.findSemicolonAtDepthZero(r2, eqIdx);
			if (sIdx == -1)
				return Result.err(new CompileError("Missing ';'"));
			String falseVal = r2.substring(eqIdx + 1, sIdx).trim();
			if (!r2.substring(sIdx + 1).trim().equals(varName))
				return Result.err(new CompileError("Bad var"));
			Result<ExpressionModel.ExpressionResult, CompileError> falseRes = App.parseExpressionWithRead(falseVal);
			if (falseRes instanceof Result.Err<ExpressionModel.ExpressionResult, CompileError> falseErr) {
				return Result.err(falseErr.error());
			}
			ExpressionModel.ExpressionResult falseExpr = ((Result.Ok<ExpressionModel.ExpressionResult, CompileError>) falseRes)
					.value();
			Result<Void, CompileError> genFalse = App.generateInstructions(falseExpr, instructions);
			if (genFalse instanceof Result.Err<Void, CompileError>) {
				return Result.err(new CompileError("Bad else"));
			}
			instructions.add(new Instruction(Operation.Store, Variant.DirectAddress, 0, 100L));
			return Result.ok(null);
		} else
			return Result.err(new CompileError("Bad else"));
	}
}
