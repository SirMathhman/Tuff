package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

import io.github.sirmathhman.tuff.lib.ArrayList;

import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

/**
 * Utility class for executing VM instructions with common error handling.
 */
public final class VmExecutor {
	private VmExecutor() {
	}

	/**
	 * Creates an input supplier from an input array.
	 */
	private static IntSupplier createInputSupplier(int[] input) {
		final var inputPointer = new int[] { 0 };
		return () -> inputPointer[0] < input.length ? input[inputPointer[0]++] : 0;
	}

	/**
	 * Wraps VM execution with error handling and result packaging.
	 */
	@SuppressWarnings("unchecked")
	private static Result<RunResult, ApplicationError> wrapExecution(
			Instruction[] instructions, VmRunner runner) {
		final ArrayList<Integer>[] outputHolder = (ArrayList<Integer>[]) new ArrayList<?>[] { new ArrayList<Integer>() };
		IntConsumer outputConsumer = val -> outputHolder[0] = outputHolder[0].add(val);
		try {
			int returnValue = runner.run(outputConsumer);
			return Result.ok(new RunResult(outputHolder[0], returnValue, instructions));
		} catch (Exception e) {
			e.printStackTrace();
			System.err.println("Exception occurred during execution!");
			return Result.err(new ApplicationError(new ExecutionError(instructions)));
		}
	}

	@FunctionalInterface
	private interface VmRunner {
		int run(IntConsumer outputConsumer);
	}

	/**
	 * Executes instructions with standard input/output handling and error wrapping.
	 */
	public static Result<RunResult, ApplicationError> executeWithIO(
			Instruction[] instructions, int[] input) {
		IntSupplier inputSupplier = createInputSupplier(input);
		return wrapExecution(instructions,
				output -> Vm.execute(instructions, inputSupplier, output));
	}

	/**
	 * Executes instructions with tracing enabled.
	 */
	public static Result<RunResult, ApplicationError> executeWithTrace(
			Instruction[] instructions, int[] input,
			Vm.TraceConfig traceConfig, Vm.TraceSink traceSink) {
		IntSupplier inputSupplier = createInputSupplier(input);
		return wrapExecution(instructions,
				output -> Vm.execute(instructions, inputSupplier, output, traceConfig, traceSink));
	}
}
