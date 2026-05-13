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

	public static final String LINE_SEPARATOR = System.lineSeparator();
	public static final String PERIOD = Pattern.quote(".");
	public static final Map<String, List<String>> imports = new HashMap<String, List<String>>();

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
		final var segments = new ArrayList<String>();
		final var buffer = new StringBuilder();
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);
			if (c == ';') {
				segments.add(buffer.toString());
				buffer.setLength(0);
			}
		}

		final var collected = segments.stream().map(Main::compileRootSegment).collect(Collectors.joining());

		final var joinedImports = imports.entrySet().stream().map(entry -> {
			final var joinedValues = String.join(", ", entry.getValue());
			return "import { " + joinedValues + " } from \"" + entry.getKey() + "\";" + System.lineSeparator();
		}).collect(Collectors.joining());

		return joinedImports + collected;
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

		return wrap(stripped) + System.lineSeparator();
	}

	private static String wrap(String input) {
		final var replaced = input.replace("/*", "start").replace("*/", "end");
		return "/*" + replaced + "*/";
	}
}
