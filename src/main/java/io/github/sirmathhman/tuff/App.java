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

		// If source is not empty, try to parse it as a number (with optional type
		// suffix)
		// and load it into register 0
		if (!source.isEmpty()) {
			try {
				// Parse optional type suffix (e.g., "100U8", "42I32")
				String numericPart = source;
				String typeSuffix = null;
				// Remove type suffix if present (U8, U16, U32, U64, I8, I16, I32, I64, etc.)
				if (source.matches(".*[UI]\\d+$")) {
					typeSuffix = source.replaceAll("^.*([UI]\\d+)$", "$1");
					numericPart = source.replaceAll("[UI]\\d+$", "");
				}

				int value = Integer.parseInt(numericPart);

				// Validate that unsigned types don't have negative values
				if (typeSuffix != null && typeSuffix.startsWith("U") && value < 0) {
					return Result.err(new CompileError("Negative value not allowed for unsigned type: " + source));
				}

				instructions.add(new Instruction(Operation.Load, Variant.Immediate, 0, (long) value));
			} catch (NumberFormatException e) {
				return Result.err(new CompileError("Failed to parse numeric value: " + source));
			}
		}

		// Always end with a halt instruction
		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, null));

		return Result.ok(instructions.toArray(new Instruction[0]));
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
