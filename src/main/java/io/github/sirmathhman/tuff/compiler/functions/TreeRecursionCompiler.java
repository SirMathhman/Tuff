package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

import io.github.sirmathhman.tuff.lib.ArrayList;

import java.util.regex.Pattern;

/**
 * Compiles tree-recursive functions (like Fibonacci) using memory as a call
 * stack.
 * <p>
 * Memory layout:
 * - Addresses 0-499: Instructions
 * - Address 500: Stack pointer value (SP)
 * - Address 501: Temp for indirect jumps (JUMP_TEMP)
 * - Addresses 600-999: Stack (grows downward from 999)
 * <p>
 * Stack frame layout (3 words, grows downward):
 * - [frame]: Return address (lower address)
 * - [frame+1]: Saved n
 * - [frame+2]: First recursive result (higher address)
 * <p>
 * Push: decrement SP, then store (SP points to last used slot)
 * Pop: read from [SP], then increment SP
 * <p>
 * Registers:
 * - reg[0]: Return value / temp
 * - reg[1]: Current parameter n
 * - reg[2]: Temp for arithmetic
 * - reg[3]: Scratch
 * <p>
 * IMPORTANT: VM IndirectAddress uses memory[memory[addr]], not
 * memory[register].
 * So we store SP at address 500 and use 500 as the indirect address.
 */
public final class TreeRecursionCompiler {

	private static final long STACK_BASE = 999L;
	private static final long SP_ADDR = 500L;
	private static final long JUMP_TEMP = 501L;

	private record Spec(long initialArg, long threshold, long baseValue, long firstOff, long secondOff, String operator) {
	}

	private static final class CompileState {
		private ArrayList<Instruction> code = new ArrayList<>();
		private int endAddrPatch;
		private int baseCasePatch;
		private int afterFirstPatch;
		private int afterSecondPatch;
		private int funcStart;
		private int afterFirst;
		private int afterSecond;
		private int baseCase;
		private int endAddr;
	}

	private TreeRecursionCompiler() {
	}

	/**
	 * Try to compile a tree-recursive function like Fibonacci.
	 * Pattern: fn name(n : Type) => if (n <= THRESHOLD) BASE else name(n - A) OP
	 * name(n - B)
	 */
	public static Result<Void, CompileError> tryCompileTreeRecursion(
			FunctionHandler.FunctionDef funcDef,
			String callArgs,
			ArrayList<Instruction> instructions) {

		if (funcDef.params().size() != 1) {
			return null;
		}

		var paramName = funcDef.params().get(0).name();
		var funcName = funcDef.name();
		var body = funcDef.body().trim();

		// Pattern: if (n <= THRESHOLD) BASE else funcName(n - A) OP funcName(n - B)
		var p = Pattern.compile(
				"if\\s*\\(\\s*" + Pattern.quote(paramName) + "\\s*<=\\s*(\\d+)\\s*\\)\\s*"
						+ "(\\d+)\\s+else\\s+"
						+ Pattern.quote(funcName) + "\\s*\\(\\s*" + Pattern.quote(paramName)
						+ "\\s*-\\s*(\\d+)\\s*\\)\\s*"
						+ "([+\\-*/])\\s*"
						+ Pattern.quote(funcName) + "\\s*\\(\\s*" + Pattern.quote(paramName)
						+ "\\s*-\\s*(\\d+)\\s*\\)");

		var m = p.matcher(body);
		if (!m.find()) {
			return null;
		}

		var threshold = Long.parseLong(m.group(1));
		var baseValue = Long.parseLong(m.group(2));
		var firstOffset = Long.parseLong(m.group(3));
		var operator = m.group(4);
		var secondOffset = Long.parseLong(m.group(5));

		long initialArg;
		try {
			initialArg = Long.parseLong(callArgs.trim());
		} catch (NumberFormatException e) {
			return Result.err(new CompileError("Tree recursion arg must be literal: " + callArgs));
		}

		var spec = new Spec(initialArg, threshold, baseValue, firstOffset, secondOffset, operator);
		return compile(spec, instructions);
	}

	@SuppressWarnings("CheckReturnValue")
	private static Result<Void, CompileError> compile(Spec spec, ArrayList<Instruction> instructions) {
		var st = new CompileState();
		emitInit(st, spec);
		emitFuncStartAndFirstCall(st, spec);
		emitAfterFirstAndSecondCall(st, spec);
		emitAfterSecond(st, spec);
		emitBaseCase(st, spec);
		emitEndAndPatch(st);
		instructions.addAll(st.code);
		return Result.ok(null);
	}

	private static void emitInit(CompileState st, Spec spec) {
		// Initialize SP at memory[SP_ADDR] = STACK_BASE + 1 (nothing on stack yet)
		var code = st.code;
		code = code.add(insn(Operation.Load, Variant.Immediate, 0, STACK_BASE + 1));
		code = code.add(insn(Operation.Store, Variant.DirectAddress, 0, SP_ADDR));
		// reg[1] = n = initialArg
		code = code.add(insn(Operation.Load, Variant.Immediate, 1, spec.initialArg));

		// Push initial frame: firstResult(0), n, ret
		var initResult = pushFrame(code);
		st.code = initResult.code();
		st.endAddrPatch = initResult.patchIndex();
	}

	private static void emitFuncStartAndFirstCall(CompileState st, Spec spec) {
		var code = st.code;
		st.funcStart = code.size();

		code = code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
		code = code.add(insn(Operation.Add, Variant.Immediate, 0, 1L));
		code = code.add(insn(Operation.Load, Variant.Immediate, 2, spec.threshold + 1));
		code = code.add(insn(Operation.Sub, Variant.Immediate, 0, 2L));
		st.baseCasePatch = code.size();
		code = code.add(insn(Operation.JumpIfLessThanZero, Variant.Immediate, 0, 0L));

		// Push child frame: firstResult(0), n, ret=AFTER_FIRST
		var afterFirstResult = pushFrame(code);
		code = afterFirstResult.code();
		st.afterFirstPatch = afterFirstResult.patchIndex();
		code = code.add(insn(Operation.Load, Variant.Immediate, 2, spec.firstOff))
				.add(insn(Operation.Sub, Variant.Immediate, 1, 2L))
				.add(insn(Operation.Jump, Variant.Immediate, 0L, (long) st.funcStart));
		st.code = code;
	}

	/** Pop child frame: increment SP 3 times (for ret, n, firstResult slots). */
	private static ArrayList<Instruction> popChildFrame(ArrayList<Instruction> code) {
		var c = addIncrementSP(code);
		c = addIncrementSP(c);
		return addIncrementSP(c);
	}

	/** Access firstResult slot at SP+2: increment 2, execute op, decrement 2. */
	private static ArrayList<Instruction> accessFirstResultSlot(
			ArrayList<Instruction> code, Operation op, int reg) {
		var c = addIncrementSP(code);
		c = addIncrementSP(c);
		c = c.add(insn(op, Variant.IndirectAddress, reg, SP_ADDR));
		c = addDecrementSP(c);
		return addDecrementSP(c);
	}

	private static void emitAfterFirstAndSecondCall(CompileState st, Spec spec) {
		var code = st.code;
		st.afterFirst = code.size();
		code = emitStoreFirstResult(code);
		code = emitRestoreParameter(code);
		code = emitSecondCall(code, st, spec);
		st.code = code;
	}

	private static ArrayList<Instruction> emitStoreFirstResult(ArrayList<Instruction> code) {
		var c = popChildFrame(code);
		return accessFirstResultSlot(c, Operation.Store, 0);
	}

	private static ArrayList<Instruction> emitRestoreParameter(ArrayList<Instruction> code) {
		var c = addIncrementSP(code);
		c = c.add(insn(Operation.Load, Variant.IndirectAddress, 1, SP_ADDR));
		return addDecrementSP(c);
	}

	private static ArrayList<Instruction> emitSecondCall(ArrayList<Instruction> code, CompileState st, Spec spec) {
		var afterSecondResult = pushFrame(code);
		var c = afterSecondResult.code();
		st.afterSecondPatch = afterSecondResult.patchIndex();
		return c.add(insn(Operation.Load, Variant.Immediate, 2, spec.secondOff))
				.add(insn(Operation.Sub, Variant.Immediate, 1, 2L))
				.add(insn(Operation.Jump, Variant.Immediate, 0L, (long) st.funcStart));
	}

	private static void emitAfterSecond(CompileState st, Spec spec) {
		var code = st.code;
		st.afterSecond = code.size();
		// Pop child2 frame (ret, n, firstResult)
		code = popChildFrame(code);

		// Load first recursive result from current frame's firstResult slot (SP+2)
		code = accessFirstResultSlot(code, Operation.Load, 2);

		var combineOp = mapOp(spec.operator);
		code = code.add(insn(combineOp, Variant.Immediate, 0, 2L));

		// Return to ret addr at [SP] without popping current frame (caller will pop)
		st.code = emitReturn(code);
	}

	private static void emitBaseCase(CompileState st, Spec spec) {
		st.baseCase = st.code.size();
		st.code = st.code.add(insn(Operation.Load, Variant.Immediate, 0, spec.baseValue));
		// Return to ret addr at [SP] without popping current frame (caller will pop)
		st.code = emitReturn(st.code);
	}

	private static void emitEndAndPatch(CompileState st) {
		var code = st.code;
		st.endAddr = code.size();
		code = code.add(insn(Operation.Halt, Variant.Immediate, 0, 0L));
		st.code = applyPatches(code, st);
	}

	private static ArrayList<Instruction> applyPatches(ArrayList<Instruction> code, CompileState st) {
		var c = code;
		c = c.set(st.endAddrPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.endAddr));
		c = c.set(st.baseCasePatch,
				insn(Operation.JumpIfLessThanZero, Variant.Immediate, 0, (long) st.baseCase));
		c = c.set(st.afterFirstPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.afterFirst));
		return c.set(st.afterSecondPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.afterSecond));
	}

	private static ArrayList<Instruction> addDecrementSP(ArrayList<Instruction> code) {
		return code.add(insn(Operation.Load, Variant.DirectAddress, 2, SP_ADDR))
				.add(insn(Operation.Load, Variant.Immediate, 3, 1L))
				.add(insn(Operation.Sub, Variant.Immediate, 2, 3L))
				.add(insn(Operation.Store, Variant.DirectAddress, 2, SP_ADDR));
	}

	private static ArrayList<Instruction> addIncrementSP(ArrayList<Instruction> code) {
		return code.add(insn(Operation.Load, Variant.DirectAddress, 2, SP_ADDR))
				.add(insn(Operation.Load, Variant.Immediate, 3, 1L))
				.add(insn(Operation.Add, Variant.Immediate, 2, 3L))
				.add(insn(Operation.Store, Variant.DirectAddress, 2, SP_ADDR));
	}

	private record PushFrameResult(ArrayList<Instruction> code, int patchIndex) {
	}

	/**
	 * Pushes a stack frame with: firstResult(0), n (reg[1]), and a return address.
	 * Returns the updated code and the patch index for the return address.
	 */
	private static PushFrameResult pushFrame(ArrayList<Instruction> code) {
		var c = code;
		c = addDecrementSP(c);
		c = c.add(insn(Operation.Load, Variant.Immediate, 0, 0L))
				.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
		c = addDecrementSP(c);
		c = c.add(insn(Operation.Store, Variant.IndirectAddress, 1, SP_ADDR));
		c = addDecrementSP(c);
		var patchIndex = c.size();
		c = c.add(insn(Operation.Load, Variant.Immediate, 0, 0L))
				.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
		return new PushFrameResult(c, patchIndex);
	}

	/**
	 * Emits code to return to the address stored at [SP] without popping the
	 * current frame.
	 */
	private static ArrayList<Instruction> emitReturn(ArrayList<Instruction> code) {
		return code.add(insn(Operation.Load, Variant.IndirectAddress, 2, SP_ADDR))
				.add(insn(Operation.Store, Variant.DirectAddress, 2, JUMP_TEMP))
				.add(insn(Operation.Jump, Variant.DirectAddress, 0L, JUMP_TEMP));
	}

	private static Instruction insn(Operation op, Variant var, long first, long second) {
		return new Instruction(op, var, first, second);
	}

	private static Operation mapOp(String op) {
		return switch (op) {
			case "+" -> Operation.Add;
			case "-" -> Operation.Sub;
			case "*" -> Operation.Mul;
			case "/" -> Operation.Div;
			default -> throw new IllegalArgumentException("Unknown op: " + op);
		};
	}
}
