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
		// Support unsigned 8-bit integer suffix format, e.g. "100U8" -> LiteralNode("100")
		if (source.endsWith("U8")) {
			String prefix = source.substring(0, source.length() - 2);
			if (prefix.matches("\\d+")) {
				return new LiteralNode(prefix);
			}
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
		if (node instanceof LiteralNode) {
			LiteralNode ln = (LiteralNode) node;
			return ln.getValue();
		}
		// Fallback: return toString() for unknown node types
		return node.toString();
	}

	/**
	 * Interpret the given source: parse it into an ASTNode and execute it.
	 *
	 * @param source source text to interpret
	 * @return the result of executing the parsed ASTNode
	 */
	public static String interpret(String source) {
		// YOU CANNOT MODIFY THIS

		ASTNode node = parse(source);
		return execute(node);
	}
}
