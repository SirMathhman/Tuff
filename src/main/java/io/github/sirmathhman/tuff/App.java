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

	public static Result<Instruction[], CompileError> compile(String source) {
		List<Instruction> instructions = new ArrayList<>();

		if (!source.isEmpty()) {
			Result<Long, CompileError> result = parseExpression(source.trim());
			if (result.isErr()) {
				return Result.err(result.errValue());
			}
			instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, result.okValue()));
		}

		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, null));
		return Result.ok(instructions.toArray(new Instruction[0]));
	}

	private static Result<Long, CompileError> parseExpression(String expr) {
		// Try to parse as binary expression (e.g., "1U8 + 2U8")
		String[] parts = expr.split("\\s*\\+\\s*");
		if (parts.length == 2) {
			Result<Long, CompileError> left = parseLiteral(parts[0]);
			if (left.isErr()) {
				return left;
			}
			Result<Long, CompileError> right = parseLiteral(parts[1]);
			if (right.isErr()) {
				return right;
			}
			return Result.ok(left.okValue() + right.okValue());
		}
		if (parts.length > 2) {
			return Result.err(new CompileError("Multiple + operators not supported"));
		}

		// Otherwise parse as single literal
		return parseLiteral(expr);
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
