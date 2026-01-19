package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.vm.Instruction;

public record ExecutionError(Instruction[] instructions) implements Error {
	@Override
	public String display() {
		return Instruction.displayAll(instructions);
	}
}
