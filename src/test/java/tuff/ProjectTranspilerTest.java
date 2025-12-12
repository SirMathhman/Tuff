package tuff;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

public class ProjectTranspilerTest {
	@Test
	void transpilesMultipleFilesWithoutMerging(@TempDir Path dir) throws Exception {
		Path javaRoot = dir.resolve("java");
		Path outRoot = dir.resolve("tuff");

		Path selfJava = javaRoot.resolve(Path.of("root", "parent", "Self.java"));
		Path cousinJava = javaRoot.resolve(Path.of("root", "nibling", "Cousin.java"));
		Files.createDirectories(selfJava.getParent());
		Files.createDirectories(cousinJava.getParent());

		Files.writeString(cousinJava, "package root.nibling;\n" +
				"class Cousin { int x = 0; int getSomeValue() { return 100; } }\n");

		Files.writeString(selfJava, "package root.parent;\n" +
				"import root.nibling.Cousin;\n" +
				"class Self { int x = 0; int f() { return 0; } }\n");

		new ProjectTranspiler().transpileTree(javaRoot, outRoot);

		Path selfTuff = outRoot.resolve(Path.of("root", "parent", "Self.tuff"));
		Path cousinTuff = outRoot.resolve(Path.of("root", "nibling", "Cousin.tuff"));

		assertTrue(Files.exists(selfTuff), "expected Self.tuff to be generated");
		assertTrue(Files.exists(cousinTuff), "expected Cousin.tuff to be generated");
	}
}
