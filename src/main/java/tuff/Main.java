package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public class Main {
	private sealed interface Result<T, X> permits Err, Ok {}

	private record Err<T, X>(X error) implements Result<T, X> {}

	private record Ok<T, X>(T value) implements Result<T, X> {}

	private final Map<List<String>, List<String>> imports = new HashMap<List<String>, List<String>>();

	public static void main(String[] args) {
		new Main().run().ifPresent(Throwable::printStackTrace);
	}

	private Optional<IOException> run() {
		final var source = Paths.get(".", "src", "main", "java", "tuff", "Main.java");
		final var target = Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff");
		return switch (this.readString(source)) {
			case Err<String, IOException> v -> Optional.of(v.error);
			case Ok<String, IOException> v -> {
				final var output = this.compile(v.value);
				yield this.writeString(target, output);
			}
		};
	}

	private Optional<IOException> writeString(Path target, String output) {
		try {
			Files.writeString(target, output);
			return Optional.empty();
		} catch (IOException e) {
			return Optional.of(e);
		}
	}

	private Result<String, IOException> readString(Path source) {
		try {
			return new Ok<String, IOException>(Files.readString(source));
		} catch (IOException e) {
			return new Err<String, IOException>(e);
		}
	}

	private String compile(String input) {
		final var compiled = this.compileStatements(input, this::compileRootSegment);
		final var useStatements = this.imports.entrySet().stream().map(entry -> {
			final var usedNamespace = String.join("::", entry.getKey());
			final var usedChildren = String.join(", ", entry.getValue());
			return "from " + usedNamespace + " use { " + usedChildren + " };" + System.lineSeparator();
		}).collect(Collectors.joining());

		return useStatements + compiled;
	}

	private String compileStatements(String input, Function<String, String> mapper) {
		final var segments = new ArrayList<String>();
		var buffer = new StringBuilder();
		var depth = 0;
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			buffer.append(c);
			if (c == ';' && depth == 0) {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
				continue;
			}
			if (c == '}' && depth == 1) {
				segments.add(buffer.toString());
				buffer = new StringBuilder();
				depth--;
				continue;
			}
			if (c == '{') {
				depth++;
			}
			if (c == '}') {
				depth--;
			}
		}

		segments.add(buffer.toString());
		return segments.stream().map(mapper).collect(Collectors.joining());
	}

	private String compileRootSegment(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("package ")) {
			return "";
		}

		if (stripped.startsWith("import ") && stripped.endsWith(";")) {
			final var slice = stripped.substring("import ".length(), stripped.length() - 1);
			final var copy = Arrays.asList(slice.split(Pattern.quote(".")));
			final var namespace = copy.subList(0, copy.size() - 1);

			if (!this.imports.containsKey(namespace)) {
				this.imports.put(namespace, new ArrayList<String>());
			}

			this.imports.get(namespace).add(copy.getLast());
			return "";
		}

		return this.compileRootSegmentValue(stripped, 0) + System.lineSeparator();
	}

	private String compileRootSegmentValue(String input, int indent) {
		return this.compileStructure("class", input, indent).orElseGet(() -> this.wrap(input));
	}

	private Optional<String> compileStructure(String type, String input, int indent) {
		final var i = input.indexOf(type + " ");
		if (i >= 0) {
			final var afterKeyword = input.substring(i + (type + " ").length());
			final var i1 = afterKeyword.indexOf("{");
			if (i1 >= 0) {
				var name = afterKeyword.substring(0, i1).strip();
				final var i2 = name.indexOf("implements ");
				if (i2 >= 0) {
					name = name.substring(0, i2).strip();
				}

				List<String> parameters = new ArrayList<String>();
				if (name.endsWith(")")) {
					final var withParameters = name.substring(0, name.length() - 1).strip();
					final var i3 = withParameters.indexOf("(");
					if (i3 >= 0) {
						name = withParameters.substring(0, i3).strip();
						parameters = Arrays
								.stream(withParameters.substring(i3 + 1).split(Pattern.quote(",")))
								.map(String::strip)
								.filter(slice -> !slice.isEmpty())
								.map(this::compileDefinition)
								.toList();
					}
				}

				final var substring1 = afterKeyword.substring(i1 + 1).strip();
				if (substring1.endsWith("}")) {
					final var body = substring1.substring(0, substring1.length() - 1);
					final var compiled = this.compileStatements(body, input1 -> this.compileClassSegment(input1, indent + 1));
					final var generated = "class fn " + name + "(" + String.join(", ", parameters) + ") => {" + compiled +
																this.createIndent(indent) + "}";
					return Optional.of(generated);
				}
			}
		}

		return Optional.empty();
	}

	private String createIndent(int indent) {
		return System.lineSeparator() + "\t".repeat(indent);
	}

	private String wrap(String input) {
		return "/*Raw*/" + input;
	}

	private String compileClassSegment(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.isEmpty()) {
			return "";
		}
		return System.lineSeparator() + "\t" + this.compileClassSegmentValue(stripped, indent);
	}

	private String compileClassSegmentValue(String input, int indent) {
		if (input.endsWith(";")) {
			final var slice = input.substring(0, input.length() - 1);
			return this.compileClassStatement(slice) + ";";
		}

		final var i1 = input.indexOf("interface ");
		if (i1 >= 0) {
			final var modifiers = Arrays
					.stream(input.substring(0, i1).split(Pattern.quote(" ")))
					.map(String::strip)
					.filter(slice -> !slice.isEmpty())
					.toList();

			final var afterKeyword = input.substring(i1 + "interface ".length());
			if (modifiers.contains("sealed")) {
				final var i = afterKeyword.indexOf("permits ");
				if (i >= 0) {
					var name = afterKeyword.substring(0, i).strip();
					List<String> typeParameters = new ArrayList<String>();
					if (name.endsWith(">")) {
						final var slice = name.substring(0, name.length() - 1);
						final var i2 = slice.indexOf("<");
						if (i2 >= 0) {
							name = slice.substring(0, i2);
							typeParameters = Arrays
									.stream(slice.substring(i2 + 1).split(Pattern.quote(",")))
									.map(String::strip)
									.filter(segment -> !segment.isEmpty())
									.toList();
						}
					}

					final var stripped = afterKeyword.substring(i + "permits ".length()).strip();
					final String joinedTypeParameters;
					if (typeParameters.isEmpty()) {
						joinedTypeParameters = "";
					} else {
						joinedTypeParameters = "<" + String.join(", ", typeParameters) + ">";
					}

					final var i2 = stripped.indexOf("{");
					if (i2 >= 0) {
						final var variants = Arrays
								.stream(stripped.substring(0, i2).split(Pattern.quote(",")))
								.map(String::strip)
								.filter(slice -> !slice.isEmpty())
								.map(slice -> slice + joinedTypeParameters)
								.collect(Collectors.joining(" | "));

						return "type " + name + joinedTypeParameters + " = " + variants + ";";
					}
				}
			}
		}

		return this.compileStructure("record", input, indent).orElseGet(() -> this.wrap(input));

	}

	private String compileClassStatement(String input) {
		final var i = input.indexOf("=");
		if (i >= 0) {
			final var substring = input.substring(0, i);
			final var substring1 = input.substring(i + 1);
			return "let " + this.compileDefinition(substring) + " = " + this.compileExpression(substring1);
		}

		return this.wrap(input);
	}

	private String compileExpression(String input) {
		final var stripped = input.strip();
		if (stripped.endsWith(")")) {
			final var substring = stripped.substring(0, stripped.length() - 1);
			final var i = substring.indexOf("(");
			if (i >= 0) {
				final var caller = substring.substring(0, i);
				final var arguments = substring.substring(i + 1);
				final var joinedArguments = Arrays
						.stream(arguments.split(Pattern.quote(",")))
						.map(String::strip)
						.filter(slice -> !slice.isEmpty())
						.map(this::compileExpression)
						.collect(Collectors.joining());

				return this.compileCaller(caller) + "(" + joinedArguments + ")";
			}
		}

		return this.wrap(stripped);
	}

	private String compileCaller(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("new ")) {
			final var substring = stripped.substring("new ".length());
			return this.compileType(substring);
		}

		return this.wrap(stripped);
	}

	private String compileDefinition(String input) {
		final var stripped = input.strip();
		final var i = stripped.lastIndexOf(" ");
		if (i >= 0) {
			final var beforeName = stripped.substring(0, i);
			final var name = stripped.substring(i + 1);
			final var i1 = this.findTypeSeparator(beforeName);
			if (i1 >= 0) {
				final var type = beforeName.substring(i1 + 1);
				return name + " : " + this.compileType(type);
			} else {
				return name + " : " + this.compileType(beforeName);
			}
		}

		return this.wrap(stripped);
	}

	private String compileType(String input) {
		final var stripped = input.strip();
		final var i = stripped.indexOf("<");
		if (i >= 0) {
			final var base = stripped.substring(0, i);
			final var substring1 = stripped.substring(i + 1).strip();
			if (substring1.endsWith(">")) {
				final var args = substring1.substring(0, substring1.length() - 1);
				final var joinedTypeArguments =
						Arrays.stream(args.split(Pattern.quote(","))).map(this::compileType).collect(Collectors.joining(", "));

				return base + "<" + joinedTypeArguments + ">";
			}
		}

		if (this.isIdentifier(stripped)) {
			return stripped;
		}

		return this.wrap(stripped);
	}

	private boolean isIdentifier(String input) {
		final var stripped = input.strip();
		for (var i = 0; i < stripped.length(); i++) {
			final var c = stripped.charAt(i);
			if (Character.isLetter(c)) {continue;}
			return false;
		}
		return true;
	}

	private int findTypeSeparator(String beforeName) {
		var i1 = -1;
		var depth = 0;
		for (var i2 = 0; i2 < beforeName.length(); i2++) {
			final var c = beforeName.charAt(i2);
			if (c == ' ' && depth == 0) {
				i1 = i2;
			}
			if (c == '<') {
				depth++;
			}
			if (c == '>') {
				depth--;
			}
		}
		return i1;
	}
}
