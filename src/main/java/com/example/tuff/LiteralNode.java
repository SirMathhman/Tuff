package com.example.tuff;

/**
 * A simple AST node representing a literal value.
 */
public class LiteralNode implements ASTNode {
	private final String value;
	private final String suffix; // e.g., "U8"

	public LiteralNode(String value) {
		this(value, null);
	}

	public LiteralNode(String value, String suffix) {
		this.value = value;
		this.suffix = suffix;
	}

	public String getValue() {
		return value;
	}

	public String getSuffix() {
		return suffix;
	}

	@Override
	public String toString() {
		return "LiteralNode{" + value + (suffix != null ? suffix : "") + '}';
	}
}
