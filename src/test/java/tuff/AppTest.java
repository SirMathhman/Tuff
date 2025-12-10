package tuff;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class AppTest {
	@Test
	void test() {
		this.assertProgram("100", "100");
	}

	private void assertProgram(String tuffSource, String expectedStdOut) {
		try {
			final var cOutput = App.compile(tuffSource);
			// Write cOutput to a temporary file
			// Compile the temporary file using clang
			// Execute the temporary .exe
			// Collect the stdOut of the process
			// Compare with expectedStdOut
		} catch (CompileException e) {
			Assertions.fail(e);
		}
	}
}