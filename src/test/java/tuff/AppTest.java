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
	void interpretSignedMultiplicationOverflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("-10I8 * 30I8"));
	}

	@Test
	void interpretUnsignedMultiplicationOverflowThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("100U8 * 100U8"));
	}

	@Test
	void interpretPrecedenceMultiplicationBeforeAddition() {
		assertEquals("7", App.interpret("1U8 + 2U8 * 3U8"));
	}

	@Test
	void interpretParenthesesAffectPrecedence() {
		assertEquals("9", App.interpret("(1U8 + 2U8) * 3U8"));
	}

	@Test
	void interpretCurlyBracesAffectPrecedence() {
		assertEquals("9", App.interpret("{ 1U8 + 2U8 } * 3U8"));
	}

	@Test
	void interpretLetInBracesAffectPrecedence() {
		assertEquals("9", App.interpret("{ let x : U8 = 1U8 + 2U8; x } * 3U8"));
	}

	@Test
	void interpretTopLevelLetWithNestedBlock() {
		assertEquals("9", App.interpret("let y : U8 = { let x : U8 = 1U8 + 2U8; x } * 3U8; y"));
	}

	@Test
	void interpretTopLevelLetReturnsEmptyString() {
		assertEquals("", App.interpret("let x : U8 = 100U8;"));
	}

	@Test
	void interpretTopLevelLetRedeclarationThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : U8 = 100U8; let x : U8 = 200U8;"));
	}

	@Test
	void interpretBlockRedeclarationThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("{ let x : U8 = 1U8; let x : U8 = 2U8; x }"));
	}

	@Test
	void interpretTopLevelLetTypeMismatchThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : U8 = 200U16;"));
	}

	@Test
	void interpretTopLevelLetTypeInferenceSimple() {
		assertEquals("200", App.interpret("let x = 200U16; x"));
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
