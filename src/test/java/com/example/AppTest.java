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
		assertEquals(100, App.interpret("100"));
	}
}
