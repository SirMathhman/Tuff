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
		if (secondOperand == null) return 0L;
		return secondOperand;
	}
	
	public String display() {
		// Pretty-print the instruction
		if (secondOperand == null) {
			return String.format("%s %s %d", operation, variant, firstOperand);
		} else {
			return String.format("%s %s %d %d", operation, variant, firstOperand, secondOperand);
		}
	}

	public static String displayAll(Instruction[] instructions) {
		var sb = new StringBuilder().append("[\r\n");
		for (var i = 0; i < instructions.length; i++) {
			sb.append(String.format("\t%04d: %s,%n", i, instructions[i].display()));
		}
		return sb.append("]").toString();
	}
}
