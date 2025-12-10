package com.example.tuff;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ParserTest {

	@Test
	public void parseReturnsASTNode() {
		ASTNode node = Parser.parse("hello");
		assertNotNull(node);
		assertTrue(node instanceof LiteralNode);
		LiteralNode ln = (LiteralNode) node;
		assertEquals("hello", ln.getValue());
	}

	@Test
	public void parseRejectsNull() {
		assertThrows(IllegalArgumentException.class, () -> Parser.parse(null));
	}
}
