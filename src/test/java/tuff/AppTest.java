package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class AppTest {
	@Test
	void greetReturnsExpectedString() {
		assertEquals("Hello from Tuff App!", App.greet());
	}

	@Test
	void interpretEmptyReturnsEmpty() {
		assertEquals("", App.interpret(""));
	}

	@Test
	void interpretOneHundredReturnsSame() {
		assertEquals("100", App.interpret("100"));
	}

	@Test
	void interpretTwoHundredReturnsSame() {
		assertEquals("200", App.interpret("200"));
	}

	@Test
	void interpretNonEmptyThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("hello"));
	}
}
