package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
    

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
}
