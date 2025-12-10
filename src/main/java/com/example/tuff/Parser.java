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
		return new LiteralNode(source);
	}
}
