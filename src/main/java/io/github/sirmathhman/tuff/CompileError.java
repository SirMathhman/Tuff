package io.github.sirmathhman.tuff;

/**
 * Represents a compilation error.
 */
public record CompileError(String message) implements Error {
	public CompileError {
		if (message == null) {
			throw new IllegalArgumentException("Compile error message cannot be null");
		}
	}

	@Override
	public String display() {
		return message;
	}
}
