package com.example;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class AppTest {
	@Test
	void greetReturnsExpectedString() {
		assertEquals("Hello from Tuff App!", App.greet());
	}
}
