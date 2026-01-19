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
			RunResult result = App.run(source, new int[] {});
			assertEquals(exitCode, result.returnValue());
			assertTrue(result.output().isEmpty());
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
}
