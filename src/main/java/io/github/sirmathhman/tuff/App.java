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

	private static Instruction[] compile(String source) {
		// TODO: real implementation
		// For now, always return a program that halts immediately.
		return new Instruction[] {
				new Instruction(Operation.Halt, Variant.Constant, 0, null)
		};
	}

	public static RunResult run(String source, int[] input) {
		Instruction[] instructions = compile(source);

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

		return new RunResult(output, returnValue);
	}
}
