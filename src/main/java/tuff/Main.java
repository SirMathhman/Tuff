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
import java.util.Map.Entry;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class Main {
	private sealed interface Result<T, X> permits Err, Ok {}

	private sealed interface TuffDeclarationOrPlaceholder permits Placeholder, TuffDeclaration {}

	private @interface Actual {}

	private sealed interface TuffExpression extends TuffLValue permits WrappedExpression {}

	private sealed interface TuffLValue permits Placeholder, TuffDeclaration, TuffExpression {}

	private sealed interface Folder permits EscapedFolder, ExprEndFolder, OperationFolder, StatementFolder, ValueFolder {
		State apply(State state, Character character);
	}

	private record Err<T, X>(X error) implements Result<T, X> {}

	private record Ok<T, X>(T value) implements Result<T, X> {}

	private record TuffDeclaration(List<String> modifiers, String name, String type, boolean isMutable)
			implements TuffDeclarationOrPlaceholder, TuffLValue {}

	private record Placeholder(String input) implements TuffDeclarationOrPlaceholder, TuffLValue {}

	private record Tuple2<A, B>(A a, B b) {}

	private record Tuple3<A, B, C>(A a, B b, C c) {}

	private record State(String input, int index, StringBuilder buffer, int depth, ArrayList<String> segments) {
		private Optional<Tuple2<State, Character>> pop() {
			if (this.index < this.input.length()) {
				final var c = this.input.charAt(this.index);
				final var state = new State(this.input, this.index + 1, this.buffer, this.depth, this.segments);
				return Optional.of(new Tuple2<State, Character>(state, c));
			}

			return Optional.empty();
		}

		private State append(char c) {
			return new State(this.input, this.index, this.buffer.append(c), this.depth, this.segments);
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
			return this.pop().map((Tuple2<State, Character> tuple) -> tuple.a.append(tuple.b));
		}

		public Optional<Tuple2<State, Character>> popAndAppendToTuple() {
			return this.pop().map((Tuple2<State, Character> tuple) -> {
				final var appended = tuple.a.append(tuple.b);
				return new Tuple2<State, Character>(appended, tuple.b);
			});
		}

		public boolean startsWith(String slice) {
			if (slice.length() > this.input.length()) {
				return false;
			}

			final var min = Math.min(this.index + slice.length(), this.input.length());
			final var window = this.input.substring(this.index, min);
			return window.equals(slice);
		}
	}

	private record WrappedExpression(String value) implements TuffExpression {}

	private record EscapedFolder(Folder folder) implements Folder {
		private static State foldSingleEscapeChar(Tuple2<State, Character> tuple) {
			if (tuple.b == '\\') {
				return tuple.a.popAndAppendToOption().orElse(tuple.a);
			} else {
				return tuple.a;
			}
		}

		@Override
		public State apply(State state, Character next) {
			return this.foldQuotes(state, next).orElseGet(() -> this.folder.apply(state, next));
		}

		private Optional<State> foldQuotes(State state, Character next) {
			if (next != '\'' && next != '\"') {
				return Optional.empty();
			}

			final var appended = state.append(next);
			if (next == '\"') {
				final var value = this.foldDoubleQuotes(appended);
				return Optional.of(value);
			}

			return Optional.of(this.foldSingleQuotes(appended));
		}

		private State foldSingleQuotes(State appended) {
			return appended
					.popAndAppendToTuple()
					.map(EscapedFolder::foldSingleEscapeChar)
					.flatMap(State::popAndAppendToOption)
					.orElse(appended);
		}

		private State foldDoubleQuotes(State appended) {
			var current = new Tuple2<Boolean, State>(true, appended);
			while (current.a) {
				current = this.foldInDoubleQuote(current.b);
			}
			return current.b;
		}

		private Tuple2<Boolean, State> foldInDoubleQuote(State state) {
			final var maybeTuple = state.popAndAppendToTuple();
			if (maybeTuple.isEmpty()) {
				return new Tuple2<Boolean, State>(false, state);
			}

			final var tuple = maybeTuple.get();
			var appended = tuple.a;

			final var withinQuotes = tuple.b;
			if (withinQuotes == '\\') {
				appended = appended.popAndAppendToOption().orElse(appended);
			}
			if (withinQuotes == '\"') {
				return new Tuple2<Boolean, State>(false, appended);
			}

			return new Tuple2<Boolean, State>(true, appended);
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
				final var appended1 = this.foldTrailingSemicolon(appended);
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

		private State foldTrailingSemicolon(State state) {
			if (state.startsWith(";")) {
				return state.popAndAppendToOption().orElse(state);
			}
			return state.advance();
		}
	}

	private static final class ValueFolder implements Folder {
		@Override
		public State apply(State state, Character character) {
			if (character == ',' && state.isLevel()) {
				return state.advance();
			}

			final var appended = state.append(character);
			final var maybeArrow = this.foldArrow(appended, character);
			if (maybeArrow.isPresent()) {
				return maybeArrow.get();
			}

			if (character == '<' || character == '(') {
				return appended.enter();
			}
			if (character == '>' || character == ')') {
				return appended.exit();
			}
			return appended;
		}

		private Optional<State> foldArrow(State state, char character) {
			if (character != '-') {return Optional.empty();}
			if (!state.startsWith(">")) {return Optional.empty();}
			return state.popAndAppendToOption();
		}
	}

	private static final class ExprEndFolder implements Folder {
		@Override
		public State apply(State state, Character c) {
			final var appended = state.append(c);
			if (c == '(') {
				return appended.enter();
			}
			if (c == ')') {
				return foldClosingParentheses(appended);
			}
			return appended;
		}
	}

	private record OperationFolder(String operator) implements Folder {
		@Override
		public State apply(State state, Character next) {
			final var appended = state.append(next);
			if (appended.startsWith(this.operator) && state.isLevel()) {
				return this.foldOverOperator(appended);
			}

			if (next == '(') {
				return appended.enter();
			}

			if (next == ')') {
				return appended.exit();
			}

			return appended;
		}

		private State foldOverOperator(State appended) {
			var current = appended;
			var i = 0;
			while (i < this.operator.length()) {
				current = current.popAndAppendToOption().orElse(current);
				i++;
			}

			return current.advance();
		}
	}

	private final Map<List<String>, List<String>> imports = new HashMap<List<String>, List<String>>();

	private static State foldClosingParentheses(State appended) {
		if (appended.isLevel()) {
			return appended.advance().exit();
		}
		return appended.exit();
	}

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
			current = folder.apply(popped.a, popped.b);
		}

		return current.advance().stream();
	}

	private String compileRootSegment(String input) {
		final var stripped = input.strip();
		if (stripped.isEmpty()) {
			return "";
		}

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
		if (i < 0) {return Optional.empty();}
		final var afterKeyword = input.substring(i + (type + " ").length());
		final var i1 = afterKeyword.indexOf("{");
		if (i1 < 0) {return Optional.empty();}
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

		List<String> typeParameters = new ArrayList<String>();
		if (name.endsWith(">")) {
			final var stripped = name.substring(0, name.length() - 1).strip();
			final var i3 = stripped.indexOf("<");
			if (i3 >= 0) {
				name = stripped.substring(0, i3).strip();
				typeParameters = Arrays
						.stream(stripped.substring(i3 + 1).split(Pattern.quote(",")))
						.map(String::strip)
						.filter((String slice) -> !slice.isEmpty())
						.toList();
			}
		}

		final var substring1 = afterKeyword.substring(i1 + 1).strip();
		if (substring1.endsWith("}")) {
			final var body = substring1.substring(0, substring1.length() - 1);
			if (this.isIdentifier(name)) {
				final var compiled =
						this.compileStatements(body, (String input1) -> this.compileStructureSegment(input1, indent + 1));

				final var joinedTypeParameters = this.joinTypeParameters(typeParameters);
				final var generated =
						"class fn " + name + joinedTypeParameters + "(" + String.join(", ", parameters) + ") => {" + compiled +
						this.createIndent(indent) + "}";

				return Optional.of(generated);
			}
		}

		return Optional.empty();
	}

	private String joinTypeParameters(List<String> typeParameters) {
		final String joinedTypeParameters;
		if (typeParameters.isEmpty()) {
			joinedTypeParameters = "";
		} else {
			joinedTypeParameters = "<" + String.join(", ", typeParameters) + ">";
		}
		return joinedTypeParameters;
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

		final var maybeInterface = this.compileSealedInterface(input);
		if (maybeInterface.isPresent()) {
			return maybeInterface.get();
		}

		final var maybeClass = this.compileStructure("class", input, indent);
		if (maybeClass.isPresent()) {
			return maybeClass.get();
		}

		final var maybeRecord = this.compileStructure("record", input, indent);
		if (maybeRecord.isPresent()) {
			return maybeRecord.get();
		}

		final var modifiers = this.compileMethod(input, indent);
		if (modifiers.isPresent()) {
			return modifiers.get();
		}

		if (input.contains("@interface")) {
			return "";
		}

		return this.wrap(input);
	}

	private Optional<String> compileSealedInterface(String input) {
		final var i1 = input.indexOf("interface ");
		if (i1 < 0) {return Optional.empty();}
		final var modifiers = Arrays
				.stream(input.substring(0, i1).split(Pattern.quote(" ")))
				.map(String::strip)
				.filter((String slice) -> !slice.isEmpty())
				.toList();

		final var afterKeyword = input.substring(i1 + "interface ".length());
		if (!modifiers.contains("sealed")) {
			return Optional.empty();
		}

		final var i = afterKeyword.indexOf("permits ");
		if (i < 0) {return Optional.empty();}
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

			return Optional.of("type " + name + joinedTypeParameters + " = " + variants + ";");
		}

		return Optional.empty();
	}

	private Optional<String> compileMethod(String input, int indent) {
		final var i = input.indexOf("(");
		if (i < 0) {return Optional.empty();}

		final var substring = input.substring(0, i);
		final var withParameters = input.substring(i + 1);
		final var i2 = withParameters.indexOf(")");
		if (i2 < 0) {return Optional.empty();}

		final var parameterString = withParameters.substring(0, i2);
		final var withBraces = withParameters.substring(i2 + 1).strip();
		final var declarationOrPlaceholder = this.parseDefinitionOrPlaceholderToTuff(substring);
		final var parameters = this.compileParameters(parameterString);

		if (!(declarationOrPlaceholder instanceof TuffDeclaration(var modifiers, var name, var type, boolean isMutable))) {
			return Optional.empty();
		}

		if (!withBraces.startsWith("{") || !withBraces.endsWith("}")) {return Optional.empty();}
		final var content = withBraces.substring(1, withBraces.length() - 1);
		final var joinedParameters = String.join(", ", parameters);

		final String outputContent;
		if (modifiers.contains("expect")) {
			outputContent = ";";
		} else {
			final var compiledContent = this.compileMethodStatements(content, indent);
			outputContent = " => {" + compiledContent + this.createIndent(indent) + "}";
		}

		return Optional.of(
				this.joinModifiers(modifiers) + "fn " + name + "(" + joinedParameters + ") : " + type + outputContent);
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

			final var maybeDefinition = this.parseDefinitionToTuff(slice);
			if (maybeDefinition.isPresent()) {
				return this.generateDefinitionOrPlaceholder(maybeDefinition.get());
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
		if (!input.startsWith(type)) {return Optional.empty();}
		final var substring = input.substring(type.length()).strip();
		if (!substring.startsWith("(")) {return Optional.empty();}
		final var substring1 = substring.substring(1);
		final var divisions = this.findExprEnd(substring1);

		if (divisions.size() < 2) {return Optional.empty();}
		final var conditionStringWithSuffix = divisions.getFirst().strip();
		final var withBraces = String.join("", divisions.subList(1, divisions.size())).strip();
		if (!conditionStringWithSuffix.endsWith(")")) {return Optional.empty();}
		final var conditionString = conditionStringWithSuffix.substring(0, conditionStringWithSuffix.length() - 1);
		final var condition = this.compileExpressionOrPlaceholder(conditionString, indent);
		if (!withBraces.startsWith("{") || !withBraces.endsWith("}")) {return Optional.empty();}
		final var content = withBraces.substring(1, withBraces.length() - 1);
		return Optional.of(
				type + " (" + condition + ") {" + this.compileMethodStatements(content, indent) + this.createIndent(indent) +
				"}");

	}

	private List<String> findExprEnd(String input) {
		return this.divide(input, new EscapedFolder(new ExprEndFolder())).toList();
	}

	private Optional<String> compileMethodStatementValue(String input, int indent) {
		if (input.equals("break") || input.equals("continue")) {
			return Optional.of(input);
		}

		if (input.startsWith("return ")) {
			final var substring = input.substring("return ".length());
			return Optional.of("return " + this.compileExpressionOrPlaceholder(substring, indent));
		}

		final var maybePostIncrement = this.compilePost(input, indent, "++");
		if (maybePostIncrement.isPresent()) {
			return maybePostIncrement;
		}

		final var maybePostDecrement = this.compilePost(input, indent, "--");
		if (maybePostDecrement.isPresent()) {
			return maybePostDecrement;
		}

		final var maybeInitialization = this.compileInitialization(input, indent);
		if (maybeInitialization.isPresent()) {
			return maybeInitialization;
		}

		return this.compileInvokable(input, indent);
	}

	private Optional<String> compilePost(String input, int indent, String operator) {
		if (input.endsWith(operator)) {
			final var substring = input.substring(0, input.length() - 2);
			return Optional.of(this.compileExpressionOrPlaceholder(substring, indent) + operator);
		}

		return Optional.empty();
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
		final var maybeLambda = this.compileLambda(input, indent);
		if (maybeLambda.isPresent()) {
			return maybeLambda;
		}

		final var stripped = input.strip();
		if (stripped.startsWith("!")) {
			final var substring = stripped.substring(1);
			return Optional.of("!" + this.compileExpressionOrPlaceholder(substring, indent));
		}

		final var maybeInstanceOf = this.compileInstanceOf(input, indent);
		if (maybeInstanceOf.isPresent()) {
			return maybeInstanceOf;
		}

		return this
				.compileInvokable(input, indent)
				.or(() -> this.compileString(input))
				.or(() -> this.compileSwitch(input, indent))
				.or(() -> this.compileOperation(indent, input, "<"))
				.or(() -> this.compileOperation(indent, input, ">="))
				.or(() -> this.compileOperation(indent, input, ">"))
				.or(() -> this.compileOperation(indent, input, "+"))
				.or(() -> this.compileOperation(indent, input, "-"))
				.or(() -> this.compileOperation(indent, input, "&&"))
				.or(() -> this.compileOperation(indent, input, "||"))
				.or(() -> this.compileOperation(indent, input, "=="))
				.or(() -> this.compileOperation(indent, input, "!="))
				.or(() -> this.compileAccess(input, indent, "."))
				.or(() -> this.compileAccess(input, indent, "::"))
				.or(() -> this.compileIdentifier(input))
				.or(() -> this.compileNumber(input))
				.or(() -> this.compileChar(input));
	}

	private Optional<String> compileLambda(String input, int indent) {
		final var i = input.indexOf("->");
		if (i < 0) {return Optional.empty();}
		final var beforeArrow = input.substring(0, i).strip();
		final var maybeWithBraces = input.substring(i + 2).strip();
		if (!beforeArrow.startsWith("(") || !beforeArrow.endsWith(")")) {return Optional.empty();}
		final var substring = beforeArrow.substring(1, beforeArrow.length() - 1);
		final var compiled = String.join(", ", this.compileParameters(substring));
		final String compiled1;
		if (maybeWithBraces.startsWith("{") && maybeWithBraces.endsWith("}")) {
			final var body = maybeWithBraces.substring(1, maybeWithBraces.length() - 1);
			compiled1 = "{" + this.compileMethodStatements(body, indent) + this.createIndent(indent) + "}";
		} else {
			compiled1 = this.compileExpressionOrPlaceholder(maybeWithBraces, indent);
		}

		return Optional.of("(" + compiled + ")" + " => " + compiled1);
	}

	private Optional<String> compileInstanceOf(String input, int indent) {
		final var divisions = this.divide(input, new EscapedFolder(new OperationFolder("instanceof"))).toList();

		if (divisions.size() < 2) {return Optional.empty();}
		final var first = divisions.getFirst();
		final var substring = first.substring(0, first.length() - "instanceof".length());
		final var substring1 = String.join("", divisions.subList(1, divisions.size()));

		if (!substring1.endsWith(")")) {return Optional.empty();}
		final var substring2 = substring1.substring(0, substring1.length() - 1);
		final var i2 = substring2.indexOf("(");
		if (i2 < 0) {return Optional.empty();}
		final var substring3 = substring2.substring(0, i2).strip();
		final var substring4 = substring2.substring(i2 + 1);

		final var parameters = this
				.divideValues(substring4)
				.map(String::strip)
				.filter((String slice) -> !slice.isEmpty())
				.map(this::parseDefinitionOrPlaceholderToTuff)
				.map(this::retainDefinition)
				.flatMap(Optional::stream)
				.toList();

		final var joinedNames =
				parameters.stream().map((TuffDeclaration declaration) -> declaration.name).collect(Collectors.joining(", "));

		return Optional.of(
				this.compileExpressionOrPlaceholder(substring, indent) + " is " + substring3 + " { " + joinedNames + " }");
	}

	private Optional<TuffDeclaration> retainDefinition(TuffDeclarationOrPlaceholder node) {
		return switch (node) {
			case Placeholder _ -> Optional.empty();
			case TuffDeclaration tuffDeclaration -> Optional.of(tuffDeclaration);
		};
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
		final String stripped;
		if (input.startsWith("-")) {
			stripped = input.substring(1);
		} else {
			stripped = input;
		}

		return this.streamString(stripped).allMatch(Character::isDigit);
	}

	private Stream<Character> streamString(String value) {
		return IntStream.range(0, value.length()).mapToObj(value::charAt);
	}

	private Optional<String> compileOperation(int indent, String input, String operator) {
		final var divisions = this.divide(input, new EscapedFolder(new OperationFolder(operator))).toList();

		if (divisions.size() >= 2) {
			final var first = divisions.getFirst();
			final var left = first.substring(0, first.length() - operator.length());
			final var elements = divisions.subList(1, divisions.size());
			final var right = String.join("", elements);
			final var leftResult = this.compileExpressionOrPlaceholder(left, indent);
			final var rightResult = this.compileExpressionOrPlaceholder(right, indent);
			return Optional.of(leftResult + " " + operator + " " + rightResult);
		} else {
			return Optional.empty();
		}
	}

	private Optional<String> compileSwitch(String input, int indent) {
		final var stripped = input.strip();
		if (!stripped.startsWith("switch")) {return Optional.empty();}
		final var substring = stripped.substring("switch".length()).strip();
		if (!substring.startsWith("(")) {return Optional.empty();}
		final var withExpr = substring.substring(1);
		final var divisions = this.findExprEnd(withExpr);

		if (divisions.size() < 2) {return Optional.empty();}
		final var exprWithSuffix = divisions.getFirst();
		final var withBraces = String.join("", divisions.subList(1, divisions.size())).strip();

		if (!exprWithSuffix.endsWith(")")) {return Optional.empty();}
		final var expr = exprWithSuffix.substring(0, exprWithSuffix.length() - 1);
		final var compiledExpr = this.compileExpressionOrPlaceholder(expr, indent);
		if (!withBraces.startsWith("{") || !withBraces.endsWith("}")) {return Optional.empty();}
		final var content = withBraces.substring(1, withBraces.length() - 1);
		final var collect = this.compileCases(indent, content);
		return Optional.of("match (" + compiledExpr + ") {" + collect + this.createIndent(indent) + "}");
	}

	private String compileCases(int indent, String content) {
		return this
				.divideStatements(content)
				.map(String::strip)
				.filter((String slice) -> !slice.isEmpty())
				.map((String input1) -> this.compileCase(input1, indent + 1))
				.map((String slice) -> this.createIndent(indent + 1) + slice)
				.collect(Collectors.joining());
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

		if (stripped.startsWith("default")) {
			final var i = stripped.indexOf("->");
			if (i >= 0) {
				final var substring2 = stripped.substring(i + "->".length());
				return "default => " + this.compileCaseValue(substring2, indent);
			}
		}

		return this.wrap(stripped);
	}

	private String compileDestructuring(String input) {
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
		if (i < 0) {return Optional.empty();}
		final var substring = input.substring(0, i);
		var memberName = input.substring(i + separator.length()).strip();
		if (memberName.startsWith("<")) {
			final var substring1 = memberName.substring(1);
			final var i1 = substring1.indexOf(">");
			if (i1 >= 0) {
				memberName = substring1.substring(i1 + 1).strip();
			}
		}

		if (this.isIdentifier(memberName)) {
			return Optional.of(mapper.apply(substring) + separator + memberName);
		}

		return Optional.empty();
	}

	private Optional<String> compileInvokable(String input, int indent) {
		final var stripped = input.strip();
		if (stripped.endsWith(")")) {
			final var withoutEnd = stripped.substring(0, stripped.length() - 1);

			final var i = this.findInvokableStart(withoutEnd);

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

	private int findInvokableStart(String withoutEnd) {
		var current = new Tuple3<Integer, Integer, Integer>(-1, 0, 0);
		while (current.b < withoutEnd.length()) {
			current = this.fold(withoutEnd, current);
		}
		return current.a;
	}

	private Tuple3<Integer, Integer, Integer> fold(String withoutEnd, Tuple3<Integer, Integer, Integer> current) {
		var indexToReturn = current.a;
		var indexCurrent = current.b;
		var depth = current.c;

		final var c = withoutEnd.charAt(indexCurrent);
		final var next = indexCurrent + 1;
		if (c == '(') {
			if (depth == 0) {
				indexToReturn = indexCurrent;
			}
			depth++;
		}
		if (c == ')') {
			depth--;
		}

		return new Tuple3<Integer, Integer, Integer>(indexToReturn, next, depth);
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
			case TuffDeclaration(var modifiers, var name, var type, var isMutable) ->
					this.generateDefinition(modifiers, name, type, isMutable);
			case Placeholder placeholder -> this.wrap(placeholder.input);
		};
	}

	private String generateDefinition(List<String> modifiers, String name, String type, boolean isMutable) {

		final String mutableString;
		if (isMutable) {
			mutableString = "mut ";
		} else {
			mutableString = "";
		}

		final var joinedModifiers = this.joinModifiers(modifiers);
		if (type.equals("var")) {
			return joinedModifiers + mutableString + name;
		}

		return joinedModifiers + mutableString + name + " : " + type;
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
				return Optional.of(new TuffDeclaration(new ArrayList<String>(), name, compiled, true));
			}

			var beforeType = beforeName.substring(0, i1);
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
				beforeType = beforeType.substring(i2 + 1).strip();
			}

			final var oldModifiers =
					Arrays.stream(beforeType.split(" ")).map(String::strip).filter((String slice) -> !slice.isEmpty()).toList();

			final var type = beforeName.substring(i1 + 1);
			final var compiled = this.compileTypeOrPlaceholder(type);

			final List<String> newModifiers = new ArrayList<String>();
			if (annotations.contains("Actual")) {
				newModifiers.add("expect");
			}

			final var isMutable = !oldModifiers.contains("final");
			return Optional.of(new TuffDeclaration(newModifiers, name, compiled, isMutable));
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
		return switch (stripped) {
			case "char", "Character" -> Optional.of("U16");
			case "int" -> Optional.of("I32");
			case "void" -> Optional.of("Void");
			default -> Optional.empty();
		};
	}

	private boolean isIdentifier(String input) {
		final var stripped = input.strip();
		return IntStream.range(0, stripped.length()).allMatch((int index) -> {
			final var c = stripped.charAt(index);
			return Character.isLetter(c) || (index != 0 && Character.isDigit(c));
		});
	}

	private int findTypeSeparator(String beforeName) {
		var i1 = -1;
		var depth = 0;
		var i2 = 0;
		while (i2 < beforeName.length()) {
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
			i2++;
		}
		return i1;
	}
}
