package tuff.tuffc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AppTest {

	@Test
	void greetingShouldReturnExpectedValue() {
		assertEquals("Hello, Maven!", App.greeting());
	}

	@Test
	void evaluateEmptyStringShouldReturnZero() {
		assertEquals(0, App.evaluate(""));
	}

	@Test
	void evaluateReturnZeroShouldReturnZero() {
		assertEquals(0, App.evaluate("return 0;"));
	}

	@Test
	void evaluateReturnOneShouldReturnOne() {
		assertEquals(1, App.evaluate("return 1;"));
	}

	@Test
	void evaluateLetThenReturnVariableShouldReturnValue() {
		assertEquals(1, App.evaluate("let x = 1; return x;"));
	}
}
