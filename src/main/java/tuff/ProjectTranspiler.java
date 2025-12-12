package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

/**
 * Transpiles a tree of Java source files to a parallel tree of .tuff files.
 *
 * Important: this does NOT merge modules; each input file produces one output file.
 */
public final class ProjectTranspiler {
	public void transpileTree(Path javaRoot, Path tuffOutRoot) throws IOException {
		try (Stream<Path> paths = Files.walk(javaRoot)) {
			paths
					.filter(Files::isRegularFile)
					.filter(p -> p.getFileName().toString().endsWith(".java"))
					.forEach(p -> {
						try {
							transpileOne(javaRoot, tuffOutRoot, p);
						} catch (IOException e) {
							throw new RuntimeException(e);
						}
					});
		} catch (RuntimeException ex) {
			if (ex.getCause() instanceof IOException io) {
				throw io;
			}
			throw ex;
		}
	}

	private void transpileOne(Path javaRoot, Path tuffOutRoot, Path javaFile) throws IOException {
		Path rel = javaRoot.relativize(javaFile);
		String fileName = rel.getFileName().toString();
		String base = fileName.substring(0, fileName.length() - ".java".length());
		Path outRel = rel.getParent() == null ? Path.of(base + ".tuff") : rel.getParent().resolve(base + ".tuff");
		Path outFile = tuffOutRoot.resolve(outRel);

		Files.createDirectories(outFile.getParent());
		String javaSource = Files.readString(javaFile);
		String tuffSource = new Transpiler().transpile(javaSource);
		Files.writeString(outFile, tuffSource);
	}
}
