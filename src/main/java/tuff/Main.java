package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.function.Function;
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
		return compileStatements(input, Main::compileRootSegment);
	}

	private static String compileStatements(String input, Function<String, String> mapper) {
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
			if (c == '}' && depth == 1) {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
				depth--;
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
				.map(mapper)
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
				final var withEnd = afterKeyword.substring(i1 + 1).strip();
				if (withEnd.endsWith("}")) {
					final var content = withEnd.substring(0, withEnd.length() - 1);
					return "class " + name + "{" + compileStatements(content, Main::compileClassSegment) +
								 System.lineSeparator() + "}";
				}
			}
		}

		return stripped;
	}

	private static String compileClassSegment(String input) {
		final var stripped = input.strip();
		return System.lineSeparator() + "\t" + compileMethodSegmentValue(stripped);
	}

	private static String compileMethodSegmentValue(String input) {
		final var i = input.indexOf("(");
		if (i >= 0) {
			final var definition = input.substring(0, i).strip();
			final var i1 = definition.lastIndexOf(" ");
			if (i1 >= 0) {
				final var name = definition.substring(i1 + 1);
				final var paramsAndBody = input.substring(i + 1);
				final var i2 = paramsAndBody.indexOf(")");
				if (i2 >= 0) {
					final var params = paramsAndBody.substring(0, i2).strip();
					final var outputParam = compileDefinition(params);
					final var body = paramsAndBody.substring(i2 + 1).strip();
					if (body.startsWith("{") && body.endsWith("}")) {
						final var content = body.substring(1, body.length() - 1);
						return name + "(" + outputParam + ") {" + compileStatements(content, Main::compileMethodSegment) + "}";
					}
				}
			}
		}

		return wrap(input);
	}

	private static String compileMethodSegment(String input) {
		return generateIndent(2) + input.strip();
	}

	private static String generateIndent(int indent) {
		return System.lineSeparator() + "\t".repeat(indent);
	}

	private static String compileDefinition(String params) {
		final String outputParam;
		final var i3 = params.lastIndexOf(" ");
		if (i3 >= 0) {
			final var paramType = params.substring(0, i3);
			final var paramName = params.substring(i3 + 1);
			outputParam = paramName + " : " + paramType;
		} else {
			outputParam = "";
		}
		return outputParam;
	}

	private static String wrap(String input) {
		return "/*" + input + "*/";
	}
}
