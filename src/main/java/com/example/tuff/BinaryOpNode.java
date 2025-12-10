package com.example.tuff;

/**
 * A binary operation AST node (e.g., addition).
 */
public class BinaryOpNode implements ASTNode {
	private final ASTNode left;
	private final String op;
	private final ASTNode right;

	public BinaryOpNode(ASTNode left, String op, ASTNode right) {
		this.left = left;
		this.op = op;
		this.right = right;
	}

	public ASTNode getLeft() {
		return left;
	}

	public ASTNode getRight() {
		return right;
	}

	public String getOp() {
		return op;
	}

	@Override
	public String toString() {
		return "(" + left + " " + op + " " + right + ")";
	}
}
