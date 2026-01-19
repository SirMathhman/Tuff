package io.github.sirmathhman.tuff;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public final class AppTest {
	@Test
	void shouldRunTheSimplestProgramPossible() {
		assertValid("", 0);
	}

	private void assertValidWithInput(String source, int exitCode, int... input) {
		Assertions.assertTimeoutPreemptively(Duration.ofMillis(100), () -> {
			Result<RunResult, CompileError> result = App.run(source, input);
			assertTrue(result.isOk(), "Compilation failed: " + (result.isErr() ? result.errValue() : ""));

			RunResult runResult = result.okValue();
			assertEquals(exitCode, runResult.returnValue());
			assertTrue(runResult.output().isEmpty());
		});
	}

	private void assertValid(String source, int exitCode) {
		Assertions.assertTimeoutPreemptively(Duration.ofMillis(100), () -> {
			Result<RunResult, CompileError> result = App.run(source, new int[] {});
			assertTrue(result.isOk(), "Compilation failed: " + (result.isErr() ? result.errValue() : ""));

			RunResult runResult = result.okValue();
			assertEquals(exitCode, runResult.returnValue());
			assertTrue(runResult.output().isEmpty());
		});
	}

	@Test
	void shouldRunWithAnInt() {
		assertValid("0", 0);
	}

	@Test
	void shouldRunWith100() {
		assertValid("100", 100);
	}

	@Test
	void shouldRunWith100U8() {
		assertValid("100U8", 100);
	}

	@Test
	void shouldRejectNegativeUnsignedLiteral() {
		assertInvalid("-100U8");
	}

	@Test
	void shouldRejectValueOutOfRange() {
		assertInvalid("256U8");
	}

	@Test
	void shouldAddTwoTypedLiterals() {
		assertValid("1U8 + 2U8", 3);
	}

	@Test
	void shouldReadInputValue() {
		assertValidWithInput("read U8", 100, 100);
	}

	private void assertInvalid(String source) {
		Assertions.assertTrue(App.compile(source).isErr());
	}
}
