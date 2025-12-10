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

	@Test
	public void executeReturnsValue() {
		ASTNode node = Parser.parse("hello");
		String out = Parser.execute(node);
		assertEquals("hello", out);
	}

	@Test
	public void executeRejectsNull() {
		assertThrows(IllegalArgumentException.class, () -> Parser.execute(null));
	}

	@Test
	public void interpretReturnsValue() {
		String out = Parser.interpret("hello");
		assertEquals("hello", out);
	}

	@Test
	public void interpretRejectsNull() {
		assertThrows(IllegalArgumentException.class, () -> Parser.interpret(null));
	}

	@Test
	public void interpretU8SuffixStripsSuffix() {
		String out = Parser.interpret("100U8");
		assertEquals("100", out);
	}
}
