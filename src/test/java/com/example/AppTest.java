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
		Result<Integer, String> result = App.interpret("100");
		assertTrue(result.isOk());
		assertEquals(100, result.get());
	}

	@Test
	void interpretParsesIntegerWithSuffix() {
		Result<Integer, String> result = App.interpret("100U8");
		assertTrue(result.isOk());
		assertEquals(100, result.get());
	}

	@Test
	void interpretReturnsErrorForNull() {
		Result<Integer, String> result = App.interpret(null);
		assertTrue(result.isErr());
		assertEquals("null", result.getError());
	}
}
