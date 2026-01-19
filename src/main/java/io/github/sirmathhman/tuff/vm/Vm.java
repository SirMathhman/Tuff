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

			boolean shouldJump = executeInstruction(
					registers, memory, op, var, firstOperand, secondOperand, read, write);

			if (op == Operation.Halt) {
				return (int) registers[0];
			}

			if (shouldJump) {
				programCounter = resolveJumpTarget(var, memory, (int) secondOperand);
			} else {
				programCounter++;
			}
		}
	}

	private static boolean executeInstruction(
			long[] registers,
			long[] memory,
			Operation op,
			Variant var,
			long firstOperand,
			long secondOperand,
			IntSupplier read,
			IntConsumer write) {
		return switch (op) {
			case Load -> executeLoad(registers, memory, var, firstOperand, secondOperand);
			case Store -> executeStore(registers, memory, var, firstOperand, secondOperand);
			case Add -> executeAdd(registers, firstOperand, secondOperand);
			case Sub -> executeSub(registers, firstOperand, secondOperand);
			case Mul -> executeMul(registers, firstOperand, secondOperand);
			case BitsShiftLeft -> executeBitsShiftLeft(registers, firstOperand, secondOperand);
			case BitsShiftRight -> executeBitsShiftRight(registers, firstOperand, secondOperand);
			case BitsAnd -> executeBitsAnd(registers, firstOperand, secondOperand);
			case BitsOr -> executeBitsOr(registers, firstOperand, secondOperand);
			case BitsNot -> executeBitsNot(registers, firstOperand);
			case In -> executeIn(registers, firstOperand, read);
			case Out -> executeOut(registers, firstOperand, write);
			case Jump -> true;
			case JumpIfLessThanZero -> registers[(int) firstOperand] < 0;
			case Equal -> executeEqual(registers, firstOperand, secondOperand);
			case LessThan -> executeLessThan(registers, firstOperand, secondOperand);
			case GreaterThan -> executeGreaterThan(registers, firstOperand, secondOperand);
			case LogicalAnd -> executeLogicalAnd(registers, firstOperand, secondOperand);
			case LogicalOr -> executeLogicalOr(registers, firstOperand, secondOperand);
			case LogicalNot -> executeLogicalNot(registers, firstOperand);
			case Halt -> false;
		};
	}

	private static boolean executeAdd(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] += registers[(int) secondOperand];
		return false;
	}

	private static boolean executeSub(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] -= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeMul(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] *= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeBitsShiftLeft(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] <<= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeBitsShiftRight(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] >>= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeBitsAnd(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] &= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeBitsOr(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] |= registers[(int) secondOperand];
		return false;
	}

	private static boolean executeBitsNot(long[] registers, long firstOperand) {
		registers[(int) firstOperand] = ~registers[(int) firstOperand];
		return false;
	}

	private static boolean executeIn(long[] registers, long firstOperand, IntSupplier read) {
		registers[(int) firstOperand] = read.getAsInt();
		return false;
	}

	private static boolean executeOut(long[] registers, long firstOperand, IntConsumer write) {
		write.accept((int) registers[(int) firstOperand]);
		return false;
	}

	private static boolean executeEqual(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] == registers[(int) secondOperand]) ? 1 : 0;
		return false;
	}

	private static boolean executeLessThan(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] < registers[(int) secondOperand]) ? 1 : 0;
		return false;
	}

	private static boolean executeGreaterThan(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] > registers[(int) secondOperand]) ? 1 : 0;
		return false;
	}

	private static boolean executeLogicalAnd(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] != 0 && registers[(int) secondOperand] != 0) ? 1 : 0;
		return false;
	}

	private static boolean executeLogicalOr(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] != 0 || registers[(int) secondOperand] != 0) ? 1 : 0;
		return false;
	}

	private static boolean executeLogicalNot(long[] registers, long firstOperand) {
		registers[(int) firstOperand] = (registers[(int) firstOperand] == 0) ? 1 : 0;
		return false;
	}

	private static boolean executeLoad(
			long[] registers,
			long[] memory,
			Variant var,
			long firstOperand,
			long secondOperand) {
		if (var == Variant.Immediate) {
			registers[(int) firstOperand] = secondOperand;
		} else if (var == Variant.DirectAddress) {
			registers[(int) firstOperand] = memory[(int) secondOperand];
		} else if (var == Variant.IndirectAddress) {
			int address = (int) memory[(int) secondOperand];
			registers[(int) firstOperand] = memory[address];
		}
		return false;
	}

	private static boolean executeStore(
			long[] registers,
			long[] memory,
			Variant var,
			long firstOperand,
			long secondOperand) {
		if (var == Variant.DirectAddress) {
			memory[(int) secondOperand] = registers[(int) firstOperand];
		} else if (var == Variant.IndirectAddress) {
			int address = (int) memory[(int) secondOperand];
			memory[address] = registers[(int) firstOperand];
		}
		return false;
	}

	private static int resolveJumpTarget(Variant variant, long[] memory, int operand) {
		return switch (variant) {
			case Immediate -> operand;
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
