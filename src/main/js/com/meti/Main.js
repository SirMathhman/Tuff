/*package com.meti;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

start*
 *
 end
public class Main {
	start*
	 *
	 * @param args
	 end
	public static void main(String[] args) {
		try {
			final var rootDirectory = Paths.get("./src/main");
			final var javaPath = rootDirectory.resolve("./java/com/meti/Main.java");
			final var input = Files.readString(javaPath);

			final var jsPath = rootDirectory.resolve("./js/com/meti/Main.js");
			final var parent = jsPath.getParent();
			if (!Files.exists(parent)) {
				Files.createDirectories(parent);
			}

			Files.writeString(jsPath, compile(input));
		} catch (IOException e) {
			//noinspection CallToPrintStackTrace
			e.printStackTrace();
		}
	}

	private static String compile(String input) {
		final var stripped = input.strip();
		return "start" + stripped.replace("start", "start").replace("end", "end") + "end";
	}
}*/