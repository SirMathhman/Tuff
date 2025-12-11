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
		var buffer = new StringBuffer();
		var depth = 0;
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);

			if (c == ';' && depth == 0) {
				segments.add(buffer.toString());
				buffer = new StringBuffer();
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

		return stripped + System.lineSeparator();
	}
}
