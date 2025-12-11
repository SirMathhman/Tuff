package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Main {
	private static final Map<List<String>, List<String>> imports = new HashMap<List<String>, List<String>>();

	public static void main(String[] args) {
		try {
			final var input = Files.readString(Paths.get(".", "src", "main", "java", "tuff", "Main.java"));
			Files.writeString(Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff"), compile(input));
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	private static String compile(String input) {
		final var compiled = compileStatements(input);
		final var useStatements = imports.entrySet().stream().map(entry -> {
			final var usedNamespace = String.join("::", entry.getKey());
			final var usedChildren = String.join(", ", entry.getValue());
			return "from " + usedNamespace + " use { " + usedChildren + " };" + System.lineSeparator();
		}).collect(Collectors.joining());

		return useStatements + compiled;
	}

	private static String compileStatements(String input) {
		final var segments = new ArrayList<String>();
		var buffer = new StringBuilder();
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);
			if (c == ';') {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
			}
		}

		segments.add(buffer.toString());
		return segments.stream().map(Main::compileRootSegment).collect(Collectors.joining());
	}

	private static String compileRootSegment(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("package ")) {
			return "";
		}

		if (stripped.startsWith("import ") && stripped.endsWith(";")) {
			final var slice = stripped.substring("import ".length(), stripped.length() - 1);
			final var copy = Arrays.asList(slice.split(Pattern.quote(".")));
			final var namespace = copy.subList(0, copy.size() - 1);

			if (!imports.containsKey(namespace)) {
				imports.put(namespace, new ArrayList<String>());
			}

			imports.get(namespace).add(copy.getLast());
			return "";
		}

		return "/*Raw*/" + stripped + System.lineSeparator();
	}
}
