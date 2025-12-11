package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.function.Function;

public class Main {
	public static void main(String[] args) {
		try {
			final var target = Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff");
			run(Paths.get(".", "src", "main", "java", "tuff", "Main.java"), target, Main::compile);
			run(target, Paths.get(".", "src", "main", "java", "tuff", "Main0.java"), Main::getReplace);
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	private static String getReplace(String input) {
		return input
				.replace("Main0", "Wah")
				.replace("Main", "Main0")
				.replace("Wah", "Main0");
	}

	private static void run(Path source, Path target, Function<String, String> compiler) throws IOException {
		final var input = Files.readString(source);
		final var targetDirectory = target.getParent();
		if (!Files.exists(targetDirectory)) {
			Files.createDirectories(targetDirectory);
		}

		Files.writeString(target, compiler.apply(input));
	}

	private static String compile(String input) {
		return input;
	}
}
