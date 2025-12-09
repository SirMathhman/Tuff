package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AppTest {
	@Test
	void greetReturnsExpected() {
		assertEquals("Hello, Tuff!", App.greet());
	}

	@Test
	void interpretIsStubbed() {
		assertThrows(UnsupportedOperationException.class, () -> App.interpret("anything"));
	}
}
