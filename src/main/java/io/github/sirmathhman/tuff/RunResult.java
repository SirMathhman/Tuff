package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.lib.ArrayList;

import io.github.sirmathhman.tuff.vm.Instruction;

public record RunResult(ArrayList<Integer> output, int returnValue, Instruction[] executedInstructions) {
}
