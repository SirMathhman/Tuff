package tuff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class Main {
	private sealed interface Result<T, X> permits Err, Ok {}

	private sealed interface TuffDeclarationOrPlaceholder permits Placeholder, TuffDeclaration {}

	private @interface Actual {}

	private sealed interface TuffExpression extends TuffLValue permits WrappedExpression {}

	private sealed interface TuffLValue permits Placeholder, TuffDeclaration, TuffExpression {}

	private sealed interface Folder permits EscapedFolder, StatementFolder, ValueFolder {
		State apply(State state, Character character);
	}

	private record Err<T, X>(X error) implements Result<T, X> {}

	private record Ok<T, X>(T value) implements Result<T, X> {}

	private record TuffDeclaration(List<String> modifiers, String name, String type)
			implements TuffDeclarationOrPlaceholder, TuffLValue {}

	private record Placeholder(String input) implements TuffDeclarationOrPlaceholder, TuffLValue {}

	private record Tuple<Left, Right>(Left left, Right right) {}

	private record State(String input, int index, StringBuilder buffer, int depth, ArrayList<String> segments) {
		private Optional<Tuple<State, Character>> pop() {
			if (this.index < this.input.length()) {
				final var c = this.input.charAt(this.index);
				final var state = new State(this.input, this.index + 1, this.buffer, this.depth, this.segments);
				return Optional.of(new Tuple<State, Character>(state, c));
			}

			return Optional.empty();
		}

		private char peek() {
			return this.input.charAt(this.index);
		}

		private State append(char c) {
			this.buffer.append(c);
			return this;
		}

		private State advance() {
			this.segments.add(this.buffer.toString());
			return new State(this.input, this.index, new StringBuilder(), this.depth, this.segments);
		}

		private State exit() {
			return new State(this.input, this.index, this.buffer, this.depth - 1, this.segments);
		}

		private State enter() {
			return new State(this.input, this.index, this.buffer, this.depth + 1, this.segments);
		}

		private boolean isLevel() {
			return this.depth == 0;
		}

		private boolean isShallow() {
			return this.depth == 1;
		}

		public Stream<String> stream() {
			return this.segments.stream();
		}

		public Optional<State> popAndAppendToOption() {
			return this.pop().map((Tuple<State, Character> tuple) -> tuple.left.append(tuple.right));
		}

		public Optional<Tuple<State, Character>> popAndAppendToTuple() {
			return this.pop().map((Tuple<State, Character> tuple) -> {
				final var appended = tuple.left.append(tuple.right);
				return new Tuple<State, Character>(appended, tuple.right);
			});
		}
	}

	private record WrappedExpression(String value) implements TuffExpression {}

	private record EscapedFolder(Folder folder) implements Folder {
		private static State foldSingleEscapeChar(Tuple<State, Character> tuple) {
			if (tuple.right == '\\') {
				return tuple.left.popAndAppendToOption().orElse(tuple.left);
			} else {
				return tuple.left;
			}
		}

		@Override
		public State apply(State state, Character next) {
			if (next == '\'') {
				final var appended = state.append(next);
				return appended
						.popAndAppendToTuple()
						.map(EscapedFolder::foldSingleEscapeChar)
						.flatMap(State::popAndAppendToOption)
						.orElse(appended);
			}

			return this.folder.apply(state, next);
		}
	}

	private static final class StatementFolder implements Folder {
		@Override
		public State apply(State state, Character character) {
			final var appended = state.append(character);
			if (character == ';' && appended.isLevel()) {
				return appended.advance();
			}
			if (character == '}' && appended.isShallow()) {
				var appended1 = appended;
				final var peeked = appended.peek();
				if (peeked == ';') {
					appended1 = appended.popAndAppendToOption().orElse(appended);
				} else {
					appended1 = appended1.advance();
				}
				return appended1.exit();
			}
			if (character == '{' || character == '(') {
				return appended.enter();
			}
			if (character == '}' || character == ')') {
				return appended.exit();
			}
			return appended;
		}
	}

	private static final class ValueFolder implements Folder {
		@Override
		public State apply(State state, Character character) {
			if (character == ',' && state.isLevel()) {
				return state.advance();
			}

			final var appended = state.append(character);
			if (character == '-') {
				if (appended.peek() == '>') {
					final var state1 = appended.popAndAppendToOption();
					if (state1.isPresent()) {
						return state1.get();
					}
				}
			}

			if (character == '<' || character == '(') {
				return appended.enter();
			}
			if (character == '>' || character == ')') {
				return appended.exit();
			}
			return appended;
		}
	}

	private final Map<List<String>, List<String>> imports = new HashMap<List<String>, List<String>>();

	public static void main(String[] args) {
		new Main().run().ifPresent(Throwable::printStackTrace);
	}

	private Optional<IOException> run() {
		final var source = Paths.get(".", "src", "main", "java", "tuff", "Main.java");
		final var target = Paths.get(".", "src", "main", "tuff", "tuff", "Main.tuff");
		return switch (this.readString(source)) {
			case Err<String, IOException>(var error) -> Optional.of(error);
			case Ok<String, IOException>(var value) -> {
				final var output = this.compile(value);
				yield this.writeString(target, output);
			}
		};
	}

	@Actual
	private Optional<IOException> writeString(Path target, String output) {
		try {
			Files.writeString(target, output);
			return Optional.empty();
		} catch (IOException e) {
			return Optional.of(e);
		}
	}

	@Actual
	private Result<String, IOException> readString(Path source) {
		try {
			return new Ok<String, IOException>(Files.readString(source));
		} catch (IOException e) {
			return new Err<String, IOException>(e);
		}
	}

	private String compile(String input) {
		final var compiled = this.compileStatements(input, this::compileRootSegment);
		final var useStatements = this.imports.entrySet().stream().map((Entry<List<String>, List<String>> entry) -> {
			final var usedNamespace = String.join("::", entry.getKey());
			final var usedChildren = String.join(", ", entry.getValue());
			return "from " + usedNamespace + " use { " + usedChildren + " };" + System.lineSeparator();
		}).collect(Collectors.joining());

		return useStatements + compiled;
	}

	private String compileStatements(String input, Function<String, String> mapper) {
		return this.divideStatements(input).map(mapper).collect(Collectors.joining());
	}

	private Stream<String> divideStatements(String input) {
		return this.divide(input, new EscapedFolder(new StatementFolder()));
	}

	private Stream<String> divide(String input, Folder folder) {
		final var segments = new ArrayList<String>();
		var buffer = new StringBuilder();
		var depth = 0;
		var i = 0;
		return this.getStringStream(new State(input, i, buffer, depth, segments), folder);
	}

	private Stream<String> getStringStream(State state, Folder folder) {
		var current = state;
		while (true) {
			final var maybePopped = current.pop();
			if (maybePopped.isEmpty()) {
				break;
			}
			final var popped = maybePopped.get();
			current = folder.apply(popped.left, popped.right);
		}

		return current.advance().stream();
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

		return this.compileRootSegmentValue(stripped) + System.lineSeparator();
	}

	private String compileRootSegmentValue(String input) {
		return this.compileStructure("class", input, 0).orElseGet(() -> this.wrap(input));
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
						final var substring = withParameters.substring(i3 + 1);
						parameters = this.compileParameters(substring);
					}
				}

				final var substring1 = afterKeyword.substring(i1 + 1).strip();
				if (substring1.endsWith("}")) {
					final var body = substring1.substring(0, substring1.length() - 1);
					final var compiled =
							this.compileStatements(body, (String input1) -> this.compileStructureSegment(input1, indent + 1));
					final var generated = "class fn " + name + "(" + String.join(", ", parameters) + ") => {" + compiled +
																this.createIndent(indent) + "}";
					return Optional.of(generated);
				}
			}
		}

		return Optional.empty();
	}

	private List<String> compileParameters(String input) {
		return this
				.divideValues(input)
				.map(String::strip)
				.filter((String slice) -> !slice.isEmpty())
				.map(this::compileDefinitionOrPlaceholder)
				.toList();
	}

	private String createIndent(int indent) {
		return System.lineSeparator() + "\t".repeat(indent);
	}

	private String wrap(String input) {
		return "/**/" + input + "/**/";
	}

	private String compileStructureSegment(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.isEmpty()) {
			return "";
		}
		return this.createIndent(indent) + this.compileStructureSegmentValue(stripped, indent);
	}

	private String compileStructureSegmentValue(String input, int indent) {
		if (input.endsWith(";")) {
			final var slice = input.substring(0, input.length() - 1);
			return this.compileClassStatement(slice, indent) + ";";
		}

		final var i1 = input.indexOf("interface ");
		if (i1 >= 0) {
			final var modifiers = Arrays
					.stream(input.substring(0, i1).split(Pattern.quote(" ")))
					.map(String::strip)
					.filter((String slice) -> !slice.isEmpty())
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
									.filter((String segment) -> !segment.isEmpty())
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
								.filter((String slice) -> !slice.isEmpty())
								.map((String slice) -> slice + joinedTypeParameters)
								.collect(Collectors.joining(" | "));

						return "type " + name + joinedTypeParameters + " = " + variants + ";";
					}
				}
			}
		}

		final var maybeClass = this.compileStructure("class", input, indent);
		if (maybeClass.isPresent()) {
			return maybeClass.get();
		}

		final var maybeRecord = this.compileStructure("record", input, indent);
		if (maybeRecord.isPresent()) {
			return maybeRecord.get();
		}

		final var i = input.indexOf("(");
		if (i >= 0) {
			final var substring = input.substring(0, i);
			final var withParameters = input.substring(i + 1);
			final var i2 = withParameters.indexOf(")");
			if (i2 >= 0) {
				final var parameterString = withParameters.substring(0, i2);
				final var withBraces = withParameters.substring(i2 + 1).strip();
				final var declarationOrPlaceholder = this.parseDefinitionOrPlaceholderToTuff(substring);
				final var parameters = this.compileParameters(parameterString);

				if (declarationOrPlaceholder instanceof TuffDeclaration(var modifiers, var name, var type)) {
					if (withBraces.startsWith("{") && withBraces.endsWith("}")) {
						final var content = withBraces.substring(1, withBraces.length() - 1);
						final var joinedParameters = String.join(", ", parameters);

						final String outputContent;
						if (modifiers.contains("expect")) {
							outputContent = ";";
						} else {
							final var compiledContent = this.compileMethodStatements(content, indent);
							outputContent = " => {" + compiledContent + this.createIndent(indent) + "}";
						}

						return this.joinModifiers(modifiers) + "fn " + name + "(" + joinedParameters + ") : " + type +
									 outputContent;
					}
				}
			}
		}

		if (input.contains("@interface")) {
			return "";
		}

		return this.wrap(input);
	}

	private String compileMethodSegment(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.isEmpty()) {
			return "";
		}

		return this.createIndent(indent) + this.compileMethodSegmentValue(stripped, indent);
	}

	private String compileMethodSegmentValue(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.startsWith("yield ") && stripped.endsWith(";")) {
			final var substring = stripped.substring("yield ".length(), stripped.length() - 1);
			return this.compileExpressionOrPlaceholder(substring, indent);
		}

		final var maybeIf = this.compileConditional(indent, stripped, "if");
		if (maybeIf.isPresent()) {
			return maybeIf.get();
		}

		final var maybeWhile = this.compileConditional(indent, stripped, "while");
		if (maybeWhile.isPresent()) {
			return maybeWhile.get();
		}

		if (stripped.endsWith(";")) {
			final var slice = stripped.substring(0, stripped.length() - 1);
			final var maybeInitialization = this.compileMethodStatementValue(slice, indent);
			if (maybeInitialization.isPresent()) {
				return maybeInitialization.get() + ";";
			}
		}

		if (stripped.startsWith("else")) {
			final var slice = stripped.substring(4).strip();
			if (slice.startsWith("{") && slice.endsWith("}")) {
				final var substring = slice.substring(1, slice.length() - 1);
				return "else {" + this.compileMethodStatements(substring, indent) + this.createIndent(indent) + "}";
			}
		}

		return this.wrap(stripped);
	}

	private Optional<String> compileConditional(int indent, String input, String type) {
		if (input.startsWith(type)) {
			final var substring = input.substring(type.length()).strip();
			if (substring.startsWith("(")) {
				final var substring1 = substring.substring(1);
				final var i = this.findExprEnd(substring1);

				if (i >= 0) {
					final var substring2 = substring1.substring(0, i);
					final var withBraces = substring1.substring(i + 1).strip();
					final var condition = this.compileExpressionOrPlaceholder(substring2, indent);
					if (withBraces.startsWith("{") && withBraces.endsWith("}")) {
						final var content = withBraces.substring(1, withBraces.length() - 1);
						return Optional.of(type + " (" + condition + ") {" + this.compileMethodStatements(content, indent) +
															 this.createIndent(indent) + "}");
					}
				}
			}
		}

		return Optional.empty();
	}

	private int findExprEnd(String input) {
		var i = -1;
		var depth = 0;
		for (var i1 = 0; i1 < input.length(); i1++) {
			final var c = input.charAt(i1);
			if (c == '(') {
				depth++;
			}
			if (c == ')') {
				if (depth == 0) {
					i = i1;
					break;
				}
				depth--;
			}
		}
		return i;
	}

	private Optional<String> compileMethodStatementValue(String input, int indent) {
		if (input.equals("break") || input.equals("continue")) {
			return Optional.of(input);
		}

		if (input.startsWith("return ")) {
			final var substring = input.substring("return ".length());
			return Optional.of("return " + this.compileExpressionOrPlaceholder(substring, indent));
		}

		final var maybeInitialization = this.compileInitialization(input, indent);
		if (maybeInitialization.isPresent()) {
			return maybeInitialization;
		}

		return this.compileInvokable(input, indent);
	}

	private String compileClassStatement(String input, int indent) {
		return this.compileInitialization(input, indent).orElseGet(() -> this.compileDefinitionOrPlaceholder(input));
	}

	private Optional<String> compileInitialization(String input, int indent) {
		final var i = input.indexOf("=");
		if (i >= 0) {
			final var substring = input.substring(0, i);
			final var substring1 = input.substring(i + 1);
			final var string = this
					.parseDefinitionToTuff(substring)
					.<TuffLValue>map((TuffDeclaration value) -> value)
					.or(() -> this.parseExpression(substring, 0).<TuffLValue>map((TuffExpression value) -> value))
					.orElseGet(() -> new Placeholder(substring));

			return Optional.of(
					this.generateAssignable(string) + " = " + this.compileExpressionOrPlaceholder(substring1, indent));
		}

		return Optional.empty();
	}

	private String generateAssignable(TuffLValue value) {
		return switch (value) {
			case Placeholder placeholder -> this.wrap(placeholder.input);
			case TuffDeclaration tuffDeclaration -> "let " + this.generateDefinitionOrPlaceholder(tuffDeclaration);
			case TuffExpression tuffExpression -> this.generateExpression(tuffExpression);
		};
	}

	private String compileExpressionOrPlaceholder(String input, int indent) {
		return this.compileExpression(input, indent).orElseGet(() -> this.wrap(input.strip()));
	}

	private Optional<String> compileExpression(String input, int indent) {
		return this.parseExpression(input, indent).map(this::generateExpression);
	}

	private String generateExpression(TuffExpression expr) {
		return switch (expr) {
			case WrappedExpression(var value) -> value;
		};
	}

	private Optional<TuffExpression> parseExpression(String input, int indent) {
		return this.compileExpression0(input, indent).map(WrappedExpression::new);
	}

	private Optional<String> compileExpression0(String input, int indent) {
		final var i = input.indexOf("->");
		if (i >= 0) {
			final var beforeArrow = input.substring(0, i).strip();
			final var maybeWithBraces = input.substring(i + 2).strip();
			if (beforeArrow.startsWith("(") && beforeArrow.endsWith(")")) {
				final var substring = beforeArrow.substring(1, beforeArrow.length() - 1);
				final var compiled = this.compileDefinitionOrPlaceholder(substring);
				final String compiled1;
				if (maybeWithBraces.startsWith("{") && maybeWithBraces.endsWith("}")) {
					final var body = maybeWithBraces.substring(1, maybeWithBraces.length() - 1);
					compiled1 = "{" + this.compileMethodStatements(body, indent) + this.createIndent(indent) + "}";
				} else {
					compiled1 = this.compileExpressionOrPlaceholder(maybeWithBraces, indent);
				}

				return Optional.of("(" + compiled + ")" + " => " + compiled1);
			}
		}

		return this
				.compileInvokable(input, indent)
				.or(() -> this.compileString(input))
				.or(() -> this.compileSwitch(input, indent))
				.or(() -> this.compileAccess(input, indent, "."))
				.or(() -> this.compileOperation(indent, input, "<"))
				.or(() -> this.compileOperation(indent, input, "+"))
				.or(() -> this.compileOperation(indent, input, "-"))
				.or(() -> this.compileOperation(indent, input, "=="))
				.or(() -> this.compileOperation(indent, input, "&&"))
				.or(() -> this.compileAccess(input, indent, "::"))
				.or(() -> this.compileIdentifier(input))
				.or(() -> this.compileNumber(input))
				.or(() -> this.compileChar(input));
	}

	private Optional<String> compileChar(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("'") && stripped.endsWith("'")) {
			return Optional.of(stripped);
		} else {
			return Optional.empty();
		}
	}

	private Optional<String> compileAccess(String input, int indent, String separator) {
		return this.compileAccess(input, separator, (String input1) -> this.compileAccessInstance(indent, input1));
	}

	private String compileAccessInstance(int indent, String input) {
		return Main.this.compileType(input).orElseGet(() -> this.compileExpressionOrPlaceholder(input, indent));
	}

	private Optional<String> compileNumber(String input) {
		final var stripped = input.strip();
		if (this.isNumber(stripped)) {
			return Optional.of(stripped);
		}

		return Optional.empty();
	}

	private boolean isNumber(String input) {
		for (var i = 0; i < input.length(); i++) {
			final var c = input.charAt(i);
			if (Character.isDigit(c)) {
				continue;
			}
			return false;
		}
		return true;
	}

	private Optional<String> compileOperation(int indent, String input, String operator) {
		final var i1 = input.indexOf(operator);
		if (i1 >= 0) {
			final var substring = input.substring(0, i1);
			final var substring1 = input.substring(i1 + operator.length());
			return Optional.of(this.compileExpressionOrPlaceholder(substring, indent) + " " + operator + " " +
												 this.compileExpressionOrPlaceholder(substring1, indent));
		} else {
			return Optional.empty();
		}
	}

	private Optional<String> compileSwitch(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.startsWith("switch")) {
			final var substring = stripped.substring("switch".length()).strip();
			if (substring.startsWith("(")) {
				final var withExpr = substring.substring(1);
				final var i = this.findExprEnd(withExpr);

				if (i >= 0) {
					final var substring1 = withExpr.substring(0, i);
					final var withBraces = withExpr.substring(i + 1).strip();
					final var expr = this.compileExpressionOrPlaceholder(substring1, indent);
					if (withBraces.startsWith("{") && withBraces.endsWith("}")) {
						final var content = withBraces.substring(1, withBraces.length() - 1);
						final var collect = this
								.divideStatements(content)
								.map(String::strip)
								.filter((String slice) -> !slice.isEmpty())
								.map((String input1) -> this.compileCase(input1, indent + 1))
								.map((String slice) -> this.createIndent(indent + 1) + slice)
								.collect(Collectors.joining());

						return Optional.of("match (" + expr + ") {" + collect + this.createIndent(indent) + "}");
					}
				}
			}
		}

		return Optional.empty();
	}

	private String compileCase(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.startsWith("case ")) {
			final var substring = stripped.substring("case ".length());
			final var i = substring.indexOf("->");
			if (i >= 0) {
				final var substring1 = substring.substring(0, i);
				final var substring2 = substring.substring(i + "->".length());
				return this.compileDestructuring(substring1) + " => " + this.compileCaseValue(substring2, indent);
			}
		}

		return this.wrap(stripped);
	}

	private String compileDestructuring(String input) {
		// I'm lazy to do this properly.
		return input.replace("var ", "").strip();
	}

	private String compileCaseValue(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.endsWith(";")) {
			final var substring = stripped.substring(0, stripped.length() - 1);
			return this.compileExpressionOrPlaceholder(substring, indent) + ";";
		}

		if (stripped.startsWith("{") && stripped.endsWith("}")) {
			final var substring = stripped.substring(1, stripped.length() - 1);
			final var compiled = this.compileMethodStatements(substring, indent);
			return "{" + compiled + this.createIndent(indent) + "}";
		}

		return this.wrap(stripped);
	}

	private String compileMethodStatements(String input, int indent) {
		return this.compileStatements(input, (String segment) -> this.compileMethodSegment(segment, indent + 1));
	}

	private Optional<String> compileString(String input) {
		final var stripped = input.strip();
		if (stripped.startsWith("\"") && stripped.endsWith("\"")) {
			return Optional.of(stripped);
		} else {
			return Optional.empty();
		}
	}

	private Optional<String> compileIdentifier(String input) {
		final var stripped = input.strip();
		if (this.isIdentifier(stripped)) {
			return Optional.of(stripped);
		} else {
			return Optional.empty();
		}
	}

	private Optional<String> compileAccess(String input, String separator, Function<String, String> mapper) {
		final var i = input.lastIndexOf(separator);
		if (i >= 0) {
			final var substring = input.substring(0, i);
			final var memberName = input.substring(i + separator.length()).strip();
			if (this.isIdentifier(memberName)) {
				return Optional.of(mapper.apply(substring) + separator + memberName);
			}
		}

		return Optional.empty();
	}

	private Optional<String> compileInvokable(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.endsWith(")")) {
			final var withoutEnd = stripped.substring(0, stripped.length() - 1);

			var i = -1;
			var depth = 0;
			for (var i1 = 0; i1 < withoutEnd.length(); i1++) {
				final var c = withoutEnd.charAt(i1);
				if (c == '(') {
					if (depth == 0) {
						i = i1;
					}
					depth++;
				}
				if (c == ')') {
					depth--;
				}
			}

			if (i >= 0) {
				final var caller = withoutEnd.substring(0, i);
				final var arguments = withoutEnd.substring(i + 1);
				final var joinedArguments = this
						.divideValues(arguments)
						.map(String::strip)
						.filter((String slice) -> !slice.isEmpty())
						.map((String input1) -> this.compileExpressionOrPlaceholder(input1, indent))
						.collect(Collectors.joining(", "));

				return Optional.of(this.compileCaller(caller, indent) + "(" + joinedArguments + ")");
			}
		}

		return Optional.empty();
	}

	private Stream<String> divideValues(String input) {
		return this.divide(input, new EscapedFolder(new ValueFolder()));
	}

	private String compileCaller(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.startsWith("new ")) {
			final var substring = stripped.substring("new ".length());
			final var maybeType = this.compileType(substring);
			if (maybeType.isPresent()) {
				return maybeType.get();
			}
		}

		final var maybeExpression = this.compileExpression(input, indent);
		if (maybeExpression.isPresent()) {
			return maybeExpression.get();
		}

		if (stripped.startsWith("new ")) {
			final var substring = stripped.substring("new ".length());
			return this.compileTypeOrPlaceholder(substring);
		}

		return this.wrap(stripped);
	}

	private String compileDefinitionOrPlaceholder(String input) {
		return this.generateDefinitionOrPlaceholder(this.parseDefinitionOrPlaceholderToTuff(input));
	}

	private String generateDefinitionOrPlaceholder(TuffDeclarationOrPlaceholder string) {
		return switch (string) {
			case TuffDeclaration(var modifiers, var name, var type) -> {
				if (type.equals("var")) {
					yield name;
				}

				final var joinedModifiers = this.joinModifiers(modifiers);
				yield joinedModifiers + name + " : " + type;
			}
			case Placeholder placeholder -> this.wrap(placeholder.input);
		};
	}

	private String joinModifiers(List<String> modifiers) {
		return modifiers.stream().map((String modifier) -> modifier + " ").collect(Collectors.joining());
	}

	private TuffDeclarationOrPlaceholder parseDefinitionOrPlaceholderToTuff(String input) {
		return this
				.parseDefinitionToTuff(input)
				.<TuffDeclarationOrPlaceholder>map((TuffDeclaration value) -> value)
				.orElseGet(() -> new Placeholder(input));
	}

	private Optional<TuffDeclaration> parseDefinitionToTuff(String input) {
		final var stripped = input.strip();
		final var i = stripped.lastIndexOf(" ");
		if (i >= 0) {
			final var beforeName = stripped.substring(0, i);
			final var name = stripped.substring(i + 1);
			final var i1 = this.findTypeSeparator(beforeName);
			if (i1 < 0) {
				final var compiled = this.compileTypeOrPlaceholder(beforeName);
				return Optional.of(new TuffDeclaration(new ArrayList<String>(), name, compiled));
			}

			final var beforeType = beforeName.substring(0, i1);
			final var i2 = beforeType.lastIndexOf("\n");
			List<String> annotations = new ArrayList<String>();
			if (i2 >= 0) {
				final var substring = beforeType.substring(0, i2);
				annotations = Arrays
						.stream(substring.split(Pattern.quote(" ")))
						.map(String::strip)
						.filter((String slice) -> !slice.isEmpty())
						.map((String slice) -> slice.substring(1))
						.toList();
			}

			final var type = beforeName.substring(i1 + 1);
			final var compiled = this.compileTypeOrPlaceholder(type);
			final List<String> modifiers;
			if (annotations.contains("Actual")) {
				modifiers = List.of("expect");
			} else {
				modifiers = Collections.emptyList();
			}

			return Optional.of(new TuffDeclaration(modifiers, name, compiled));

		}

		return Optional.empty();
	}

	private String compileTypeOrPlaceholder(String input) {
		return this.compileType(input).orElseGet(() -> this.wrap(input));
	}

	private Optional<String> compileType(String input) {
		final var stripped = input.strip();
		final var maybePrimitiveType = this.compilePrimitiveType(stripped);
		if (maybePrimitiveType.isPresent()) {
			return maybePrimitiveType;
		}

		final var i = stripped.indexOf("<");
		if (i >= 0) {
			final var base = stripped.substring(0, i);
			final var substring1 = stripped.substring(i + 1).strip();
			if (substring1.endsWith(">")) {
				final var args = substring1.substring(0, substring1.length() - 1);
				final var joinedTypeArguments =
						this.divideValues(args).map(this::compileTypeOrPlaceholder).collect(Collectors.joining(", "));

				return Optional.of(base + "<" + joinedTypeArguments + ">");
			}
		}

		if (this.isIdentifier(stripped)) {
			return Optional.of(stripped);
		}

		if (stripped.endsWith("[]")) {
			final var substring = stripped.substring(0, stripped.length() - 2);
			return Optional.of("*[" + substring + "]");
		}

		return Optional.empty();
	}

	private Optional<String> compilePrimitiveType(String stripped) {
		switch (stripped) {
			case "char", "Character" -> {
				return Optional.of("U16");
			}
			case "int" -> {
				return Optional.of("I32");
			}
			case "void" -> {
				return Optional.of("Void");
			}
		}

		return Optional.empty();
	}

	private boolean isIdentifier(String input) {
		final var stripped = input.strip();
		for (var i = 0; i < stripped.length(); i++) {
			final var c = stripped.charAt(i);
			if (Character.isLetter(c) || (i != 0 && Character.isDigit(c))) {continue;}
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
