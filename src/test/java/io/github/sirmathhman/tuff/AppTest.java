package io.github.sirmathhman.tuff;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import io.github.sirmathhman.tuff.vm.Instruction;

public final class AppTest {
	@Test
	void shouldRunTheSimplestProgramPossible() {
		assertValid("", 0);
	}

	private void assertValidWithInput(String source, int exitCode, int... input) {
		Assertions.assertTimeoutPreemptively(Duration.ofMillis(100), () -> {
			Result<RunResult, ApplicationError> result = App.run(source, input);
			assertValidResult(result, exitCode);
		});
	}

	private void assertValid(String source, int exitCode) {
		assertValidWithInput(source, exitCode);
	}

	private void assertValidResult(Result<RunResult, ApplicationError> result, int exitCode) {
		assertTrue(result.isOk(), "Compilation failed: " + (result.isErr() ? result.errValue().display() : ""));

		RunResult runResult = result.okValue();
		assertEquals(exitCode, runResult.returnValue(), "Unexpected exit code, instructions compiled are: " +
				Instruction.displayAll(runResult.executedInstructions()));
		assertTrue(runResult.output().isEmpty());
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

	@Test
	void shouldReadAndAddWithLiteral() {
		assertValidWithInput("read U8 + 50U8", 150, 100);
	}

	@Test
	void shouldAddTwoReadValues() {
		assertValidWithInput("read U8 + read U8", 150, 100, 50);
	}

	@Test
	void shouldAddThreeReadValues() {
		assertValidWithInput("read U8 + read U8 + read U8", 9, 2, 3, 4);
	}

	@Test
	void shouldSubtractReadValue() {
		assertValidWithInput("read U8 + read U8 - read U8", 1, 2, 3, 4);
	}

	@Test
	void shouldMultiplyReadValues() {
		assertValidWithInput("read U8 * read U8 + read U8", 10, 2, 3, 4);
	}

	@Test
	void shouldRespectPrecedenceAddBeforeMultiply() {
		assertValidWithInput("read U8 + read U8 * read U8", 14, 2, 3, 4);
	}

	private void assertInvalid(String source) {
		Result<Instruction[], CompileError> result = App.compile(source);
		if (result.isOk()) {
			Assertions.fail("Expected compilation to fail, but it succeeded and produced instructions: "
					+ Instruction.displayAll(result.okValue()));
		}
	}
}
