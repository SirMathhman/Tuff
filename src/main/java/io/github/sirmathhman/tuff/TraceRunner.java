package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

import java.util.ArrayList;
import java.util.List;

public final class TraceRunner {
	private TraceRunner() {
	}

	public static Result<RunResult, ApplicationError> runWithTrace(
			String source,
			int[] input,
			Vm.TraceConfig traceConfig,
			Vm.TraceSink traceSink) {
		return App.compile(source).match(
				instructions -> runWithTrace(instructions, input, traceConfig, traceSink),
				err -> Result.err(new ApplicationError(err)));
	}

	public static Result<RunResult, ApplicationError> runWithTrace(
			Instruction[] instructions,
			int[] input,
			Vm.TraceConfig traceConfig,
			Vm.TraceSink traceSink) {
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
