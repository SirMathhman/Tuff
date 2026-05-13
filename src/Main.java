import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Main {
	private static final String PERIOD = Pattern.quote(".");
	private static final Map<String, List<String>> imports = new HashMap<String, List<String>>();

	public static void main(String[] args) {
		try {
			final var source = Paths.get(".", "src", "Main.java");
			Files.writeString(source.resolveSibling("Main.js"), compile(Files.readString(source)));
		} catch (IOException e) {
			//noinspection CallToPrintStackTrace
			e.printStackTrace();
		}
	}

	private static String compile(String input) throws IOException {
		final var collected = divide(input, Main::compileRootSegment);
		final var joinedImports = imports.entrySet().stream().map(entry -> {
			final var joinedValues = String.join(", ", entry.getValue());
			return "import { " + joinedValues + " } from \"" + entry.getKey() + "\";" + System.lineSeparator();
		}).collect(Collectors.joining());

		return joinedImports + collected + "Main().main()";
	}

	private static String divide(String input, Function<String, String> mapper) {
		final var segments = new ArrayList<String>();
		final var buffer = new StringBuilder();
		var depth = 0;
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);
			if (c == ';' && depth == 0) {
				segments.add(buffer.toString());
				buffer.setLength(0);
			} else if (c == '{') {
				depth++;
			} else if (c == '}') {
				depth--;
			}
		}
		segments.add(buffer.toString());

		return segments.stream().map(mapper).collect(Collectors.joining());
	}

	private static String compileRootSegment(String input) {
		final var stripped = input.strip();
		if (stripped.isEmpty()) {
			return "";
		}

		if (stripped.endsWith(";")) {
			final var substring = stripped.substring(0, stripped.length() - 1);
			if (substring.startsWith("import ")) {
				final var substring1 = substring.substring("import ".length());
				final var split = Arrays
						.stream(substring1.split(PERIOD))
						.map(String::strip)
						.filter(slice -> !slice.isEmpty())
						.collect(Collectors.toCollection(ArrayList::new));

				final var last = split.removeLast();
				split.addFirst(".");

				final var joined = String.join("/", split);
				if (!imports.containsKey(joined)) {
					imports.put(joined, new ArrayList<String>());
				}

				imports.get(joined).add(last);
				return "";
			}
		}

		if (stripped.endsWith("}")) {
			final var substring = stripped.substring(0, stripped.length() - 1);
			final var i = substring.indexOf("{");
			if (i >= 0) {
				final var substring1 = substring.substring(0, i);
				final var body = substring.substring(i + 1);
				final var i1 = substring1.indexOf("class");
				if (i1 >= 0) {
					final var substring3 = substring1.substring(i1 + "class".length());
					final var className = substring3.strip();
					return "function " + className + "(){" + divide(body, input1 -> {
						final var stripped1 = input1.strip();
						return System.lineSeparator() + "\t" + compileClassSegment(stripped1);
					}) + "}";
				}
			}
		}

		return wrap(stripped) + System.lineSeparator();
	}

	private static String compileClassSegment(String input) {
		if (input.endsWith(";")) {
			final var substring = input.substring(0, input.length() - 1);
			return compileClassStatement(substring) + ";";
		}

		return wrap(input);
	}

	private static String compileClassStatement(String input) {
		final var i = input.indexOf('=');
		if (i != 0) {
			final var substring = input.substring(0, i);
			final var substring1 = input.substring(i + 1);
			return compileDeclaration(substring) + " = " + wrap(substring1);
		}

		return wrap(input);
	}

	private static String compileDeclaration(String input) {
		final var stripped = input.strip();
		final var i = stripped.lastIndexOf(" ");
		if (i >= 0) {
			final var substring = stripped.substring(0, i);
			final var name = stripped.substring(i + 1);
			final var i1 = substring.lastIndexOf(" ");
			if (i1 > 0) {
				final var modifiers = Arrays
						.stream(substring.substring(0, i1).split(" "))
						.map(String::strip)
						.filter(slice -> !slice.isEmpty())
						.collect(Collectors.toCollection(ArrayList::new));

				modifiers.remove("private");
				modifiers.remove("static");

				final String type;
				if (modifiers.contains("final")) {
					type = "const";
					modifiers.remove("final");
				} else {
					type = "let";
				}

				final var substring2 = substring.substring(i1 + 1);
				return type + " " + name + " : " + compileType(substring2);
			}
		}

		return wrap(stripped);
	}

	private static String compileType(String input) {
		final var stripped = input.strip();
		if (stripped.endsWith("String")) {
			return "string";
		}
		return wrap(stripped);
	}

	private static String wrap(String input) {
		final var replaced = input.replace("/*", "start").replace("*/", "end");
		return "/*" + replaced + "*/";
	}
}
