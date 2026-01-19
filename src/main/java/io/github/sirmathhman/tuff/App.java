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

		ExpressionResult(int readCount, long literalValue) {
			this.readCount = readCount;
			this.literalValue = literalValue;
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
		} else if (expr.readCount == 1) {
			// One read
			instructions.add(new Instruction(Operation.In, Variant.Immediate, 0, null));

			if (expr.literalValue != 0) {
				instructions.add(new Instruction(Operation.Load, Variant.Immediate, 1, expr.literalValue));
				instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));
			}
		} else if (expr.readCount == 2) {
			// Two reads
			instructions.add(new Instruction(Operation.In, Variant.Immediate, 0, null));
			instructions.add(new Instruction(Operation.In, Variant.Immediate, 1, null));
			instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 1L));

			if (expr.literalValue != 0) {
				instructions.add(new Instruction(Operation.Load, Variant.Immediate, 2, expr.literalValue));
				instructions.add(new Instruction(Operation.Add, Variant.Immediate, 0, 2L));
			}
		} else {
			return Result.err(new CompileError("More than 2 reads in expression not supported"));
		}

		return Result.ok(null);
	}

	private static Result<ExpressionResult, CompileError> parseExpressionWithRead(String expr) {
		// Try to parse as binary expression (e.g., "read U8 + 50U8" or "1U8 + 2U8")
		String[] parts = expr.split("\\s*\\+\\s*");
		if (parts.length == 2) {
			Result<ExpressionTerm, CompileError> left = parseTerm(parts[0]);
			if (left.isErr()) {
				return Result.err(left.errValue());
			}
			Result<ExpressionTerm, CompileError> right = parseTerm(parts[1]);
			if (right.isErr()) {
				return Result.err(right.errValue());
			}

			ExpressionTerm leftTerm = left.okValue();
			ExpressionTerm rightTerm = right.okValue();

			int totalReads = leftTerm.readCount + rightTerm.readCount;
			long totalLiteral = leftTerm.value + rightTerm.value;

			return Result.ok(new ExpressionResult(totalReads, totalLiteral));
		}
		if (parts.length > 2) {
			return Result.err(new CompileError("Multiple + operators not supported"));
		}

		// Otherwise parse as single term
		Result<ExpressionTerm, CompileError> termResult = parseTerm(expr);
		if (termResult.isErr()) {
			return Result.err(termResult.errValue());
		}

		ExpressionTerm term = termResult.okValue();
		return Result.ok(new ExpressionResult(term.readCount, term.value));
	}

	private static final class ExpressionTerm {
		final int readCount;
		final long value;

		ExpressionTerm(int readCount, long value) {
			this.readCount = readCount;
			this.value = value;
		}
	}

	private static Result<ExpressionTerm, CompileError> parseTerm(String term) {
		term = term.trim();

		if (term.startsWith("read ")) {
			String typeSpec = term.substring(5).trim();
			if (!typeSpec.matches("[UI]\\d+")) {
				return Result.err(new CompileError("Invalid type specification: " + typeSpec));
			}
			return Result.ok(new ExpressionTerm(1, 0));
		}

		Result<Long, CompileError> literalResult = parseLiteral(term);
		if (literalResult.isErr()) {
			return Result.err(literalResult.errValue());
		}

		return Result.ok(new ExpressionTerm(0, literalResult.okValue()));
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
