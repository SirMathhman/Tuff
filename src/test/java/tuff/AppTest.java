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

	// U16
	@Test
	void interpretU16Max() {
		assertEquals("65535", App.interpret("65535U16"));
	}

	@Test
	void interpretU16Overflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("65536U16"));
	}

	// U32
	@Test
	void interpretU32Max() {
		assertEquals("4294967295", App.interpret("4294967295U32"));
	}

	@Test
	void interpretU32Overflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("4294967296U32"));
	}

	// U64
	@Test
	void interpretU64Max() {
		assertEquals("18446744073709551615", App.interpret("18446744073709551615U64"));
	}

	@Test
	void interpretU64Overflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("18446744073709551616U64"));
	}

	// Signed I types
	@Test
	void interpretI8Bounds() {
		assertEquals("127", App.interpret("127I8"));
		assertEquals("-128", App.interpret("-128I8"));
		assertThrows(IllegalArgumentException.class, () -> App.interpret("128I8"));
		assertThrows(IllegalArgumentException.class, () -> App.interpret("-129I8"));
	}

	@Test
	void interpretI32Overflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("2147483648I32"));
	}

	@Test
	void interpretAddsU8Operands() {
		assertEquals("3", App.interpret("1U8 + 2U8"));
	}

	@Test
	void interpretU8AdditionOverflow() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("1U8 + 255U8"));
	}

	@Test
	void interpretMixedTypeAdditionThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("1U8 + 2U16"));
	}

	@Test
	void interpretNAryAddition() {
		assertEquals("6", App.interpret("1U8 + 2U8 + 3U8"));
	}

	@Test
	void interpretMixedAddSubtract() {
		assertEquals("8", App.interpret("10U8 - 5U8 + 3U8"));
	}

	@Test
	void interpretUnsignedUnderflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("3U8 - 5U8"));
	}

	@Test
	void interpretMultiplyAndAddPrecedence() {
		assertEquals("53", App.interpret("10U8 * 5U8 + 3U8"));
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
