package io.github.sirmathhman.tuff;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public final class AppTest {
	@Test
	void shouldRunTheSimplestProgramPossible() {
		assertSimple("", 0);
	}

	private void assertSimple(String source, int exitCode) {
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
		assertSimple("0", 0);
	}

	@Test
	void shouldRunWith100() {
		assertSimple("100", 100);
	}

	@Test
	void shouldRunWith100U8() {
		assertSimple("100U8", 100);
	}

	@Test
	void shouldRejectNegativeUnsignedLiteral() {
		Assertions.assertTrue(App.compile("-100U8").isErr());
	}
}
