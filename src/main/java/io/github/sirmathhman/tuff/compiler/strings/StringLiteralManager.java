package io.github.sirmathhman.tuff.compiler.strings;

import io.github.sirmathhman.tuff.CompileError;
import io.github.sirmathhman.tuff.Result;
import java.util.Map;

/**
 * Manages string literal storage in VM memory.
 * Strings are stored starting at memory address 1000.
 * Each string stores: [length, char1, char2, ..., charN]
 */
public final class StringLiteralManager {
	private static final int STRING_BASE_ADDRESS = 1000;

	private StringLiteralManager() {
	}

	public static Result<StringAllocation, CompileError> allocateString(String content,
			Map<String, StringAllocation> allocations) {
		// Check if already allocated
		if (allocations.containsKey(content)) {
			return Result.ok(allocations.get(content));
		}

		// Calculate next available address
		int nextAddress = STRING_BASE_ADDRESS;
		for (StringAllocation alloc : allocations.values()) {
			nextAddress = Math.max(nextAddress, alloc.address() + alloc.length() + 1);
		}

		// Check if we have enough space
		if (nextAddress + content.length() + 1 >= 1024) {
			return Result.err(new CompileError("String pool exhausted"));
		}

		StringAllocation allocation = new StringAllocation(nextAddress, content);
		allocations.put(content, allocation);

		return Result.ok(allocation);
	}

	public record StringAllocation(int address, String content) {
		public int length() {
			return content.length();
		}
	}
}
