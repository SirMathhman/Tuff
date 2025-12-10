package tuff;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;

class AppTest {
	@Test
	void test() {
		this.assertProgram("100", "100");
	}

	private void assertProgram(String tuffSource, String expectedStdOut) {
		try {
			final var cOutput = App.compile(tuffSource);

			// Write cOutput to a temporary file
			final var tempCFile = Files.createTempFile("tuff_test_", ".c");
			Files.writeString(tempCFile, cOutput);

			// Compile the temporary file using clang
			final var tempExeFile = Files.createTempFile("tuff_test_", ".exe");
			final var compileProcess = new ProcessBuilder("clang", tempCFile.toString(), "-o", tempExeFile.toString())
					.redirectErrorStream(true)
					.start();
			final var compileExitCode = compileProcess.waitFor();
			if (compileExitCode != 0) {
				final var compileOutput = new String(compileProcess.getInputStream().readAllBytes());
				Assertions.fail("Failed to compile C code: " + compileOutput);
			}

			// Execute the temporary .exe
			final var runProcess = new ProcessBuilder(tempExeFile.toString()).redirectErrorStream(true).start();
			runProcess.waitFor();

			// Collect the stdOut of the process
			final var actualStdOut = new String(runProcess.getInputStream().readAllBytes()).trim();

			// Compare with expectedStdOut
			Assertions.assertEquals(expectedStdOut, actualStdOut);

			// Cleanup
			Files.deleteIfExists(tempCFile);
			Files.deleteIfExists(tempExeFile);
		} catch (CompileException e) {
			Assertions.fail(e);
		} catch (Exception e) {
			Assertions.fail("Unexpected error: " + e.getMessage(), e);
		}
	}
}