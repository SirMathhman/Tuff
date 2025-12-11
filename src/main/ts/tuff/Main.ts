package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

public class Main {
	public static void main(String[] args) {
		try {
			final var input = Files.readString(Paths.get(".", "src", "main", "java", "tuff", "Main.java"));
			final var target = Paths.get(".", "src", "main", "ts", "tuff", "Main.ts");
			final var targetDirectory = target.getParent();
			if (!Files.exists(targetDirectory)) {
				Files.createDirectories(targetDirectory);
			}
			Files.writeString(target, input);
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}
}
