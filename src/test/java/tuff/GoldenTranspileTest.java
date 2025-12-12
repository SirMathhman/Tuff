package tuff;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class GoldenTranspileTest {
	@Test
	void transpilesSampleJavaToExpectedTuff() throws Exception {
		Path javaSourcePath = Path.of("src", "test", "resources", "golden", "Sample.java");
		Path expectedTuffPath = Path.of("src", "test", "resources", "golden", "Sample.tuff");

		String javaSource = Files.readString(javaSourcePath);
		String expected = Files.readString(expectedTuffPath);
		String actual = new Transpiler().transpile(javaSource);

		assertEquals(normalize(expected), normalize(actual));
	}

	private static String normalize(String s) {
		String normalized = s.replace("\r\n", "\n");
		if (!normalized.endsWith("\n")) {
			normalized += "\n";
		}
		return normalized;
	}
}
