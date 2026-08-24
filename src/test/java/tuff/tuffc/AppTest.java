package tuff.tuffc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import tuff.tuffc.error.ErrorKind;
import tuff.tuffc.error.Result;

class AppTest {

	@Test
	void greetingShouldReturnExpectedValue() {
		assertEquals("Hello, Maven!", App.greeting());
	}

	@Test
	void evaluateEmptyStringShouldProduceEmptyProgramDiagnostic() {
		Result<Integer> result = App.evaluate("");
		assertTrue(result.isFail());
		assertEquals(ErrorKind.EMPTY_PROGRAM, result.error().kind());
	}

	@Test
	void evaluateReturnZeroShouldReturnZero() {
		Result<Integer> result = App.evaluate("return 0;");
		assertTrue(result.isOk());
		assertEquals(0, result.value());
	}

	@Test
	void evaluateReturnOneShouldReturnOne() {
		Result<Integer> result = App.evaluate("return 1;");
		assertTrue(result.isOk());
		assertEquals(1, result.value());
	}

	@Test
	void evaluateLetThenReturnVariableShouldReturnValue() {
		Result<Integer> result = App.evaluate("let x = 1; return x;");
		assertTrue(result.isOk());
		assertEquals(1, result.value());
	}

	@Test
	void evaluateInvalidLetShouldProduceDiagnostic() {
		Result<Integer> result = App.evaluate("let x 1; return x;");
		assertTrue(result.isFail());
		assertEquals(ErrorKind.INVALID_LET_STATEMENT, result.error().kind());
	}

	@Test
	void evaluateInvalidIntegerShouldProduceDiagnostic() {
		Result<Integer> result = App.evaluate("let x = abc; return x;");
		assertTrue(result.isFail());
		assertEquals(ErrorKind.INVALID_INTEGER, result.error().kind());
	}

	@Test
	void evaluateUndefinedVariableShouldProduceDiagnostic() {
		Result<Integer> result = App.evaluate("return y;");
		assertTrue(result.isFail());
		assertEquals(ErrorKind.UNDEFINED_VARIABLE, result.error().kind());
	}

	@Test
	void evaluateUnsupportedStatementShouldProduceDiagnostic() {
		Result<Integer> result = App.evaluate("foo();");
		assertTrue(result.isFail());
		assertEquals(ErrorKind.UNSUPPORTED_STATEMENT, result.error().kind());
	}
}
