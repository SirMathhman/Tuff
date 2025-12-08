package tuff;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class AppExpressionsTest {
	@Test
	void interpretIfConditionNonBooleanThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("if (100 + 200) 3 else 5"));
	}

	@Test
	void interpretTypedLetWithIfBranchesDifferentKindsThrows() {
		assertThrows(IllegalArgumentException.class,
				() -> App.interpret("let x : U8 = if (true) false else 500;"));
	}

	@Test
	void interpretMatchExpressionSimple() {
		assertEquals("5", App.interpret("let x = match 100 { case 100 => 5; case _ => 2 }; x"));
	}

	@Test
	void interpretMatchBooleanControl() {
		assertEquals("5", App.interpret("let x = match true { case true => 5; case false => 2 }; x"));
	}

	@Test
	void interpretMutableAssignment() {
		assertEquals("200", App.interpret("let mut x = 100; x = 200; x"));
	}

	@Test
	void interpretAssignmentToImmutableThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x = 100; x = 200; x"));
	}

	@Test
	void interpretMutableAssignWrongKindThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let mut x = 100; x = false; x"));
	}

	@Test
	void interpretUninitializedTypedLetThenAssign() {
		assertEquals("100", App.interpret("let x : I32; x = 100; x"));
	}

	@Test
	void interpretTypedDeclarationAssignThenReassignThrows() {
		assertThrows(IllegalArgumentException.class, () -> App.interpret("let x : I32; x = 100; x = 200; x"));
	}

	@Test
	void interpretCompoundAddAssignMutable() {
		assertEquals("105", App.interpret("let mut x = 100; x += 5; x"));
	}

	@Test
	void interpretWhileLoopSimple() {
		assertEquals("4", App.interpret("let mut x = 0; while (x < 4) x += 1; x"));
	}

	@Test
	void interpretBreakFromWhileSingleStatementBody() {
		assertEquals("100", App.interpret("while (true) break; 100"));
	}

	@Test
	void interpretWhileLoopBlockBody() {
		assertEquals("4", App.interpret("let mut x = 0; while (x < 4) { x += 1; } x"));
	}

	@Test
	void interpretBreakFromWhileBlockBody() {
		assertEquals("1", App.interpret("let mut x = 0; while (x < 4) { x += 1; break; } x"));
	}

	@Test
	void interpretSimpleFunctionCall() {
		assertEquals("300",
				App.interpret("fn addTwo(first : I32, second : I32) : I32 => { return first + second; } addTwo(100, 200)"));
	}

	@Test
	void interpretSimpleFunctionCallNoBraces() {
		assertEquals("300",
				App.interpret("fn addTwo(first : I32, second : I32) : I32 => return first + second; addTwo(100, 200)"));
	}

	@Test
	void interpretSimpleFunctionCallExpressionBody() {
		assertEquals("300",
				App.interpret("fn addTwo(first : I32, second : I32) : I32 => first + second; addTwo(100, 200)"));
	}

	@Test
	void interpretSimpleFunctionCallNoDeclaredReturn() {
		assertEquals("300",
				App.interpret("fn addTwo(first : I32, second : I32) => first + second; addTwo(100, 200)"));
	}

	@Test
	void interpretFunctionCapturesOuterVariable() {
		assertEquals("100", App.interpret("let x = 100; fn get() => x; get()"));
	}

	@Test
	void interpretMatchNoDefaultThrows() {
		assertThrows(IllegalArgumentException.class,
				() -> App.interpret("let x = match 300 { case 100 => 5; case 200 => 2 }; x"));
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
