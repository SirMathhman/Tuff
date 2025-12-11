package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.stream.Collectors;

public class Main {
	public static void main(String[] args) {
		try {
			final var input = Files.readString(Paths.get(".", "src", "main", "java", "tuff", "Main.java"));
			final var target = Paths.get(".", "src", "main", "ts", "tuff", "Main.ts");
			final var targetDirectory = target.getParent();
			if (!Files.exists(targetDirectory)) {
				Files.createDirectories(targetDirectory);
			}
			Files.writeString(target, compile(input));
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	private static String compile(String input) {
		final var segments = new ArrayList<String>();
		var buffer = new StringBuilder();
		var depth = 0;
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);

			if (c == ';' && depth == 0) {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
			}
			if (c == '{') {
				depth++;
			}
			if (c == '}') {
				depth--;
			}
		}
		segments.add(buffer.toString());

		return segments
				.stream()
				.map(String::strip)
				.filter(slice -> !slice.isEmpty())
				.map(Main::compileRootSegment)
				.collect(Collectors.joining());
	}

	private static String compileRootSegment(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("package ")) {
			return "";
		}

		if (stripped.startsWith("import ")) {
			return "";
		}

		return compileRootSegmentValue(stripped) + System.lineSeparator();
	}

	private static String compileRootSegmentValue(String stripped) {
		final var i = stripped.indexOf("class ");
		if (i >= 0) {
			final var afterKeyword = stripped.substring(i + "class ".length());
			final var i1 = afterKeyword.indexOf("{");
			if (i1 >= 0) {
				final var name = afterKeyword.substring(0, i1);
				final var content = afterKeyword.substring(i1 + 1).strip();
				if (content.endsWith("}")) {
					return "class " + name + "{" + content + "}";
				}
			}
		}

		return stripped;
	}
}
