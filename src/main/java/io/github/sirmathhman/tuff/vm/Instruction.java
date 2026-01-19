package io.github.sirmathhman.tuff.vm;

/**
 * Mirrors the TypeScript Instruction shape.
 * secondOperand is optional; when absent, it is treated as 0.
 */
public record Instruction(
		Operation operation,
		Variant variant,
		long firstOperand,
		Long secondOperand) {
	public long secondOperandOrZero() {
		return secondOperand == null ? 0L : secondOperand;
	}
}
