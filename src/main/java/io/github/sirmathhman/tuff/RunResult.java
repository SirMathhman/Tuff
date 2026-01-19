package io.github.sirmathhman.tuff;

import java.util.List;

import io.github.sirmathhman.tuff.vm.Instruction;

public record RunResult(List<Integer> output, int returnValue, Instruction[] executedInstructions) {
}
