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
	void interpretLargeNumberReturnsSame() {
		assertEquals("163638", App.interpret("163638"));
	}

	@Test
	void interpretWithU8SuffixReturnsNumber() {
		assertEquals("100", App.interpret("100U8"));
	}

	@Test
	void interpretAddU8ReturnsSum() {
		assertEquals("150", App.interpret("100U8 + 50U8"));
	}

	@Test
	void interpretChainedU8AdditionReturnsSum() {
		assertEquals("6", App.interpret("1U8 + 2U8 + 3U8"));
	}

	@Test
	void interpretMixedSubtractAddReturnsCorrect() {
		assertEquals("8", App.interpret("10 - 5U8 + 3"));
	}

	@Test
	void interpretAddU8AndPlainIntegerReturnsSum() {
		assertEquals("150", App.interpret("100U8 + 50"));
	}

	@Test
	void interpretPlainIntegerPlusU8ReturnsSum() {
		assertEquals("150", App.interpret("100 + 50U8"));
	}

	@Test
	void interpretPlainIntegerAddPlainIntegerReturnsSum() {
		assertEquals("150", App.interpret("100 + 50"));
	}

	@Test
	void interpretAddU8OverflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("100U8 + 200U8"));
	}

	@Test
	void interpretMixedDifferentSuffixesThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("100U8 + 200U16"));
	}

	@Test
	void interpretMixedDifferentSuffixesInChainThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("100U8 + 3 + 200U16"));
	}

	@Test
	void interpretU16ReturnsNumber() {
		assertEquals("456", App.interpret("456U16"));
	}

	@Test
	void interpretU32ReturnsNumber() {
		assertEquals("789", App.interpret("789U32"));
	}

	@Test
	void interpretU64ReturnsNumber() {
		assertEquals("1000", App.interpret("1000U64"));
	}

	@Test
	void interpretI8ReturnsNumber() {
		assertEquals("-1", App.interpret("-1I8"));
	}

	@Test
	void interpretI16ReturnsNumber() {
		assertEquals("-2", App.interpret("-2I16"));
	}

	@Test
	void interpretI32ReturnsNumber() {
		assertEquals("-3", App.interpret("-3I32"));
	}

	@Test
	void interpretI64ReturnsNumber() {
		assertEquals("-4", App.interpret("-4I64"));
	}

	@Test
	void interpretNegativeUnsignedThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("-100U8"));
	}

	@Test
	void interpretUnsignedOverflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("256U8"));
	}

	@Test
	void interpretUnsignedEdgeAccepts() {
		assertEquals("255", App.interpret("255U8"));
	}

	@Test
	void interpretArbitraryPositiveIntegerReturnsSame() {
		assertEquals("42", App.interpret("42"));
	}

	@Test
	void interpretNegativeIntegerReturnsSame() {
		assertEquals("-7", App.interpret("-7"));
	}

	@Test
	void interpretNonEmptyThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("hello"));
	}
}
