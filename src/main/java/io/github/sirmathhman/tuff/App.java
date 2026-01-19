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
			// Load all reads into registers sequentially
			int nextReg = 0;
			for (ExpressionTerm term : expr.terms) {
				if (term.readCount > 0) {
					instructions.add(new Instruction(Operation.In, Variant.Immediate, nextReg, null));
					nextReg++;
				}
			}

			// First term goes into register 0
			int firstReadReg = 0;
			for (ExpressionTerm term : expr.terms) {
				if (term.readCount > 0) {
					firstReadReg = 0;
					break;
				}
			}

			// Accumulate all reads with correct operations
			int regIndex = 0;
			boolean firstRead = true;
			for (ExpressionTerm term : expr.terms) {
				if (term.readCount > 0) {
					if (!firstRead) {
						if (term.isSubtracted) {
							instructions.add(new Instruction(Operation.Sub, Variant.Immediate, 0, (long) regIndex));
						} else {
							instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) regIndex));
						}
					}
					firstRead = false;
					regIndex++;
				}
			}

			// Add the literal value if present
			if (expr.literalValue != 0) {
				int literalReg = regIndex;
				instructions.add(new Instruction(Operation.Load, Variant.Immediate, literalReg, expr.literalValue));
				instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, (long) literalReg));
			}
		}

		return Result.ok(null);
	}

	private static Result<ExpressionResult, CompileError> parseExpressionWithRead(String expr) {
		// Parse all terms separated by + or -, preserving the operators
		List<ExpressionTerm> terms = new ArrayList<>();
		int totalReads = 0;
		long totalLiteral = 0;

		// Split by + and -, keeping the operators
		// Only treat +/- as operators if they're preceded by a digit, U, or 'e' (end of term)
		String[] tokens = expr.split("(?<=[0-9UIe])\\s*[+-]\\s*");

		// Track which operator preceded each token
		List<Boolean> isSubtracted = new ArrayList<>();
		isSubtracted.add(false); // First token is never subtracted
		
		// Find all + and - operators in the original expression
		int lastIndex = 0;
		for (String token : tokens) {
			if (lastIndex == 0) {
				lastIndex += token.length();
				continue;
			}
			
			int nextIndex = expr.indexOf(token, lastIndex);
			if (nextIndex > 0) {
				char operatorChar = expr.charAt(nextIndex - 1);
				while (nextIndex > 0 && Character.isWhitespace(operatorChar)) {
					nextIndex--;
					if (nextIndex > 0) {
						operatorChar = expr.charAt(nextIndex - 1);
					}
				}
				isSubtracted.add(operatorChar == '-');
				lastIndex = nextIndex + token.length();
			}
		}

		for (int i = 0; i < tokens.length; i++) {
			String token = tokens[i].trim();
			if (token.isEmpty()) {
				continue;
			}

			Result<ExpressionTerm, CompileError> termResult = parseTerm(token);
			if (termResult.isErr()) {
				return Result.err(termResult.errValue());
			}

			ExpressionTerm baseTerm = termResult.okValue();
			boolean subtracted = (i < isSubtracted.size()) ? isSubtracted.get(i) : false;
			ExpressionTerm term = new ExpressionTerm(baseTerm.readCount, baseTerm.value, subtracted);
			terms.add(term);

			totalReads += term.readCount;
			if (subtracted) {
				totalLiteral -= term.value;
			} else {
				totalLiteral += term.value;
			}
		}

		return Result.ok(new ExpressionResult(totalReads, totalLiteral, terms));
	}

	private static final class ExpressionTerm {
		final int readCount;
		final long value;
		final boolean isSubtracted;

		ExpressionTerm(int readCount, long value, boolean isSubtracted) {
			this.readCount = readCount;
			this.value = value;
			this.isSubtracted = isSubtracted;
		}
	}

	private static Result<ExpressionTerm, CompileError> parseTerm(String term) {
		term = term.trim();

		if (term.startsWith("read ")) {
			String typeSpec = term.substring(5).trim();
			if (!typeSpec.matches("[UI]\\d+")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(new ExpressionTerm(1, 0, false));
		}

		Result<Long, CompileError> literalResult = parseLiteral(term);
		if (literalResult.isErr()) {
			return Result.err(literalResult.errValue());
		}

		return Result.ok(new ExpressionTerm(0, literalResult.okValue(), false));
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

	public static Result<RunResult, CompileError> run(String source, int[] input) {
		Result<Instruction[], CompileError> compileResult = compile(source);

		if (compileResult.isErr()) {
			// Propagate the compilation error
			return Result.err(compileResult.errValue());
		}

		Instruction[] instructions = compileResult.okValue();

		final int[] inputPointer = { 0 };
		List<Integer> output = new ArrayList<>();

		int returnValue = Vm.execute(
				instructions,
				() -> {
					if (inputPointer[0] >= input.length) {
						return 0;
					}
					return input[inputPointer[0]++];
				},
				output::add);

		return Result.ok(new RunResult(output, returnValue));
	}
}
