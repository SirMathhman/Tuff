package io.github.sirmathhman.tuff.vm;

import java.util.Arrays;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

public final class Vm {
	private Vm() {
	}

	public interface TraceSink {
		void onCycle(TraceCycle cycle, TraceConfig config);
	}

	public record TraceConfig(long maxCycles, int[] watchAddresses, int spAddress, int stackWindowSize) {
		public static TraceConfig disabled() {
			return TRACE_DISABLED;
		}

		public static TraceConfig standardStackDebug() {
			return new TraceConfig(0L, new int[] { 500, 501, 502 }, 500, 16);
		}
	}

	public record TraceInstruction(
			long encodedInstruction,
			Operation op,
			Variant variant,
			long firstOperand,
			long secondOperand) {
	}

	public record TraceMachine(
			long[] registers,
			int spValue,
			long[] stackValues,
			long[] watchValues) {
	}

	public record TraceFlow(boolean shouldJump, int nextProgramCounter) {
	}

	public record TraceCycle(
			long cycle,
			int programCounter,
			TraceInstruction instruction,
			TraceMachine machine,
			TraceFlow flow) {
	}

	private static final TraceConfig TRACE_DISABLED = new TraceConfig(0L, new int[0], -1, 0);

	private record Operands(long firstOperand, long secondOperand) {
	}

	private record InstructionContext(long[] registers, long[] memory, Operation op, Variant var,
			Operands operands) {
	}

	private static long sign_extend_24bit(long value) {
		var v = value;
		// If bit 23 is set, sign-extend with 1s (make it negative)
		if ((v & 0x800000L) != 0) {
			v |= 0xFFFFFFFFFF000000L; // Set all higher bits to 1
		}
		return v;
	}

	public static int execute(
			Instruction[] source,
			IntSupplier read,
			IntConsumer write) {
		return execute(source, read, write, TRACE_DISABLED, null);
	}

	public static int execute(Instruction[] source, IntSupplier read, IntConsumer write, TraceConfig traceConfig,
			TraceSink traceSink) {
		var cfg = traceConfig != null ? traceConfig : TRACE_DISABLED;
		var registers = new long[4];
		var memory = new long[1024];
		Arrays.fill(registers, 0L);
		Arrays.fill(memory, 0L);
		loadInstructionsIntoMemory(source, memory);

		var execCtx = new ExecutionContext(read, write, registers, memory, traceConfig, traceSink);
		while (true) {
			executeCycleBoundaryChecks(cfg, execCtx.cycle, execCtx.programCounter, memory.length);
			var result = executeSingleCycle(source, execCtx);
			if (result.isHalt()) {
				return (int) registers[0];
			}
			execCtx.cycle++;
			execCtx.programCounter = result.nextPC();
		}
	}

	private static class ExecutionContext {
		final IntSupplier read;
		final IntConsumer write;
		int programCounter;
		long cycle;
		final long[] registers;
		final long[] memory;
		final TraceConfig traceConfig;
		final TraceSink traceSink;

		ExecutionContext(IntSupplier r, IntConsumer w, long[] reg, long[] mem, TraceConfig tc, TraceSink ts) {
			this.read = r;
			this.write = w;
			this.programCounter = 0;
			this.cycle = 0;
			this.registers = reg;
			this.memory = mem;
			this.traceConfig = tc;
			this.traceSink = ts;
		}
	}

	private static void executeCycleBoundaryChecks(TraceConfig cfg, long cycle, int programCounter, int memoryLength) {
		if (cfg.maxCycles > 0 && cycle >= cfg.maxCycles) {
			throw new IllegalStateException("Cycle limit exceeded: " + cfg.maxCycles + " at PC " + programCounter);
		}
		if (programCounter < 0 || programCounter >= memoryLength) {
			throw new IllegalStateException("Program did not halt before reaching end of memory.");
		}
	}

	private static class CycleResult {
		int nextPC;
		boolean halt;

		CycleResult(int nextPC, boolean halt) {
			this.nextPC = nextPC;
			this.halt = halt;
		}

		int nextPC() {
			return nextPC;
		}

		boolean isHalt() {
			return halt;
		}
	}

	private static CycleResult executeSingleCycle(@SuppressWarnings("unused") Instruction[] source,
			ExecutionContext ctx) {
		var encodedInstruction = ctx.memory[ctx.programCounter];
		var operation = (int) ((encodedInstruction >>> 56) & 0xff);
		var variant = (int) ((encodedInstruction >>> 48) & 0xff);
		var firstOperand = sign_extend_24bit(encodedInstruction & 0xFFFFFFL);
		var secondOperand = sign_extend_24bit((encodedInstruction >>> 24) & 0xFFFFFFL);
		var op = Operation.values()[operation];
		var var = Variant.values()[variant];
		var inctx = new InstructionContext(ctx.registers, ctx.memory, op, var, new Operands(firstOperand, secondOperand));
		var shouldJump = executeInstruction(inctx, ctx.read, ctx.write);
		var nextPC = op == Operation.Halt ? ctx.programCounter
				: (shouldJump ? resolveJumpTarget(var, ctx.memory, (int) secondOperand) : ctx.programCounter + 1);
		if (ctx.traceSink != null) {
			var decoded = new DecodedInstruction(op, var, firstOperand, secondOperand);
			var cycleInfo = new CycleInfo(ctx.cycle, ctx.programCounter, shouldJump, nextPC);
			var traceData = new TraceData(encodedInstruction, decoded, cycleInfo, ctx.registers, ctx.memory);
			recordTrace(ctx.traceSink, ctx.traceConfig, traceData);
		}
		return new CycleResult(nextPC, op == Operation.Halt);
	}

	private static record DecodedInstruction(Operation op, Variant var, long firstOperand, long secondOperand) {
	}

	private static record CycleInfo(long cycle, int programCounter, boolean shouldJump, int nextPC) {
	}

	private static record TraceData(long encodedInstruction, DecodedInstruction decoded, CycleInfo cycleInfo,
			long[] registers, long[] memory) {
	}

	private static void recordTrace(TraceSink traceSink, TraceConfig traceConfig, TraceData data) {
		var instruction = new TraceInstruction(data.encodedInstruction(), data.decoded().op(), data.decoded().var(),
				data.decoded().firstOperand(), data.decoded().secondOperand());
		var machine = createMachineSnapshot(data.registers(), data.memory(),
				traceConfig != null ? traceConfig : TRACE_DISABLED);
		var flow = new TraceFlow(data.cycleInfo().shouldJump(), data.cycleInfo().nextPC());
		var cycleSnapshot = new TraceCycle(data.cycleInfo().cycle(), data.cycleInfo().programCounter(), instruction,
				machine, flow);
		traceSink.onCycle(cycleSnapshot, traceConfig != null ? traceConfig : TRACE_DISABLED);
	}

	private static TraceMachine createMachineSnapshot(long[] registers, long[] memory, TraceConfig cfg) {
		var regSnapshot = Arrays.copyOf(registers, registers.length);
		var spValue = -1;
		var stackValues = new long[0];
		if (cfg.spAddress >= 0 && cfg.spAddress < memory.length) {
			spValue = (int) memory[cfg.spAddress];
			stackValues = readMemoryWindow(memory, spValue, cfg.stackWindowSize);
		}
		int[] watchAddresses;
		if (cfg.watchAddresses == null)
			watchAddresses = new int[0];
		else
			watchAddresses = cfg.watchAddresses;
		var watchValues = readWatchedMemory(memory, watchAddresses);
		return new TraceMachine(regSnapshot, spValue, stackValues, watchValues);
	}

	private static long[] readWatchedMemory(long[] memory, int[] addresses) {
		var values = new long[addresses.length];
		for (var i = 0; i < addresses.length; i++) {
			var addr = addresses[i];
			if (addr >= 0 && addr < memory.length)
				values[i] = memory[addr];
			else
				values[i] = 0L;
		}
		return values;
	}

	private static long[] readMemoryWindow(long[] memory, int startAddress, int size) {
		if (size <= 0 || startAddress < 0 || startAddress >= memory.length) {
			return new long[0];
		}
		var safeSize = Math.min(size, memory.length - startAddress);
		var values = new long[safeSize];
		System.arraycopy(memory, startAddress, values, 0, safeSize);
		return values;
	}

	private static boolean executeInstruction(InstructionContext ctx, IntSupplier read,
			IntConsumer write) {
		var op = ctx.op;
		var registers = ctx.registers;
		var memory = ctx.memory;
		var variant = ctx.var;
		var firstOp = ctx.operands.firstOperand;
		var secondOp = ctx.operands.secondOperand;
		return switch (op) {
			case Load -> executeLoad(registers, memory, variant, firstOp, secondOp);
			case Store -> executeStore(registers, memory, variant, firstOp, secondOp);
			case Add -> executeAdd(registers, firstOp, secondOp);
			case Sub -> executeSub(registers, firstOp, secondOp);
			case Mul -> executeMul(registers, firstOp, secondOp);
			case Div -> executeDiv(registers, firstOp, secondOp);
			case BitsShiftLeft -> executeBitsShiftLeft(registers, firstOp, secondOp);
			case BitsShiftRight -> executeBitsShiftRight(registers, firstOp, secondOp);
			case BitsAnd -> executeBitsAnd(registers, firstOp, secondOp);
			case BitsOr -> executeBitsOr(registers, firstOp, secondOp);
			case BitsXor -> executeBitsXor(registers, firstOp, secondOp);
			case BitsNot -> executeBitsNot(registers, firstOp);
			case In -> executeIn(registers, firstOp, read);
			case Out -> executeOut(registers, firstOp, write);
			case Jump -> true;
			case JumpIfLessThanZero -> registers[(int) firstOp] < 0;
			case Equal -> executeEqual(registers, firstOp, secondOp);
			case LessThan -> executeLessThan(registers, firstOp, secondOp);
			case GreaterThan -> executeGreaterThan(registers, firstOp, secondOp);
			case LogicalAnd -> executeLogicalAnd(registers, firstOp, secondOp);
			case LogicalOr -> executeLogicalOr(registers, firstOp, secondOp);
			case LogicalNot -> executeLogicalNot(registers, firstOp);
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

	private static boolean executeDiv(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] /= registers[(int) secondOperand];
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

	private static boolean executeBitsXor(long[] registers, long firstOperand, long secondOperand) {
		registers[(int) firstOperand] ^= registers[(int) secondOperand];
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
		if (registers[(int) firstOperand] == registers[(int) secondOperand])
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
		return false;
	}

	private static boolean executeLessThan(long[] registers, long firstOperand, long secondOperand) {
		if (registers[(int) firstOperand] < registers[(int) secondOperand])
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
		return false;
	}

	private static boolean executeGreaterThan(long[] registers, long firstOperand, long secondOperand) {
		if (registers[(int) firstOperand] > registers[(int) secondOperand])
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
		return false;
	}

	private static boolean executeLogicalAnd(long[] registers, long firstOperand, long secondOperand) {
		if (registers[(int) firstOperand] != 0 && registers[(int) secondOperand] != 0)
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
		return false;
	}

	private static boolean executeLogicalOr(long[] registers, long firstOperand, long secondOperand) {
		if (registers[(int) firstOperand] != 0 || registers[(int) secondOperand] != 0)
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
		return false;
	}

	private static boolean executeLogicalNot(long[] registers, long firstOperand) {
		if (registers[(int) firstOperand] == 0)
			registers[(int) firstOperand] = 1;
		else
			registers[(int) firstOperand] = 0;
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
			var address = (int) memory[(int) secondOperand];
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
			var address = (int) memory[(int) secondOperand];
			memory[address] = registers[(int) firstOperand];
		}
		return false;
	}

	private static int resolveJumpTarget(Variant variant, long[] memory, int operand) {
		return switch (variant) {
			case Immediate -> operand;
			case DirectAddress -> (int) memory[operand];
			case IndirectAddress -> {
				var address = (int) memory[operand];
				yield (int) memory[address];
			}
		};
	}

	private static long encodeInstructionTo64Bits(Instruction instruction) {
		long encoded = 0;
		encoded |= ((long) instruction.operation().ordinal() & 0xffL) << 56;
		encoded |= ((long) instruction.variant().ordinal() & 0xffL) << 48;
		encoded |= instruction.firstOperand() & 0xFFFFFFL;

		var secondOperand = instruction.secondOperand();
		if (secondOperand != null) {
			encoded |= (secondOperand & 0xFFFFFFL) << 24;
		}

		return encoded;
	}

	private static void loadInstructionsIntoMemory(Instruction[] source, long[] memory) {
		for (var i = 0; i < source.length; i++) {
			memory[i] = encodeInstructionTo64Bits(source[i]);
		}
	}
}
