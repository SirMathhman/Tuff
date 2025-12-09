package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AppTest {
	@Test
	void greetReturnsExpected() {
		assertEquals("Hello, Tuff!", App.greet());
	}

	// interpret should return the leading numeric prefix if present

	@Test
	void interpretReturnsLeadingDigits() {
		assertEquals("100", App.interpret("100U8"));
	}

	@Test
	void interpretThrowsForNegativeU8() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("-1U8 "));
	}
	@Test
	void interpretThrowsForU8Overflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("256U8"));
	}
}
