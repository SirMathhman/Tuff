package io.github.sirmathhman.tuff;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;

import static org.junit.jupiter.api.Assertions.*;

public class AppTest {

	@Test
	void shouldRunTheSimplestProgramPossible() {
		RunResult result = App.run("", new int[] {});
		assertEquals(0, result.returnValue());
		assertTrue(result.output().isEmpty());
	}

	@Test
	void shouldRunWithAnInt() {
		RunResult result = App.run("0", new int[] { 0 });
		assertEquals(0, result.returnValue());
		assertTrue(result.output().isEmpty());
	}

	@Test
	void shouldTimeoutToProveTimeoutsWork() {
		// Demonstrates a timeout in a way that *can* be preempted safely (thread
		// interrupt).
		// If you used `while(true){}` here, the timeout thread can't stop it unless the
		// loop cooperates.
		CountDownLatch latch = new CountDownLatch(1);

		AssertionError err = assertThrows(AssertionError.class,
				() -> assertTimeoutPreemptively(Duration.ofMillis(50), () -> {
					latch.await();
				}));

		assertNotNull(err.getMessage());
	}
}
