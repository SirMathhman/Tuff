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

	@Test
	public void interpretAdditionReturnsSum() {
		String out = Parser.interpret("1U8 + 2U8");
		assertEquals("3", out);
	}

	@Test
	public void interpretMultipleAdditionsReturnsSum() {
		String out = Parser.interpret("1U8 + 2U8 + 3U8");
		assertEquals("6", out);
	}

	@Test
	public void interpretNegativeU8ThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-1U8"));
	}

	@Test
	public void interpretOutOfRangeU8ThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("256U8"));
	}

	@Test
	public void interpretAdditionOutOfRangeThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("100U8 + 300U8"));
	}

	// Tests for I8 (signed 8-bit: -128..127)
	@Test
	public void interpretI8PositiveValue() {
		String out = Parser.interpret("100I8");
		assertEquals("100", out);
	}

	@Test
	public void interpretI8NegativeValue() {
		String out = Parser.interpret("-100I8");
		assertEquals("-100", out);
	}

	@Test
	public void interpretI8MinValue() {
		String out = Parser.interpret("-128I8");
		assertEquals("-128", out);
	}

	@Test
	public void interpretI8MaxValue() {
		String out = Parser.interpret("127I8");
		assertEquals("127", out);
	}

	@Test
	public void interpretI8BelowMinThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-129I8"));
	}

	@Test
	public void interpretI8AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("128I8"));
	}

	// Tests for U16 (unsigned 16-bit: 0..65535)
	@Test
	public void interpretU16PositiveValue() {
		String out = Parser.interpret("1000U16");
		assertEquals("1000", out);
	}

	@Test
	public void interpretU16MaxValue() {
		String out = Parser.interpret("65535U16");
		assertEquals("65535", out);
	}

	@Test
	public void interpretU16ZeroValue() {
		String out = Parser.interpret("0U16");
		assertEquals("0", out);
	}

	@Test
	public void interpretU16NegativeThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-1U16"));
	}

	@Test
	public void interpretU16AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("65536U16"));
	}

	// Tests for I16 (signed 16-bit: -32768..32767)
	@Test
	public void interpretI16PositiveValue() {
		String out = Parser.interpret("10000I16");
		assertEquals("10000", out);
	}

	@Test
	public void interpretI16NegativeValue() {
		String out = Parser.interpret("-10000I16");
		assertEquals("-10000", out);
	}

	@Test
	public void interpretI16MinValue() {
		String out = Parser.interpret("-32768I16");
		assertEquals("-32768", out);
	}

	@Test
	public void interpretI16MaxValue() {
		String out = Parser.interpret("32767I16");
		assertEquals("32767", out);
	}

	@Test
	public void interpretI16BelowMinThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-32769I16"));
	}

	@Test
	public void interpretI16AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("32768I16"));
	}

	// Tests for U32 (unsigned 32-bit: 0..4294967295)
	@Test
	public void interpretU32PositiveValue() {
		String out = Parser.interpret("1000000U32");
		assertEquals("1000000", out);
	}

	@Test
	public void interpretU32MaxValue() {
		String out = Parser.interpret("4294967295U32");
		assertEquals("4294967295", out);
	}

	@Test
	public void interpretU32NegativeThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-1U32"));
	}

	@Test
	public void interpretU32AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("4294967296U32"));
	}

	// Tests for I32 (signed 32-bit: -2147483648..2147483647)
	@Test
	public void interpretI32PositiveValue() {
		String out = Parser.interpret("1000000I32");
		assertEquals("1000000", out);
	}

	@Test
	public void interpretI32NegativeValue() {
		String out = Parser.interpret("-1000000I32");
		assertEquals("-1000000", out);
	}

	@Test
	public void interpretI32MaxValue() {
		String out = Parser.interpret("2147483647I32");
		assertEquals("2147483647", out);
	}

	@Test
	public void interpretI32MinValue() {
		String out = Parser.interpret("-2147483648I32");
		assertEquals("-2147483648", out);
	}

	@Test
	public void interpretI32BelowMinThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-2147483649I32"));
	}

	@Test
	public void interpretI32AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("2147483648I32"));
	}

	// Tests for U64 (unsigned 64-bit: 0..18446744073709551615)
	@Test
	public void interpretU64PositiveValue() {
		String out = Parser.interpret("10000000000000000U64");
		assertEquals("10000000000000000", out);
	}

	@Test
	public void interpretU64MaxValue() {
		String out = Parser.interpret("18446744073709551615U64");
		assertEquals("18446744073709551615", out);
	}

	@Test
	public void interpretU64NegativeThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-1U64"));
	}

	@Test
	public void interpretU64AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("18446744073709551616U64"));
	}

	// Tests for I64 (signed 64-bit: Long.MIN_VALUE..Long.MAX_VALUE)
	@Test
	public void interpretI64PositiveValue() {
		String out = Parser.interpret("10000000000000000I64");
		assertEquals("10000000000000000", out);
	}

	@Test
	public void interpretI64NegativeValue() {
		String out = Parser.interpret("-10000000000000000I64");
		assertEquals("-10000000000000000", out);
	}

	@Test
	public void interpretI64MaxValue() {
		String out = Parser.interpret("9223372036854775807I64");
		assertEquals("9223372036854775807", out);
	}

	@Test
	public void interpretI64MinValue() {
		String out = Parser.interpret("-9223372036854775808I64");
		assertEquals("-9223372036854775808", out);
	}

	@Test
	public void interpretI64BelowMinThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-9223372036854775809I64"));
	}

	@Test
	public void interpretI64AboveMaxThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("9223372036854775808I64"));
	}

	// Tests for binary operations with other types
	@Test
	public void interpretI8Addition() {
		String out = Parser.interpret("50I8 + 30I8");
		assertEquals("80", out);
	}

	@Test
	public void interpretI8AdditionNegative() {
		String out = Parser.interpret("-50I8 + 30I8");
		assertEquals("-20", out);
	}

	@Test
	public void interpretI8AdditionOverflowThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("100I8 + 50I8"));
	}

	@Test
	public void interpretU16Addition() {
		String out = Parser.interpret("1000U16 + 2000U16");
		assertEquals("3000", out);
	}

	@Test
	public void interpretU16AdditionOverflowThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("60000U16 + 10000U16"));
	}

	@Test
	public void interpretI32Addition() {
		String out = Parser.interpret("1000000I32 + 2000000I32");
		assertEquals("3000000", out);
	}

	@Test
	public void interpretI32AdditionNegativeOverflowThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("-2000000000I32 + -500000000I32"));
	}

	@Test
	public void interpretU32Addition() {
		String out = Parser.interpret("1000000000U32 + 2000000000U32");
		assertEquals("3000000000", out);
	}

	@Test
	public void interpretU32AdditionOverflowThrowsExecuteException() {
		assertThrows(ExecuteException.class, () -> Parser.interpret("3000000000U32 + 2000000000U32"));
	}
}
