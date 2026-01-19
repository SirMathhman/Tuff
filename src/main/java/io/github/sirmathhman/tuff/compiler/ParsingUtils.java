package io.github.sirmathhman.tuff.compiler;

import java.util.List;

import io.github.sirmathhman.tuff.vm.Instruction;
import io.github.sirmathhman.tuff.vm.Operation;
import io.github.sirmathhman.tuff.vm.Variant;

public final class ParsingUtils {
	private ParsingUtils() {
	}

	/**
	 * Find the index of a semicolon at depth 0 in the given string,
	 * accounting for nested parentheses and braces.
	 *
	 * @param text       the text to search
	 * @param startIndex the index to start searching from
	 * @return the index of the semicolon, or -1 if not found
	 */
	public static int findSemicolonAtDepthZero(String text, int startIndex) {
		int depth = 0;
		for (int i = startIndex; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c == '(' || c == '{') {
				depth++;
			} else if (c == ')' || c == '}') {
				depth--;
			} else if (c == ';' && depth == 0) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Load a reference from memory and return it (for ending continuations).
	 *
	 * @param instructions the instruction list to add to
	 * @param refAddr      the address to load from
	 */
	public static void addLoadAndHalt(List<Instruction> instructions, long refAddr) {
		instructions.add(new Instruction(Operation.Load, Variant.DirectAddress, 0, refAddr));
		instructions.add(new Instruction(Operation.Halt, Variant.Immediate, 0, 0L));
	}
}
