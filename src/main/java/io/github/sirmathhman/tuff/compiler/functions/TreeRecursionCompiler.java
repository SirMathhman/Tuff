package io.github.sirmathhman.tuff.compiler.functions;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import io.github.sirmathhman.tuff.compiler.letbinding.FunctionHandler;
import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
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

	private record Spec(long initialArg, long threshold, long baseValue, long firstOff, long secondOff, String operator) {}

	private static final class CompileState {
		private final List<Instruction> code = new ArrayList<>();
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
			List<Instruction> instructions) {

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

	private static Result<Void, CompileError> compile(Spec spec, List<Instruction> instructions) {
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
		st.code.add(insn(Operation.Load, Variant.Immediate, 0, STACK_BASE + 1));
		st.code.add(insn(Operation.Store, Variant.DirectAddress, 0, SP_ADDR));
		// reg[1] = n = initialArg
		st.code.add(insn(Operation.Load, Variant.Immediate, 1, spec.initialArg));

		// Push initial frame: firstResult(0), n, ret
		st.endAddrPatch = pushFrame(st.code);
	}

	private static void emitFuncStartAndFirstCall(CompileState st, Spec spec) {
		st.funcStart = st.code.size();

		st.code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
		st.code.add(insn(Operation.Add, Variant.Immediate, 0, 1L));
		st.code.add(insn(Operation.Load, Variant.Immediate, 2, spec.threshold + 1));
		st.code.add(insn(Operation.Sub, Variant.Immediate, 0, 2L));
		st.baseCasePatch = st.code.size();
		st.code.add(insn(Operation.JumpIfLessThanZero, Variant.Immediate, 0, 0L));

		// Push child frame: firstResult(0), n, ret=AFTER_FIRST
		st.afterFirstPatch = pushFrame(st.code);
		st.code.add(insn(Operation.Load, Variant.Immediate, 2, spec.firstOff));
		st.code.add(insn(Operation.Sub, Variant.Immediate, 1, 2L));
		st.code.add(insn(Operation.Jump, Variant.Immediate, 0L, (long) st.funcStart));
	}

	private static void emitAfterFirstAndSecondCall(CompileState st, Spec spec) {
		st.afterFirst = st.code.size();
		// We returned with SP pointing at child's ret. Pop child frame (ret, n,
		// firstResult)
		addIncrementSP(st.code);
		addIncrementSP(st.code);
		addIncrementSP(st.code);

		// Store first recursive result into current frame's firstResult slot (SP+2)
		addIncrementSP(st.code);
		addIncrementSP(st.code);
		st.code.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
		addDecrementSP(st.code);
		addDecrementSP(st.code);

		// Restore n from current frame (SP+1)
		addIncrementSP(st.code);
		st.code.add(insn(Operation.Load, Variant.IndirectAddress, 1, SP_ADDR));
		addDecrementSP(st.code);

		// Push child2 frame: firstResult(0), n, ret=AFTER_SECOND
		st.afterSecondPatch = pushFrame(st.code);
		st.code.add(insn(Operation.Load, Variant.Immediate, 2, spec.secondOff));
		st.code.add(insn(Operation.Sub, Variant.Immediate, 1, 2L));
		st.code.add(insn(Operation.Jump, Variant.Immediate, 0L, (long) st.funcStart));
	}

	private static void emitAfterSecond(CompileState st, Spec spec) {
		st.afterSecond = st.code.size();
		// Pop child2 frame (ret, n, firstResult)
		addIncrementSP(st.code);
		addIncrementSP(st.code);
		addIncrementSP(st.code);

		// Load first recursive result from current frame's firstResult slot (SP+2)
		addIncrementSP(st.code);
		addIncrementSP(st.code);
		st.code.add(insn(Operation.Load, Variant.IndirectAddress, 2, SP_ADDR));
		addDecrementSP(st.code);
		addDecrementSP(st.code);

		var combineOp = mapOp(spec.operator);
		st.code.add(insn(combineOp, Variant.Immediate, 0, 2L));

		// Return to ret addr at [SP] without popping current frame (caller will pop)
		emitReturn(st.code);
	}

	private static void emitBaseCase(CompileState st, Spec spec) {
		st.baseCase = st.code.size();
		st.code.add(insn(Operation.Load, Variant.Immediate, 0, spec.baseValue));
		// Return to ret addr at [SP] without popping current frame (caller will pop)
		emitReturn(st.code);
	}

	private static void emitEndAndPatch(CompileState st) {
		st.endAddr = st.code.size();
		st.code.add(insn(Operation.Halt, Variant.Immediate, 0, 0L));

		st.code.set(st.endAddrPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.endAddr));
		st.code.set(st.baseCasePatch,
				insn(Operation.JumpIfLessThanZero, Variant.Immediate, 0, (long) st.baseCase));
		st.code.set(st.afterFirstPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.afterFirst));
		st.code.set(st.afterSecondPatch, insn(Operation.Load, Variant.Immediate, 0, (long) st.afterSecond));
	}

	private static void addDecrementSP(List<Instruction> code) {
		code.add(insn(Operation.Load, Variant.DirectAddress, 2, SP_ADDR));
		code.add(insn(Operation.Load, Variant.Immediate, 3, 1L));
		code.add(insn(Operation.Sub, Variant.Immediate, 2, 3L));
		code.add(insn(Operation.Store, Variant.DirectAddress, 2, SP_ADDR));
	}

	private static void addIncrementSP(List<Instruction> code) {
		code.add(insn(Operation.Load, Variant.DirectAddress, 2, SP_ADDR));
		code.add(insn(Operation.Load, Variant.Immediate, 3, 1L));
		code.add(insn(Operation.Add, Variant.Immediate, 2, 3L));
		code.add(insn(Operation.Store, Variant.DirectAddress, 2, SP_ADDR));
	}

	/**
	 * Pushes a stack frame with: firstResult(0), n (reg[1]), and a return address.
	 * The return address patch index is returned.
	 */
	private static int pushFrame(List<Instruction> code) {
		addDecrementSP(code);
		code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
		code.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
		addDecrementSP(code);
		code.add(insn(Operation.Store, Variant.IndirectAddress, 1, SP_ADDR));
		addDecrementSP(code);
		var patchIndex = code.size();
		code.add(insn(Operation.Load, Variant.Immediate, 0, 0L));
		code.add(insn(Operation.Store, Variant.IndirectAddress, 0, SP_ADDR));
		return patchIndex;
	}

	/**
	 * Emits code to return to the address stored at [SP] without popping the current frame.
	 */
	private static void emitReturn(List<Instruction> code) {
		code.add(insn(Operation.Load, Variant.IndirectAddress, 2, SP_ADDR));
		code.add(insn(Operation.Store, Variant.DirectAddress, 2, JUMP_TEMP));
		code.add(insn(Operation.Jump, Variant.DirectAddress, 0L, JUMP_TEMP));
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
