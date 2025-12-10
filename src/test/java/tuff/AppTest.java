package tuff;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;

class AppTest {
	@Test
	void test() {
		this.assertProgram("100", "100");
		this.assertProgram("100U8", "100");
		this.assertProgram("1U8 + 2U8", "3");
	}

	@Test
	void signedAndUnsignedBoundaries() {
		// U8
		this.assertProgram("0U8", "0");
		this.assertProgram("255U8", "255");
		this.assertProgramError("256U8");

		// I8
		this.assertProgram("-128I8", "-128");
		this.assertProgram("127I8", "127");
		this.assertProgramError("128I8");

		// U16
		this.assertProgram("65535U16", "65535");
		this.assertProgramError("65536U16");

		// I16
		this.assertProgram("-32768I16", "-32768");
		this.assertProgram("32767I16", "32767");
		this.assertProgramError("32768I16");

		// U32
		this.assertProgram("4294967295U32", "4294967295");
		this.assertProgramError("4294967296U32");

		// I32
		this.assertProgram("-2147483648I32", "-2147483648");
		this.assertProgram("2147483647I32", "2147483647");
		this.assertProgramError("2147483648I32");

		// U64 (boundary)
		this.assertProgram("18446744073709551615U64", "18446744073709551615");
		this.assertProgramError("18446744073709551616U64");

		// I64 (boundary)
		this.assertProgram("-9223372036854775808I64", "-9223372036854775808");
		this.assertProgram("9223372036854775807I64", "9223372036854775807");
		this.assertProgramError("9223372036854775808I64");
	}

	@Test
	void negativeUnsignedShouldThrow() {
		this.assertProgramError("-100U8");
	}

	@Test
	void overflowUnsignedShouldThrow() {
		this.assertProgramError("256U8");
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

	private void assertProgramError(String tuffSource) {
		Assertions.assertThrows(TransformException.class, () -> App.compile(tuffSource));
	}
}