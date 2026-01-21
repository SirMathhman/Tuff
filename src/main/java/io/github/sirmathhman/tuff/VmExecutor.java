package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.ArrayList;
import java.util.List;

/**
 * Utility class for executing VM instructions with common error handling.
 */
public final class VmExecutor {
	private VmExecutor() {
	}

	/**
	 * Creates an input supplier from an input array.
	 */
	private static java.util.function.IntSupplier createInputSupplier(int[] input) {
		final var inputPointer = new int[]{0};
		return () -> {
			if (inputPointer[0] >= input.length) {
				return 0;
			}
			return input[inputPointer[0]++];
		};
	}

	/**
	 * Executes instructions with standard input/output handling and error wrapping.
	 */
	public static Result<RunResult, ApplicationError> executeWithIO(
			Instruction[] instructions,
			int[] input) {
		final var inputPointer = new int[]{0};
		List<Integer> output = new ArrayList<>();
		try {
			var returnValue = Vm.execute(
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

	/**
	 * Executes instructions with tracing enabled.
	 */
	public static Result<RunResult, ApplicationError> executeWithTrace(
			Instruction[] instructions,
			int[] input,
			Vm.TraceConfig traceConfig,
			Vm.TraceSink traceSink) {
		List<Integer> output = new ArrayList<>();
		try {
			var returnValue = Vm.execute(
					instructions,
					createInputSupplier(input),
					output::add,
					traceConfig,
					traceSink);
			return Result.ok(new RunResult(output, returnValue, instructions));
		} catch (Exception e) {
			e.printStackTrace();
			System.err.println("Exception occurred during execution!");
			return Result.err(new ApplicationError(new ExecutionError(instructions)));
		}
	}
}
