package com.example.tuff;

/**
 * Exception thrown when executing an AST node fails (runtime execution error).
 */
public class ExecuteException extends RuntimeException {
	public ExecuteException() {
		super();
	}

	public ExecuteException(String message) {
		super(message);
	}

	public ExecuteException(String message, Throwable cause) {
		super(message, cause);
	}
}
