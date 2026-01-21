package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Vm;

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
		return VmExecutor.executeWithTrace(instructions, input, traceConfig, traceSink);
	}
}
