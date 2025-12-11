package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class Main {
	public static void main(String[] args) {
		try {
			run(Paths.get(".", "src", "main", "java", "tuff", "Main.java"),
					Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff"));

			run(Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff"),
					Paths.get(".", "src", "main", "java", "tuff", "Main0.java"));
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	private static void run(Path source, Path target) throws IOException {
		final var input = Files.readString(source);
		final var targetDirectory = target.getParent();
		if (!Files.exists(targetDirectory)) {
			Files.createDirectories(targetDirectory);
		}

		Files.writeString(target, input);
	}
}
