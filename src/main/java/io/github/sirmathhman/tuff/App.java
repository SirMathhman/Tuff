package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.compiler.AdditiveExpressionParser;
import io.github.sirmathhman.tuff.compiler.BitwiseNotParser;
import io.github.sirmathhman.tuff.compiler.ConditionalExpressionHandler;
import io.github.sirmathhman.tuff.compiler.EqualityOperatorHandler;
import io.github.sirmathhman.tuff.compiler.ExpressionModel;
import io.github.sirmathhman.tuff.compiler.ExpressionTokens;
import io.github.sirmathhman.tuff.compiler.GreaterOrEqualOperatorHandler;
import io.github.sirmathhman.tuff.compiler.GreaterThanOperatorHandler;
import io.github.sirmathhman.tuff.compiler.InstructionBuilder;
import io.github.sirmathhman.tuff.compiler.InequalityOperatorHandler;
import io.github.sirmathhman.tuff.compiler.LetBindingHandler;
import io.github.sirmathhman.tuff.compiler.LessOrEqualOperatorHandler;
import io.github.sirmathhman.tuff.compiler.LessThanOperatorHandler;
import io.github.sirmathhman.tuff.compiler.LogicalAndHandler;
import io.github.sirmathhman.tuff.compiler.LogicalOrHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.ArrayList;
import java.util.List;

public final class App {
	private App() {
	}

	public static Result<Instruction[], CompileError> compile(String source) {
		List<Instruction> instructions = new ArrayList<>();

		if (!source.isEmpty()) {
			Result<Void, CompileError> result = parseStatement(source.trim(), instructions);
			if (result.isErr()) {
				return Result.err(result.errValue());
			}
		}

		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, null));
		return Result.ok(instructions.toArray(new Instruction[0]));
	}

	private static Result<Void, CompileError> parseStatement(String stmt, List<Instruction> instructions) {
		// Check if this is a let binding at statement level
		if (stmt.startsWith("let ")) {
			// Peek ahead to see if this is a chained let binding
			// Format: "let x = expr1; let y = expr2; z"
			// vs single: "let x = expr; x"
			// vs uninitialized: "let x : Type; x = expr; x"

			int equalsIndex = stmt.indexOf('=');

			// First, find the first semicolon to check for uninitialized declarations
			int firstSemiIndex = stmt.indexOf(';');
			if (firstSemiIndex == -1) {
				return Result.err(new CompileError("Invalid let binding: missing ';'"));
			}

			// If semicolon comes before equals, this is an uninitialized declaration
			if (equalsIndex == -1 || firstSemiIndex < equalsIndex) {
				String continuation = stmt.substring(firstSemiIndex + 1).trim();
				return LetBindingHandler.handleUninitializedVariable(stmt, firstSemiIndex, continuation, instructions);
			}

			// Find the first semicolon at depth 0 after the equals
			int semiIndex = -1;
			int depth = 0;
			for (int i = equalsIndex; i < stmt.length(); i++) {
				char c = stmt.charAt(i);
				if (c == '(' || c == '{') {
					depth++;
				} else if (c == ')' || c == '}') {
					depth--;
				} else if (c == ';' && depth == 0) {
					semiIndex = i;
					break;
				}
			}

			if (semiIndex == -1) {
				return Result.err(new CompileError("Invalid let binding: missing ';'"));
			}

			// Check what comes after the semicolon
			String continuation = stmt.substring(semiIndex + 1).trim();

			// Use LetBindingHandler for all statement-level let bindings
			// (both single and chained)
			return LetBindingHandler.handleLetBindingWithContinuation(stmt, equalsIndex, semiIndex, continuation,
					instructions);
		}

		// Parse as expression (which may contain "read")
		Result<ExpressionModel.ExpressionResult, CompileError> exprResult = parseExpressionWithRead(stmt);
		if (exprResult.isErr()) {
			return Result.err(exprResult.errValue());
		}

		return generateInstructions(exprResult.okValue(), instructions);
	}

	public static Result<Void, CompileError> generateInstructions(ExpressionModel.ExpressionResult expr,
			List<Instruction> instructions) {
		if (expr.readCount == 0) {
			// No reads, just load the literal
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, expr.literalValue));
		} else {
			// Load all reads into registers
			InstructionBuilder.loadAllReads(expr.terms, instructions);

			// Apply masking for bitwise-notted unsigned types
			int readReg = 0;
			for (ExpressionModel.ExpressionTerm term : expr.terms) {
				if (term.readCount > 0) {
					if (term.isBitwiseNotted() && term.readTypeSpec != null && term.readTypeSpec.matches("[UI]\\d+")) {
						int bits = Integer.parseInt(term.readTypeSpec.substring(1));
						long mask = (1L << bits) - 1;
						// Use a temporary register for the mask value
						int tempReg = expr.terms.size() + 1; // Use a register beyond all reads
						instructions.add(new Instruction(Operation.Load, Variant.Immediate, tempReg, mask));
						instructions.add(new Instruction(Operation.BitsAnd, Variant.Immediate, readReg, (long) tempReg));
					}
					readReg++;
				}
			}

			// Build result respecting precedence
			int resultReg = InstructionBuilder.buildResultWithPrecedence(expr.terms, instructions);

			// Add literal if present
			if (expr.literalValue != 0) {
				InstructionBuilder.addLiteralToResult(resultReg, expr.literalValue, expr.terms.size(), instructions);
			}
		}

		return Result.ok(null);
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseExpressionWithRead(String expr) {
		expr = expr.trim();
		// Check if this is a let binding
		if (expr.startsWith("let ")) {
			return parseLetExpressionBinding(expr);
		}

		// Check if this is a conditional expression (lowest precedence)
		if (ConditionalExpressionHandler.hasConditional(expr)) {
			return ConditionalExpressionHandler.parseConditional(expr);
		}
		// Normalize curly braces to parentheses for uniform grouping support
		expr = expr.replace('{', '(').replace('}', ')');
		// Split by || (logical OR) first - lowest precedence
		List<String> orTokens = LogicalOrHandler.splitByLogicalOr(expr);
		if (orTokens.size() > 1) {
			// We have logical OR operations - parse each side and combine
			return LogicalOrHandler.parseLogicalOrExpression(orTokens);
		}

		// Split by && (logical AND) - higher precedence than OR
		List<String> andTokens = LogicalAndHandler.splitByLogicalAnd(expr);
		if (andTokens.size() > 1) {
			// We have logical AND operations - parse each side and combine
			return LogicalAndHandler.parseLogicalAndExpression(andTokens);
		}

		// Try comparison operators (all at same precedence level)
		Result<ExpressionModel.ExpressionResult, CompileError> comparisonResult = parseComparisonOperators(expr);
		if (comparisonResult.isOk()) {
			return comparisonResult;
		}

		// Parse additive expression (no logical operators or comparisons)
		return AdditiveExpressionParser.parseAdditive(expr);
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseComparisonOperators(String expr) {
		var le = LessOrEqualOperatorHandler.splitByLessOrEqual(expr);
		if (le.size() > 1)
			return LessOrEqualOperatorHandler.parseLessOrEqualExpression(le);
		var ge = GreaterOrEqualOperatorHandler.splitByGreaterOrEqual(expr);
		if (ge.size() > 1)
			return GreaterOrEqualOperatorHandler.parseGreaterOrEqualExpression(ge);
		var lt = LessThanOperatorHandler.splitByLessThan(expr);
		if (lt.size() > 1)
			return LessThanOperatorHandler.parseLessThanExpression(lt);
		var gt = GreaterThanOperatorHandler.splitByGreaterThan(expr);
		if (gt.size() > 1)
			return GreaterThanOperatorHandler.parseGreaterThanExpression(gt);
		var eq = EqualityOperatorHandler.splitByEquality(expr);
		if (eq.size() > 1)
			return EqualityOperatorHandler.parseEqualityExpression(eq);
		var neq = InequalityOperatorHandler.splitByInequality(expr);
		if (neq.size() > 1)
			return InequalityOperatorHandler.parseInequalityExpression(neq);
		return Result.err(new CompileError("No comparison operator found"));
	}

	private static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBinding(String expr) {
		return parseLetExpressionBindingWithContext(expr, new java.util.HashMap<>(), new java.util.HashMap<>());
	}

	private static Result<String, CompileError> determineAndValidateType(
			ExpressionTokens.LetBindingDecl decl,
			java.util.Map<String, String> variableTypes) {
		// Extract the type from the value expression BEFORE substitution
		// This allows variable references to be resolved in the type context
		Result<String, CompileError> typeResult = ExpressionTokens.extractTypeFromExpression(decl.valueExpr(),
				variableTypes);

		// Determine the actual type to use
		if (decl.declaredType() == null) {
			// Type inference: require successful type extraction
			if (typeResult.isErr()) {
				return Result.err(typeResult.errValue());
			}
			return Result.ok(typeResult.okValue());
		} else {
			// If type is explicitly declared, try to extract type for validation
			if (typeResult.isOk()) {
				String inferredType = typeResult.okValue();
				// Validate that the inferred type is compatible with the declared type
				// But skip validation for pointer types (they're complex and require more
				// infrastructure)
				if (!decl.declaredType().startsWith("*")
						&& !ExpressionTokens.isTypeCompatible(inferredType, decl.declaredType())) {
					return Result.err(new CompileError("Type mismatch in let binding: variable '" + decl.varName() +
							"' declared as " + decl.declaredType() + " but initialized with " + inferredType));
				}
			}
			return Result.ok(decl.declaredType());
		}
	}

	public static Result<ExpressionModel.ExpressionResult, CompileError> parseLetExpressionBindingWithContext(
			String expr,
			java.util.Map<String, String> boundVariables, java.util.Map<String, String> variableTypes) {
		// Format: let varName : TYPE = EXPR; continuation
		// where continuation is either another let binding or a variable reference
		Result<ExpressionTokens.LetBindingDecl, CompileError> declResult = ExpressionTokens.parseLetDeclaration(expr);
		if (declResult.isErr()) {
			return Result.err(declResult.errValue());
		}

		ExpressionTokens.LetBindingDecl decl = declResult.okValue();

		// Check for duplicate variable binding
		if (boundVariables.containsKey(decl.varName())) {
			return Result.err(new CompileError("Duplicate variable binding: '" + decl.varName() + "' is already bound"));
		}

		// Extract and validate the type
		Result<String, CompileError> actualTypeResult = determineAndValidateType(decl, variableTypes);
		if (actualTypeResult.isErr()) {
			return Result.err(actualTypeResult.errValue());
		}
		String actualType = actualTypeResult.okValue();

		// Now substitute any bound variables in the value expression for actual
		// compilation
		String valueExpr = decl.valueExpr();
		for (String varName : boundVariables.keySet()) {
			// Simple substitution - replace variable references with their bound
			// expressions
			valueExpr = valueExpr.replaceAll("\\b" + varName + "\\b", boundVariables.get(varName));
		}

		// Parse the value expression
		Result<ExpressionModel.ExpressionResult, CompileError> valueResult = parseExpressionWithRead(valueExpr);
		if (valueResult.isErr()) {
			return Result.err(valueResult.errValue());
		}

		// Find where the first binding ends (after its semicolon)
		int equalsIndex = expr.indexOf('=');
		int semiIndex = expr.indexOf(';', equalsIndex);

		// Get the continuation after the semicolon
		String continuation = expr.substring(semiIndex + 1).trim();

		// Parse the continuation (either another let binding or final variable
		// reference)
		if (continuation.startsWith("let ")) {
			// Another let binding follows - recursively parse it with updated context
			java.util.Map<String, String> newVariables = new java.util.HashMap<>(boundVariables);
			newVariables.put(decl.varName(), decl.valueExpr());
			java.util.Map<String, String> newTypes = new java.util.HashMap<>(variableTypes);
			newTypes.put(decl.varName(), actualType);
			return parseLetExpressionBindingWithContext(continuation, newVariables, newTypes);
		}

		// Should be a variable reference - validate it matches the declared variable
		if (!continuation.equals(decl.varName())) {
			return Result.err(new CompileError("Invalid let binding: expected reference to variable '" +
					decl.varName() + "' but got '" + continuation + "'"));
		}

		// Return the value expression result (the variable evaluates to its bound
		// value)
		return Result.ok(valueResult.okValue());
	}

	public static Result<ExpressionModel.ParsedMult, CompileError> parseMultiplicative(String expr,
			boolean isSubtracted) {
		List<ExpressionModel.MultOperatorToken> multTokens = splitByMultOperators(expr);
		List<ExpressionModel.ExpressionTerm> multTerms = new ArrayList<>();
		long multLiteral = 1;
		int lastExpandedParensSize = 0;

		for (int j = 0; j < multTokens.size(); j++) {
			ExpressionModel.MultOperatorToken opToken = multTokens.get(j);
			String multToken = opToken.token.trim();
			char operator = opToken.operator;

			if (multToken.startsWith("(") && multToken.endsWith(")")) {
				Result<ExpressionModel.ParenthesizedTokenResult, CompileError> pResult = processParenthesizedToken(multToken, j,
						isSubtracted, multTokens.size());
				if (pResult.isErr()) {
					return Result.err(pResult.errValue());
				}
				ExpressionModel.ParenthesizedTokenResult pData = pResult.okValue();
				multTerms.addAll(pData.terms());
				Result<Long, CompileError> litResult = updateLiteral(multLiteral, pData.literalValue(), j == 0, operator);
				if (litResult.isErr()) {
					return Result.err(litResult.errValue());
				}
				multLiteral = litResult.okValue();
				lastExpandedParensSize = pData.expandedSize();
			} else {
				Result<ExpressionModel.ExpressionTerm, CompileError> termResult = parseTerm(multToken);
				if (termResult.isErr()) {
					return Result.err(termResult.errValue());
				}

				ExpressionModel.ExpressionTerm baseTerm = termResult.okValue();
				boolean isMultiplied = (j > 0 && operator == '*');
				boolean isDivided = (j > 0 && operator == '/');
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(baseTerm.readCount,
						baseTerm.value, isSubtracted, isMultiplied,
						isDivided, false, false, false, false, baseTerm.isBitwiseNotted(), (j > 0) ? operator : '\0',
						baseTerm.readTypeSpec);
				multTerms.add(finalTerm);

				Result<Long, CompileError> litResult = updateLiteral(multLiteral, baseTerm.value, j == 0, operator);
				if (litResult.isErr()) {
					return Result.err(litResult.errValue());
				}
				multLiteral = litResult.okValue();
				lastExpandedParensSize = 0;
			}
		}
		fixGroupingBoundaries(multTerms, lastExpandedParensSize, multTokens.size());
		int totalReads = multTerms.stream().mapToInt(t -> t.readCount).sum();
		return Result.ok(new ExpressionModel.ParsedMult(totalReads, multLiteral, multTerms));
	}

	private static Result<Long, CompileError> updateLiteral(long current, long value, boolean isFirst, char operator) {
		if (isFirst) {
			return Result.ok(value);
		}
		return switch (operator) {
			case '/' -> Result.ok(value != 0 ? current / value : current);
			case '&' -> Result.ok(current & value);
			case '|' -> Result.ok(current | value);
			case '^' -> Result.ok(current ^ value);
			default -> Result.ok(current * value);
		};
	}

	private static void fixGroupingBoundaries(List<ExpressionModel.ExpressionTerm> multTerms, int lastExpandedParensSize,
			int multTokensSize) {
		if (lastExpandedParensSize > 1 && multTokensSize > 1) {
			int lastJ0Index = lastExpandedParensSize - 1;
			if (lastJ0Index + 1 < multTerms.size()) {
				ExpressionModel.ExpressionTerm nextTerm = multTerms.get(lastJ0Index + 1);
				if (nextTerm.isMultiplied() || nextTerm.isDivided()) {
					ExpressionModel.ExpressionTerm termToMark = multTerms.get(lastJ0Index);
					multTerms.set(lastJ0Index, new ExpressionModel.ExpressionTerm(termToMark.readCount, termToMark.value,
							termToMark.isSubtracted(), true));
				}
			}
		}
	}

	private static Result<ExpressionModel.ParenthesizedTokenResult, CompileError> processParenthesizedToken(
			String multToken,
			int position, boolean isSubtracted, int totalTokens) {
		String inner = multToken.substring(1, multToken.length() - 1);
		Result<ExpressionModel.ExpressionResult, CompileError> innerResult = parseExpressionWithRead(inner);
		if (innerResult.isErr()) {
			return Result.err(innerResult.errValue());
		}

		ExpressionModel.ExpressionResult innerExpr = innerResult.okValue();
		List<ExpressionModel.ExpressionTerm> terms = new ArrayList<>();

		if (position == 0) {
			// First term: expand the inner expression, keeping original isMultiplied states
			for (int i = 0; i < innerExpr.terms.size(); i++) {
				ExpressionModel.ExpressionTerm innerTerm = innerExpr.terms.get(i);
				boolean isLastOfGroup = (i == innerExpr.terms.size() - 1) && totalTokens > 1;
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(innerTerm.readCount,
						innerTerm.value,
						isSubtracted, innerTerm.isMultiplied(), false, isLastOfGroup);
				terms.add(finalTerm);
			}
			return Result
					.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue, innerExpr.terms.size()));
		} else {
			// Multiplicative position: only support simple reads/literals
			if (innerExpr.readCount > 1) {
				return Result.err(new CompileError(
						"Parenthesized expressions with multiple reads in multiplicative position not yet supported: "
								+ multToken));
			}

			for (int k = 0; k < innerExpr.terms.size(); k++) {
				ExpressionModel.ExpressionTerm innerTerm = innerExpr.terms.get(k);
				boolean isMultiplied = (k == 0) ? true : innerTerm.isMultiplied();
				ExpressionModel.ExpressionTerm finalTerm = new ExpressionModel.ExpressionTerm(innerTerm.readCount,
						innerTerm.value,
						isSubtracted, isMultiplied);
				terms.add(finalTerm);
			}
			return Result.ok(new ExpressionModel.ParenthesizedTokenResult(terms, innerExpr.literalValue, 0));
		}
	}

	private static List<ExpressionModel.MultOperatorToken> splitByMultOperators(String expr) {
		// Split by *, /, &, | (but not && or ||) while respecting parentheses
		List<ExpressionModel.MultOperatorToken> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		char lastOp = '\0';
		int depth = 0;

		for (int i = 0; i < expr.length(); i++) {
			char c = expr.charAt(i);

			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if ((c == '*' || c == '/' || c == '&' || c == '|' || c == '^') && depth == 0) {
				// For & and |, check they're not part of && or ||
				if ((c == '&' || c == '|') && i + 1 < expr.length() && expr.charAt(i + 1) == c) {
					token.append(c);
				} else {
					result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
					token = new StringBuilder();
					lastOp = c;
				}
			} else {
				token.append(c);
			}
		}

		result.add(new ExpressionModel.MultOperatorToken(token.toString(), lastOp));
		return result;
	}

	private static Result<ExpressionModel.ExpressionTerm, CompileError> parseTerm(String term) {
		return BitwiseNotParser.parseTermWithNot(term);
	}

	public static Result<RunResult, ApplicationError> run(String source, int[] input) {
		Result<Instruction[], CompileError> compileResult = compile(source);
		if (compileResult.isErr()) {
			return Result.err(new ApplicationError(compileResult.errValue()));
		}
		Instruction[] instructions = compileResult.okValue();
		final int[] inputPointer = { 0 };
		List<Integer> output = new ArrayList<>();
		try {
			int returnValue = Vm.execute(
					instructions,
					() -> {
						if (inputPointer[0] >= input.length) {
							return 0;
						}
						return input[inputPointer[0]++];
					},
					output::add);

			return Result.ok(new RunResult(output, returnValue, instructions));
		} catch (Exception e) {
			e.printStackTrace();
			System.err.println("Exception occurred during execution!");
			return Result.err(new ApplicationError(new ExecutionError(instructions)));
		}
	}
}
