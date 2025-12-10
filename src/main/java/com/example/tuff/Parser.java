package com.example.tuff;

/**
 * Parser utilities that produce ASTNode objects.
 */
public class Parser {

	/**
	 * Stubbed parse method that turns the provided source into an ASTNode.
	 * Current implementation returns a LiteralNode holding the source text.
	 *
	 * @param source the source to parse
	 * @return an ASTNode representing the parsed structure
	 * @throws IllegalArgumentException if source is null
	 */
	public static ASTNode parse(String source) {
		if (source == null) {
			throw new IllegalArgumentException("source cannot be null");
		}
		// Support simple binary addition by splitting on '+' (left-associative)
		String[] parts = source.split("\\s*\\+\\s*");
		if (parts.length > 1) {
			ASTNode left = parse(parts[0]);
			for (int i = 1; i < parts.length; i++) {
				ASTNode right = parse(parts[i]);
				left = new BinaryOpNode(left, "+", right);
			}
			return left;
		}
		// Support unsigned 8-bit integer suffix format, e.g. "100U8" ->
		// LiteralNode("100")
		if (source.endsWith("U8")) {
			String prefix = source.substring(0, source.length() - 2);
			if (prefix.matches("-?\\d+")) {
				return new LiteralNode(prefix, "U8");
			}
			// If it ends with U8 but prefix is non-numeric, keep original token
		}
		return new LiteralNode(source);
	}

	/**
	 * Execute the given ASTNode and return a string result.
	 * Current implementation supports LiteralNode by returning its value.
	 *
	 * @param node the ASTNode to execute
	 * @return a string result of executing the node
	 */
	public static String execute(ASTNode node) {
		if (node == null) {
			throw new IllegalArgumentException("node cannot be null");
		}
		if (node instanceof BinaryOpNode) {
			BinaryOpNode bin = (BinaryOpNode) node;
			if ("+".equals(bin.getOp())) {
				long left = numericValue(bin.getLeft());
				long right = numericValue(bin.getRight());
				long sum = left + right;
				boolean leftU8 = (bin.getLeft() instanceof LiteralNode)
						&& "U8".equals(((LiteralNode) bin.getLeft()).getSuffix());
				boolean rightU8 = (bin.getRight() instanceof LiteralNode)
						&& "U8".equals(((LiteralNode) bin.getRight()).getSuffix());
				if (leftU8 && rightU8) {
					if (sum < 0 || sum > 255) {
						throw new ExecuteException("Unsigned 8-bit integer overflow: " + sum);
					}
				}
				return String.valueOf(sum);
			}
		}
		if (node instanceof LiteralNode) {
			LiteralNode ln = (LiteralNode) node;
			String val = ln.getValue();
			String suffix = ln.getSuffix();
			if ("U8".equals(suffix)) {
				if (val.matches("-?\\d+")) {
					long num = Long.parseLong(val);
					if (num < 0) {
						throw new ExecuteException("Unsigned 8-bit integer cannot be negative: " + val + "U8");
					}
					if (num > 255) {
						throw new ExecuteException("Unsigned 8-bit integer out of range (0..255): " + val + "U8");
					}
					return String.valueOf(num);
				}
			}
			return val;
		}
		// Fallback: return toString() for unknown node types
		return node.toString();
	}

	private static long numericValue(ASTNode node) {
		if (node instanceof LiteralNode) {
			LiteralNode ln = (LiteralNode) node;
			String val = ln.getValue();
			if (val.matches("-?\\d+")) {
				return Long.parseLong(val);
			}
			throw new ExecuteException("Not a numeric literal: " + val);
		}
		if (node instanceof BinaryOpNode) {
			String out = execute(node);
			if (out.matches("-?\\d+")) {
				return Long.parseLong(out);
			}
			throw new ExecuteException("Not a numeric expression: " + out);
		}
		String out = execute(node);
		if (out.matches("-?\\d+")) {
			return Long.parseLong(out);
		}
		throw new ExecuteException("Not a numeric result: " + out);
	}

	/**
	 * Interpret the given source: parse it into an ASTNode and execute it.
	 *
	 * @param source source text to interpret
	 * @return the result of executing the parsed ASTNode
	 */
	public static String interpret(String source) {
		// YOU CANNOT MODIFY THIS IMPLEMENTATION

		ASTNode node = parse(source);
		return execute(node);
	}
}
