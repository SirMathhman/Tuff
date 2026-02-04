/*package com.meti;*//*

import java.io.IOException;*//*
import java.nio.file.Files;*//*
import java.nio.file.Paths;*//*
import java.util.ArrayList;*//*
import java.util.stream.Collectors;*//*

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

		final var segments = new ArrayList<String>();
		var buffer = new StringBuilder();
		var depth = 0;
		for (var i = 0; i < stripped.length(); i++) {
			final var c = stripped.charAt(i);
			buffer.append(c);
			if (c == ';' && depth == 0) {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
			} else {
				if (c == '{') {
					depth++;
				}
				if (c == '}') {
					depth--;
				}
			}
		}

		segments.add(buffer.toString());

		return segments.stream().map(Main::wrap).collect(Collectors.joining());
	}

	private static String wrap(String stripped) {
		final var replaced = stripped.replace("start", "start").replace("end", "end");
		return "start" + replaced + "end";
	}
}*/