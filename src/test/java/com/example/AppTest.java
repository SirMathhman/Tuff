package com.example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class AppTest {

	@Test
	void simpleTest() {
		assertTrue(true, "Sanity check");
	}

	@Test
	void interpretParsesIntegerString() {
		Result<java.math.BigInteger, String> result = App.interpret("100");
		assertTrue(result.isOk());
		assertEquals(java.math.BigInteger.valueOf(100), result.get());
	}

	@Test
	void interpretParsesIntegerWithSuffix() {
		Result<java.math.BigInteger, String> result = App.interpret("100U8");
		assertTrue(result.isOk());
		assertEquals(java.math.BigInteger.valueOf(100), result.get());
	}

	@Test
	void interpretReturnsErrorForNull() {
		Result<java.math.BigInteger, String> result = App.interpret(null);
		assertTrue(result.isErr());
		assertEquals("null", result.getError());
	}

	@Test
	void interpretRejectsNegativeWithSuffix() {
		Result<java.math.BigInteger, String> result = App.interpret("-100U8");
		assertTrue(result.isErr());
	}

	@Test
	void interpretRejectsU8Overflow() {
		Result<java.math.BigInteger, String> result = App.interpret("256U8");
		assertTrue(result.isErr());
	}

	@Test
	void interpretU16Boundaries() {
		Result<java.math.BigInteger, String> ok = App.interpret("65535U16");
		Result<java.math.BigInteger, String> err = App.interpret("65536U16");
		assertTrue(ok.isOk());
		assertEquals(java.math.BigInteger.valueOf(65535), ok.get());
		assertTrue(err.isErr());
	}

	@Test
	void interpretI8Boundaries() {
		Result<java.math.BigInteger, String> ok = App.interpret("-128I8");
		Result<java.math.BigInteger, String> err = App.interpret("-129I8");
		assertTrue(ok.isOk());
		assertEquals(java.math.BigInteger.valueOf(-128), ok.get());
		assertTrue(err.isErr());
	}
}
