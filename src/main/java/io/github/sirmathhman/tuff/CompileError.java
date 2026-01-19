package io.github.sirmathhman.tuff;

/**
 * Represents a compilation error.
 */
public record CompileError(String message) {
	public CompileError {
		if (message == null) {
			throw new IllegalArgumentException("Compile error message cannot be null");
		}
	}

	@Override
	public String toString() {
		return "CompileError: " + message;
	}
}
