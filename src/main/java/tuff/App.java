package tuff;

public final class App {

	public static void main(String[] args) {
		if (args == null || args.length != 2) {
			System.err.println("Usage: java -jar tuff.jar <file> <source-set-dir>");
			System.exit(1);
		}

		String filePath = args[0];
		String sourceSetDir = args[1];

		try {
			java.util.Map<String, String> sources = loadSourceFile(filePath, sourceSetDir);
			// interpret the single file as the main script (the single key present)
			if (sources.isEmpty()) {
				System.err.println("No sources loaded");
				System.exit(1);
			}
			String mainScriptName = sources.keySet().iterator().next();
			String result = interpretAll(mainScriptName, sources);
			if (result != null)
				System.out.println(result);
		} catch (Exception ex) {
			ex.printStackTrace();
			System.exit(1);
		}
	}

	/**
	 * Load a single source file as a module keyed by the module path derived from
	 * the source set base dir. For example, baseDir=./src and
	 * file=./src/foo/bar.tuff
	 * will produce a map entry with key "foo::bar".
	 */
	public static java.util.Map<String, String> loadSourceFile(String filePath, String sourceSetDir)
			throws java.io.IOException {
		if (filePath == null || sourceSetDir == null)
			throw new IllegalArgumentException("filePath and sourceSetDir must be non-null");

		java.nio.file.Path file = java.nio.file.Paths.get(filePath).toAbsolutePath().normalize();
		java.nio.file.Path base = java.nio.file.Paths.get(sourceSetDir).toAbsolutePath().normalize();

		java.nio.file.Path rel;
		try {
			rel = base.relativize(file);
		} catch (IllegalArgumentException ex) {
			// not relative: if file contains base as substring, try manual
			String baseStr = base.toString();
			String fileStr = file.toString();
			int idx = fileStr.indexOf(baseStr);
			if (idx >= 0) {
				String sub = fileStr.substring(idx + baseStr.length());
				if (sub.startsWith(java.io.File.separator))
					sub = sub.substring(1);
				rel = java.nio.file.Paths.get(sub);
			} else {
				throw new IllegalArgumentException("file is not under the provided source set directory: " + filePath);
			}
		}

		String relStr = rel.toString().replace(java.io.File.separatorChar, '/');
		if (relStr.startsWith("./"))
			relStr = relStr.substring(2);
		if (relStr.endsWith(".tuff"))
			relStr = relStr.substring(0, relStr.length() - ".tuff".length());

		String key = String.join("::", relStr.split("/"));
		String content = java.nio.file.Files.readString(file, java.nio.charset.StandardCharsets.UTF_8);

		java.util.Map<String, String> map = new java.util.HashMap<>();
		map.put(key, content);
		return map;
	}

	public static String greet() {
		return "Hello from Tuff App!";
	}

	public static String interpret(String input) {
		// reset captured output for this interpretation run
		OutputUtils.resetCapturedOutput();
		if (input == null || input.isEmpty()) {
			return "";
		}

		String t = input.trim();
		String literal = checkLiterals(t);
		if (literal != null) {
			return literal;
		}

		// Try parsing simple expressions containing + and - (left-to-right evaluation).
		String exprResult = tryEvaluateExpression(input);
		if (exprResult != null) {
			return exprResult;
		}

		// Simple addition expressions like "100U8 + 50U8"
		java.util.regex.Matcher addMatcher = java.util.regex.Pattern
				.compile("^\\s*([-+]?\\S+)\\s*\\+\\s*([-+]?\\S+)\\s*$")
				.matcher(input);
		if (addMatcher.matches()) {
			return evaluateAddition(addMatcher.group(1), addMatcher.group(2));
		}

		return parseNumeric(input);
	}

	private static String checkLiterals(String t) {
		// boolean literal
		if ("true".equals(t) || "false".equals(t)) {
			return t;
		}

		// single-quoted character literal, e.g. 'a' or '\n'
		if (t.matches("^'([^'\\\\]|\\\\.)'$")) {
			return t;
		}

		// double-quoted string literal, e.g. "value" or "escaped \" quotes"
		if (t.matches("^\"([^\"\\\\]|\\\\.)*\"$")) {
			return t;
		}
		return null;
	}

	private static String parseNumeric(String input) {
		if (TypeUtils.isSignedInteger(input)) {
			return input;
		}

		java.util.regex.Matcher m = java.util.regex.Pattern
				.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64|Size))?$")
				.matcher(input);
		if (!m.matches()) {
			throw new IllegalArgumentException("interpret: non-empty non-integer input not supported");
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2); // either "U" or "I" when present

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		String width = m.group(3); // one of 8,16,32,64 or null
		if (width != null) {
			TypeUtils.validateRange(number, unsignedOrSigned, width);
		}

		return number;
	}

	/**
	 * Interpret a set of source files where one file is the "main" entry point.
	 */
	public static String interpretAll(String mainScriptName, java.util.Map<String, String> sources) {
		return interpret(SourceCombiner.combine(mainScriptName, sources));
	}

	/**
	 * Convenience overload which assumes the main script key is "main".
	 */
	public static String interpretAll(java.util.Map<String, String> sources) {
		return interpret(SourceCombiner.combine(sources));
	}

	private static String evaluateAddition(String left, String right) {
		return evaluateAddition(new String[] { left, right });
	}

	private static String evaluateAddition(String[] parts) {
		java.util.List<Operand> operands = new java.util.ArrayList<>();
		for (String p : parts) {
			operands.add(parseOperand(p));
		}

		java.math.BigInteger sum = java.math.BigInteger.ZERO;
		for (Operand op : operands) {
			sum = sum.add(op.value);
		}

		String onlyType = TypeUtils.singleTypedKind(operands);
		if (onlyType != null) {
			String signed = onlyType.substring(0, 1);
			String width = onlyType.substring(1);
			TypeUtils.validateRange(sum.toString(), signed, width);
		}

		return sum.toString();
	}

	private static Operand parseOperand(String token) {
		if (token == null)
			throw new IllegalArgumentException("invalid operand: null");
		token = token.trim();
		if ("true".equals(token) || "false".equals(token)) {
			boolean val = "true".equals(token);
			return new Operand(val ? java.math.BigInteger.ONE : java.math.BigInteger.ZERO, true);
		}

		if (TypeUtils.isSignedInteger(token)) {
			return new Operand(new java.math.BigInteger(token), null, null);
		}

		java.util.regex.Matcher m = java.util.regex.Pattern.compile("^([-+]?\\d+)(?:(U|I)(8|16|32|64|Size))?$")
				.matcher(token);
		if (!m.matches()) {
			throw new IllegalArgumentException("invalid operand: " + token);
		}

		String number = m.group(1);
		String unsignedOrSigned = m.group(2);
		String width = m.group(3);

		if (unsignedOrSigned != null && "U".equals(unsignedOrSigned) && number.startsWith("-")) {
			throw new IllegalArgumentException("unsigned type with negative value");
		}

		if (width != null) {
			TypeUtils.validateRange(number, unsignedOrSigned, width);
			return new Operand(new java.math.BigInteger(number), unsignedOrSigned, width);
		}

		return new Operand(new java.math.BigInteger(number), null, null);
	}

	private static String tryEvaluateExpression(String input) {
		try {
			// support simple string concatenation expressions made of only
			// double-quoted literals separated by + (e.g. "a" + "b" + "c")
			if (input != null) {
				String concatResult = tryStringConcatenation(input);
				if (concatResult != null) {
					return concatResult;
				}
			}
			Operand result = parseExpressionToOperand(input);
			String finalResult = formatResult(result);

			String captured = OutputUtils.getCapturedOutput();
			if (captured != null && !captured.isEmpty()) {
				return captured;
			}

			return finalResult;
		} catch (IllegalArgumentException ex) {
			// propagate known evaluation errors
			throw ex;
		} catch (Exception ex) {
			// parsing failed; not an expression we support
			return null;
		}
	}

	private static String formatResult(Operand result) {
		if (result == null) {
			return "";
		} else if (result.elements != null) {
			return "";
		} else if (result.stringValue != null) {
			if (result.isChar != null && result.isChar)
				return "'" + result.stringValue + "'";
			else
				return '"' + result.stringValue + '"';
		} else {
			if (result.unsignedOrSigned != null && result.width != null) {
				TypeUtils.validateRange(result.value.toString(), result.unsignedOrSigned, result.width);
			}
			if (result.isBoolean != null && result.isBoolean) {
				return java.math.BigInteger.ONE.equals(result.value) ? "true" : "false";
			} else {
				return result.value == null ? "" : result.value.toString();
			}
		}
	}

	private static String tryStringConcatenation(String s) {
		s = s.trim();
		if (s.isEmpty()) {
			return null;
		}
		java.util.List<String> parts = splitStringByPlus(s);

		if (!parts.isEmpty()) {
			return concatenateStringParts(parts);
		}
		return null;
	}

	private static java.util.List<String> splitStringByPlus(String s) {
		java.util.List<String> parts = new java.util.ArrayList<>();
		boolean inQuotes = false;
		boolean escaping = false;
		int partStart = 0;
		for (int idx = 0; idx < s.length(); idx++) {
			char ch = s.charAt(idx);
			if (escaping) {
				escaping = false;
				continue;
			}
			if (ch == '\\') {
				escaping = true;
				continue;
			}
			if (ch == '"') {
				inQuotes = !inQuotes;
				continue;
			}
			if (ch == '+' && !inQuotes) {
				parts.add(s.substring(partStart, idx));
				partStart = idx + 1;
			}
		}
		if (partStart > 0) {
			parts.add(s.substring(partStart));
		}
		return parts;
	}

	private static String concatenateStringParts(java.util.List<String> parts) {
		// if we split by top-level '+' successfully and each part is a
		// quoted string literal, concatenate their inner contents
		java.lang.StringBuilder out = new java.lang.StringBuilder();
		boolean allQuoted = true;
		for (String p : parts) {
			String t = p.trim();
			if (t.length() >= 2 && t.charAt(0) == '"' && t.charAt(t.length() - 1) == '"') {
				// validate internal quotes are escaped
				boolean ok = true;
				boolean esc = false;
				for (int j = 1; j < t.length() - 1; j++) {
					char c = t.charAt(j);
					if (esc) {
						esc = false;
						continue;
					}
					if (c == '\\') {
						esc = true;
						continue;
					}
					if (c == '"') {
						ok = false;
						break;
					}
				}
				if (!ok) {
					allQuoted = false;
					break;
				}
				out.append(t.substring(1, t.length() - 1));
			} else {
				allQuoted = false;
				break;
			}
		}
		if (allQuoted && out.length() > 0) {
			return '"' + out.toString() + '"';
		}
		if (allQuoted && out.length() == 0 && parts.size() > 0) {
			// handle case where parts are empty strings: "" + "" -> ""
			return "\"\"";
		}
		return null;
	}

	private static Operand parseExpressionToOperand(String input) {
		if (input == null)
			return null;
		Parser p = new Parser(input);
		p.skipWhitespace();
		Operand result;
		// Allow parsing top-level blocks when we have statements: let, while, match,
		// if, or a leading '{'
		if (p.startsWithLet() || p.startsWithKeyword("while") || p.startsWithKeyword("match") || p.startsWithKeyword("if")
				|| p.startsWithKeyword("fn") || p.startsWithKeyword("extern") || p.startsWithKeyword("type")
				|| p.startsWithKeyword("struct") || p.startsWithKeyword("module") || p.peekChar() == '{') {
			result = p.parseTopLevelBlock();
		} else {
			result = p.parseLogicalOr();
			p.skipWhitespace();
			if (p.hasNext()) // leftover tokens -> not a simple expression
				throw new IllegalArgumentException("invalid expression");
		}
		p.skipWhitespace();
		if (p.hasNext()) // leftover tokens -> not a simple expression
			throw new IllegalArgumentException("invalid expression");
		return result;
	}
}
