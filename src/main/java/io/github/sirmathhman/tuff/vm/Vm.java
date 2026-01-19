package io.github.sirmathhman.tuff.vm;

import java.util.Arrays;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

public final class Vm {
	private Vm() {
	}

	public static int execute(
			Instruction[] source,
			IntSupplier read,
			IntConsumer write) {
		int programCounter = 0;
		long[] registers = new long[8];
		Arrays.fill(registers, 0L);

		long[] memory = new long[1024];
		Arrays.fill(memory, 0L);
		loadInstructionsIntoMemory(source, memory);

		while (true) {
			if (programCounter < 0 || programCounter >= memory.length) {
				throw new IllegalStateException("Program did not halt before reaching end of memory.");
			}

			long encodedInstruction = memory[programCounter];
			int operation = (int) ((encodedInstruction >>> 56) & 0xff);
			int variant = (int) ((encodedInstruction >>> 48) & 0xff);
		long firstOperand = encodedInstruction & 0xFFFFFFL;
		long secondOperand = (encodedInstruction >>> 24) & 0xFFFFFFL;

			Operation op = Operation.values()[operation];
			Variant var = Variant.values()[variant];

			switch (op) {
				case Load -> {
					if (var == Variant.Constant) {
						registers[(int) firstOperand] = secondOperand;
					} else if (var == Variant.DirectAddress) {
						registers[(int) firstOperand] = memory[(int) secondOperand];
					} else if (var == Variant.IndirectAddress) {
						int address = (int) memory[(int) secondOperand];
						registers[(int) firstOperand] = memory[address];
					}
				}
				case Store -> {
					if (var == Variant.DirectAddress) {
						memory[(int) secondOperand] = registers[(int) firstOperand];
					} else if (var == Variant.IndirectAddress) {
						int address = (int) memory[(int) secondOperand];
						memory[address] = registers[(int) firstOperand];
					}
				}
				case Add -> registers[(int) firstOperand] += registers[(int) secondOperand];
				case BitsShiftLeft -> registers[(int) firstOperand] <<= registers[(int) secondOperand];
				case BitsShiftRight -> registers[(int) firstOperand] >>= registers[(int) secondOperand];
				case BitsAnd -> registers[(int) firstOperand] &= registers[(int) secondOperand];
				case BitsOr -> registers[(int) firstOperand] |= registers[(int) secondOperand];
				case BitsNot -> registers[(int) firstOperand] = ~registers[(int) firstOperand];
				case In -> registers[(int) firstOperand] = read.getAsInt();
				case Out -> write.accept((int) registers[(int) firstOperand]);
				case Jump -> {
					programCounter = resolveJumpTarget(var, memory, (int) secondOperand);
					continue;
				}
				case JumpIfLessThanZero -> {
					if (registers[(int) firstOperand] < 0) {
						programCounter = resolveJumpTarget(var, memory, (int) secondOperand);
						continue;
					}
				}
				case Equal ->
					registers[(int) firstOperand] = (registers[(int) firstOperand] == registers[(int) secondOperand]) ? 1 : 0;
				case LessThan ->
					registers[(int) firstOperand] = (registers[(int) firstOperand] < registers[(int) secondOperand]) ? 1 : 0;
				case GreaterThan ->
					registers[(int) firstOperand] = (registers[(int) firstOperand] > registers[(int) secondOperand]) ? 1 : 0;
				case LogicalAnd ->
					registers[(int) firstOperand] = (registers[(int) firstOperand] != 0 && registers[(int) secondOperand] != 0)
							? 1
							: 0;
				case LogicalOr ->
					registers[(int) firstOperand] = (registers[(int) firstOperand] != 0 || registers[(int) secondOperand] != 0)
							? 1
							: 0;
				case LogicalNot -> registers[(int) firstOperand] = (registers[(int) firstOperand] == 0) ? 1 : 0;
				case Halt -> {
					return (int) registers[0];
				}
			}

			programCounter++;
		}
	}

	private static int resolveJumpTarget(Variant variant, long[] memory, int operand) {
		return switch (variant) {
			case Constant -> operand;
			case DirectAddress -> (int) memory[operand];
			case IndirectAddress -> {
				int address = (int) memory[operand];
				yield (int) memory[address];
			}
		};
	}

	private static long encodeInstructionTo64Bits(Instruction instruction) {
		long encoded = 0;
		encoded |= ((long) instruction.operation().ordinal() & 0xffL) << 56;
		encoded |= ((long) instruction.variant().ordinal() & 0xffL) << 48;
		encoded |= instruction.firstOperand() & 0x0000_FFFF_FFFF_FFFFL;

		Long secondOperand = instruction.secondOperand();
		if (secondOperand != null) {
			encoded |= (secondOperand & 0x0000_FFFF_FFFF_FFFFL) << 24;
		}

		return encoded;
	}

	private static void loadInstructionsIntoMemory(Instruction[] source, long[] memory) {
		for (int i = 0; i < source.length; i++) {
			memory[i] = encodeInstructionTo64Bits(source[i]);
		}
	}
}
