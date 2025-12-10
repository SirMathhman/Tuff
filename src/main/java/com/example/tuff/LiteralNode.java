package com.example.tuff;

/**
 * A simple AST node representing a literal value.
 */
public class LiteralNode implements ASTNode {
	private final String value;

	public LiteralNode(String value) {
		this.value = value;
	}

	public String getValue() {
		return value;
	}

	@Override
	public String toString() {
		return "LiteralNode{" + value + '}';
	}
}
