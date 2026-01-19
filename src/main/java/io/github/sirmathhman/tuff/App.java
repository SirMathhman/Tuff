package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.ArrayList;
import java.util.List;

public final class App {
	private App() {
	}

	private static final class ExpressionResult {
		final int readCount;
		final long literalValue;
		final List<ExpressionTerm> terms;

		ExpressionResult(int readCount, long literalValue, List<ExpressionTerm> terms) {
			this.readCount = readCount;
			this.literalValue = literalValue;
			this.terms = terms;
		}
	}

	private record ParenthesizedTokenResult(List<ExpressionTerm> terms, long literalValue, int expandedSize) {
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
		// Parse as expression (which may contain "read")
		Result<ExpressionResult, CompileError> exprResult = parseExpressionWithRead(stmt);
		if (exprResult.isErr()) {
			return Result.err(exprResult.errValue());
		}

		ExpressionResult expr = exprResult.okValue();

		// Generate instructions based on expression structure
		if (expr.readCount == 0) {
			// No reads, just load the literal
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, expr.literalValue));
		} else {
			// Load all reads into registers
			loadAllReads(expr.terms, instructions);

			// Build result respecting precedence
			int resultReg = buildResultWithPrecedence(expr.terms, instructions);

			// Add literal if present
			if (expr.literalValue != 0) {
				addLiteralToResult(resultReg, expr.literalValue, expr.terms.size(), instructions);
			}
		}

		return Result.ok(null);
	}

	private static void loadAllReads(List<ExpressionTerm> terms, List<Instruction> instructions) {
		int nextReg = 0;
		for (ExpressionTerm term : terms) {
			if (term.readCount > 0) {
				instructions.add(new Instruction(Operation.In, Variant.Immediate, nextReg, null));
				nextReg++;
			}
		}
	}

	private static int buildResultWithPrecedence(List<ExpressionTerm> terms, List<Instruction> instructions) {
		int readRegIndex = 0;
		int resultReg = 0;
		boolean firstAdditiveGroup = true;

		int i = 0;
		while (i < terms.size()) {
			ExpressionTerm term = terms.get(i);
			if (term.readCount == 0) {
				i++;
				continue;
			}

			// Collect this additive group
			List<Integer> groupRegs = new ArrayList<>();
			groupRegs.add(readRegIndex);
			boolean isSubtracted = term.isSubtracted;
			readRegIndex++;

			// Consume all multiplied terms that follow
			while (i + 1 < terms.size() && terms.get(i + 1).isMultiplied && terms.get(i + 1).readCount > 0) {
				i++;
				groupRegs.add(readRegIndex);
				readRegIndex++;
			}

			// Generate instructions for this group
			resultReg = processAdditiveGroup(groupRegs, isSubtracted, firstAdditiveGroup, resultReg,
					instructions);
			firstAdditiveGroup = false;

			i++;
		}

		return resultReg;
	}

	private static int processAdditiveGroup(List<Integer> groupRegs, boolean isSubtracted,
			boolean firstAdditiveGroup, int resultReg, List<Instruction> instructions) {
		if (groupRegs.size() == 1) {
			// Single read in this group
			if (firstAdditiveGroup) {
				return groupRegs.get(0);
			} else {
				// Add or subtract to result
				Operation op = isSubtracted ? Operation.Sub : Operation.Add;
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupRegs.get(0)));
				return resultReg;
			}
		} else {
			// Multiple reads: perform multiplications
			int groupResultReg = groupRegs.get(0);
			for (int j = 1; j < groupRegs.size(); j++) {
				instructions.add(new Instruction(Operation.Mul, Variant.Immediate, groupResultReg, (long) groupRegs.get(j)));
			}

			// Add/subtract this group's result to overall result
			if (firstAdditiveGroup) {
				return groupResultReg;
			} else {
				Operation op = isSubtracted ? Operation.Sub : Operation.Add;
				instructions.add(new Instruction(op, Variant.Immediate, resultReg, (long) groupResultReg));
				return resultReg;
			}
		}
	}

	private static void addLiteralToResult(int resultReg, long literalValue, int termCount,
			List<Instruction> instructions) {
		// Count how many reads we have to determine next register
		int literalReg = 0;
		for (Instruction inst : instructions) {
			if (inst.operation() == Operation.In) {
				literalReg++;
			}
		}
		instructions.add(new Instruction(Operation.Load, Variant.Immediate, literalReg, literalValue));
		instructions.add(new Instruction(Operation.Add, Variant.Immediate, resultReg, (long) literalReg));
	}

	private static Result<ExpressionResult, CompileError> parseExpressionWithRead(String expr) {
		// Split by + and - to get additive-level tokens, but not inside parentheses
		List<String> addTokens = splitAddOperators(expr);
		List<Boolean> additiveOps = new ArrayList<>();
		additiveOps.add(false);

		// Track which operator preceded each additive token
		int tokensFound = 0;
		int lastIndex = 0;
		for (String token : addTokens) {
			if (tokensFound == 0) {
				tokensFound++;
				lastIndex += token.length();
				continue;
			}
			int nextIndex = expr.indexOf(token, lastIndex);
			if (nextIndex > 0) {
				char op = expr.charAt(nextIndex - 1);
				while (nextIndex > 0 && Character.isWhitespace(op)) {
					nextIndex--;
					op = expr.charAt(nextIndex - 1);
				}
				additiveOps.add(op == '-');
			}
			lastIndex = nextIndex + token.length();
			tokensFound++;
		}

		// Process each additive token for multiplicative operators
		List<ExpressionTerm> allTerms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		for (int i = 0; i < addTokens.size(); i++) {
			boolean isSubtracted = additiveOps.get(i);
			Result<ParsedMult, CompileError> multResult = parseMultiplicative(addTokens.get(i).trim(), isSubtracted);
			if (multResult.isErr()) {
				return Result.err(multResult.errValue());
			}

			ParsedMult mult = multResult.okValue();
			allTerms.addAll(mult.terms);
			totalReads += mult.readCount;
			if (isSubtracted) {
				totalLiteral -= mult.literalValue;
			} else {
				totalLiteral += mult.literalValue;
			}
		}

		return Result.ok(new ExpressionResult(totalReads, totalLiteral, allTerms));
	}

	private static List<String> splitTokensByOperators(String expr, boolean isAdditive) {
		List<String> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		int depth = 0;

		for (char c : expr.toCharArray()) {
			boolean isOp = isAdditive ? (c == '+' || c == '-') : (c == '*');
			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if (isOp && depth == 0 && (!isAdditive || token.length() > 0)) {
				String t = token.toString().trim();
				if (!t.isEmpty() || !isAdditive) {
					result.add(t);
				}
				token = new StringBuilder();
			} else {
				token.append(c);
			}
		}

		String t = token.toString().trim();
		if (!t.isEmpty() || !isAdditive) {
			result.add(t);
		}
		return result;
	}

	private static List<String> splitAddOperators(String expr) {
		return splitTokensByOperators(expr, true);
	}

	private static final class ParsedMult {
		final int readCount;
		final long literalValue;
		final List<ExpressionTerm> terms;

		ParsedMult(int readCount, long literalValue, List<ExpressionTerm> terms) {
			this.readCount = readCount;
			this.literalValue = literalValue;
			this.terms = terms;
		}
	}

	private static Result<ParsedMult, CompileError> parseMultiplicative(String expr, boolean isSubtracted) {
		List<String> multTokens = splitByOperator(expr, '*');
		List<ExpressionTerm> multTerms = new ArrayList<>();
		long multLiteral = 1;
		int lastExpandedParensSize = 0;

		for (int j = 0; j < multTokens.size(); j++) {
			String multToken = multTokens.get(j).trim();

			if (multToken.startsWith("(") && multToken.endsWith(")")) {
				Result<ParenthesizedTokenResult, CompileError> pResult = processParenthesizedToken(multToken, j,
						isSubtracted, multTokens.size());
				if (pResult.isErr()) {
					return Result.err(pResult.errValue());
				}
				ParenthesizedTokenResult pData = pResult.okValue();
				multTerms.addAll(pData.terms);
				multLiteral = (j == 0) ? pData.literalValue : multLiteral * pData.literalValue;
				lastExpandedParensSize = pData.expandedSize;
			} else {
				// Regular term
				Result<ExpressionTerm, CompileError> termResult = parseTerm(multToken);
				if (termResult.isErr()) {
					return Result.err(termResult.errValue());
				}

				ExpressionTerm baseTerm = termResult.okValue();
				boolean isMultiplied = (j > 0);
				ExpressionTerm finalTerm = new ExpressionTerm(baseTerm.readCount, baseTerm.value, isSubtracted, isMultiplied);
				multTerms.add(finalTerm);

				if (j == 0) {
					multLiteral = baseTerm.value;
				} else {
					multLiteral *= baseTerm.value;
				}
				lastExpandedParensSize = 0;
			}
		}

		// Fix grouping boundaries for expanded parenthesized expressions at j=0
		if (lastExpandedParensSize > 1 && multTokens.size() > 1) {
			int lastJ0Index = lastExpandedParensSize - 1;
			if (lastJ0Index + 1 < multTerms.size() && multTerms.get(lastJ0Index + 1).isMultiplied) {
				ExpressionTerm termToMark = multTerms.get(lastJ0Index);
				multTerms.set(lastJ0Index, new ExpressionTerm(termToMark.readCount, termToMark.value,
						termToMark.isSubtracted, true));
			}
		}

		int totalReads = multTerms.stream().mapToInt(t -> t.readCount).sum();
		return Result.ok(new ParsedMult(totalReads, multLiteral, multTerms));
	}

	private static Result<ParenthesizedTokenResult, CompileError> processParenthesizedToken(String multToken,
			int position, boolean isSubtracted, int totalTokens) {
		String inner = multToken.substring(1, multToken.length() - 1);
		Result<ExpressionResult, CompileError> innerResult = parseExpressionWithRead(inner);
		if (innerResult.isErr()) {
			return Result.err(innerResult.errValue());
		}

		ExpressionResult innerExpr = innerResult.okValue();
		List<ExpressionTerm> terms = new ArrayList<>();

		if (position == 0) {
			// First term: expand the inner expression, keeping original isMultiplied states
			for (ExpressionTerm innerTerm : innerExpr.terms) {
				ExpressionTerm finalTerm = new ExpressionTerm(innerTerm.readCount, innerTerm.value,
						isSubtracted, innerTerm.isMultiplied);
				terms.add(finalTerm);
			}
			return Result.ok(new ParenthesizedTokenResult(terms, innerExpr.literalValue, innerExpr.terms.size()));
		} else {
			// Multiplicative position: only support simple reads/literals
			if (innerExpr.readCount > 1) {
				return Result.err(new CompileError(
						"Parenthesized expressions with multiple reads in multiplicative position not yet supported: "
								+ multToken));
			}

			for (int k = 0; k < innerExpr.terms.size(); k++) {
				ExpressionTerm innerTerm = innerExpr.terms.get(k);
				boolean isMultiplied = (k == 0) ? true : innerTerm.isMultiplied;
				ExpressionTerm finalTerm = new ExpressionTerm(innerTerm.readCount, innerTerm.value,
						isSubtracted, isMultiplied);
				terms.add(finalTerm);
			}
			return Result.ok(new ParenthesizedTokenResult(terms, innerExpr.literalValue, 0));
		}
	}

	private static List<String> splitByOperator(String expr, char operator) {
		// For single operator splitting (non-additive case)
		List<String> result = new ArrayList<>();
		StringBuilder token = new StringBuilder();
		int depth = 0;

		for (char c : expr.toCharArray()) {
			if (c == '(') {
				depth++;
				token.append(c);
			} else if (c == ')') {
				depth--;
				token.append(c);
			} else if (c == operator && depth == 0) {
				result.add(token.toString());
				token = new StringBuilder();
			} else {
				token.append(c);
			}
		}

		result.add(token.toString());
		return result;
	}

	private static final class ExpressionTerm {
		final int readCount;
		final long value;
		final boolean isSubtracted;
		final boolean isMultiplied;

		ExpressionTerm(int readCount, long value, boolean isSubtracted, boolean isMultiplied) {
			this.readCount = readCount;
			this.value = value;
			this.isSubtracted = isSubtracted;
			this.isMultiplied = isMultiplied;
		}
	}

	private static Result<ExpressionTerm, CompileError> parseTerm(String term) {
		term = term.trim();

		if (term.startsWith("read ")) {
			String typeSpec = term.substring(5).trim();
			if (!typeSpec.matches("[UI]\\d+")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(new ExpressionTerm(1, 0, false, false));
		}

		Result<Long, CompileError> literalResult = parseLiteral(term);
		if (literalResult.isErr()) {
			return Result.err(literalResult.errValue());
		}

		return Result.ok(new ExpressionTerm(0, literalResult.okValue(), false, false));
	}

	private static Result<Long, CompileError> parseLiteral(String literal) {
		try {
			String numericPart = literal;
			String typeSuffix = null;

			if (literal.matches(".*[UI]\\d+$")) {
				typeSuffix = literal.replaceAll("^.*([UI]\\d+)$", "$1");
				numericPart = literal.replaceAll("[UI]\\d+$", "");
			}

			long value = Long.parseLong(numericPart);

			if (typeSuffix != null) {
				boolean isUnsigned = typeSuffix.startsWith("U");
				int bits = Integer.parseInt(typeSuffix.substring(1));

				if (isUnsigned) {
					if (value < 0) {
						return Result.err(new CompileError("Negative value not allowed for unsigned type: " + literal));
					}
					long maxValue = (1L << bits) - 1;
					if (value > maxValue) {
						return Result.err(new CompileError(
								"Value " + value + " exceeds maximum for " + typeSuffix + " (" + maxValue + "): " + literal));
					}
				} else {
					long minValue = -(1L << (bits - 1));
					long maxValue = (1L << (bits - 1)) - 1;
					if (value < minValue || value > maxValue) {
						return Result.err(new CompileError("Value " + value + " out of range for " + typeSuffix + " (" + minValue
								+ " to " + maxValue + "): " + literal));
					}
				}
			}

			return Result.ok(value);
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Failed to parse numeric value: " + literal));
		}
	}

	public static Result<RunResult, ApplicationError> run(String source, int[] input) {
		Result<Instruction[], CompileError> compileResult = compile(source);

		if (compileResult.isErr()) {
			// Propagate the compilation error
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
			return Result.err(new ApplicationError(new ExecutionError(instructions)));
		}
	}
}
