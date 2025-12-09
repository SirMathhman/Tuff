package tuff;

import java.math.BigInteger;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tuff.ValueType.Value;

/**
 * Main interpreter for the typed integer expression language.
 * Supports arithmetic expressions, let declarations, blocks, and scoped
 * variables.
 * Public API: interpret(String input) returns the evaluated result as a string.
 */
public final class App {
	public static String greet() {
		return "Hello, Tuff!";
	}

	/**
	 * Main entry point for interpreting typed integer expressions.
	 * Handles both simple literals and complex expressions with let declarations.
	 */
	public static String interpret(String input) {
		if (input == null || input.isEmpty())
			return "";
		input = input.trim();
		if (input.startsWith("let ") || input.indexOf(';') >= 0) {
			String stm = evaluateStatements(input);
			if (stm != null)
				return stm;
		}
		if (hasExpressionOperators(input)) {
			String full = evaluateBinaryExpression(input);
			if (full != null)
				return full;
		}

		Pattern p = Pattern.compile("^([+-]?\\d+)(.*)$");
		Matcher m = p.matcher(input);
		if (!m.find())
			return "";
		String digits = m.group(1);
		String rest = m.group(2);

		String binary = evaluateBinaryExpression(input);
		if (binary != null) {
			return binary;
		}
		String suffix = rest.trim();
		if (suffix.isEmpty() || suffix.length() < 2)
			return digits.startsWith("+") ? digits.substring(1) : digits;

		String token = extractToken(suffix);
		if (token.isEmpty())
			return normalizeDigits(digits);

		TokenRange.validateTokenRange(token, digits);
		return normalizeDigits(digits);
	}

	private static class MutableValue {
		Value val;
		boolean isMutable;

		MutableValue(Value val, boolean isMutable) {
			this.val = val;
			this.isMutable = isMutable;
		}
	}

	private static Map<String, Value> extractValueMap(Map<String, MutableValue> mutCtx) {
		Map<String, Value> ctx = new HashMap<>();
		for (String key : mutCtx.keySet()) {
			ctx.put(key, mutCtx.get(key).val);
		}
		return ctx;
	}

	private static String evaluateStatements(String input) {
		List<String> parts = splitTopLevelStatements(input);
		if (parts == null || parts.isEmpty())
			return null;
		boolean endsWithSemicolon = input.trim().endsWith(";");
		if (parts.size() == 1)
			return handleSingleStatement(parts.get(0), endsWithSemicolon);
		Map<String, MutableValue> ctx = new HashMap<>();
		for (int i = 0; i < parts.size() - 1; i++) {
			String stmt = parts.get(i);
			processStatementOrAssignment(stmt, ctx);
		}
		if (endsWithSemicolon)
			return handleDeclarationsOnly(parts, ctx);

		String last = parts.get(parts.size() - 1).trim();
		Value v;
		if (last.matches("^[A-Za-z_][A-Za-z0-9_]*$")) {
			if (!ctx.containsKey(last))
				throw new IllegalArgumentException("unknown identifier: " + last);
			v = ctx.get(last).val;
		} else {
			String r = evaluateWithParentheses(last, extractValueMap(ctx));
			if (r == null)
				return null;
			Pattern p2 = Pattern.compile("^([+-]?\\d+)(.*)$");
			Matcher m2 = p2.matcher(last.trim());
			if (m2.find()) {
				String rest = m2.group(2).trim();
				String tk = extractToken(rest);
				if (tk.isEmpty())
					throw new IllegalArgumentException("final expression missing type: " + last);
				TokenRange.checkValueInRange(tk, new BigInteger(r));
				v = new Value(new BigInteger(r), tk);
			} else {
				throw new IllegalArgumentException("unable to determine type of final expression: " + last);
			}
		}
		if ("Bool".equals(v.token)) {
			// Represent Bool values as textual true/false
			return v.value.equals(java.math.BigInteger.ONE) ? "true" : "false";
		}
		return v.value.toString();
	}

	private static void processStatementOrAssignment(String stmt, Map<String, MutableValue> ctx) {
		// Try let declaration first
		String[] decl = parseLetDeclaration(stmt);
		if (decl != null) {
			String name = decl[0];
			String token = decl[1];
			String expr = decl[2];
			boolean isMut = Boolean.parseBoolean(decl[3]);
			Value resVal = evaluateExpressionValue(expr, extractValueMap(ctx));
			if (resVal == null)
				throw new IllegalArgumentException("invalid expression in declaration: " + expr);
			if (token == null) {
				token = resVal.token;
			} else if (!resVal.token.equals(token)) {
				throw new IllegalArgumentException("mismatched declaration type: " + token + " vs " + resVal.token);
			}
			TokenRange.checkValueInRange(token, resVal.value);
			ctx.put(name, new MutableValue(new Value(resVal.value, token), isMut));
			return;
		}
		// Try assignment
		String[] assign = parseAssignment(stmt);
		if (assign != null) {
			String name = assign[0];
			String expr = assign[1];
			if (!ctx.containsKey(name))
				throw new IllegalArgumentException("unknown identifier: " + name);
			MutableValue mutVal = ctx.get(name);
			if (!mutVal.isMutable)
				throw new IllegalArgumentException("cannot assign to immutable variable: " + name);
			Value resVal = evaluateExpressionValue(expr, extractValueMap(ctx));
			if (resVal == null)
				throw new IllegalArgumentException("invalid expression in assignment: " + expr);
			if (!resVal.token.equals(mutVal.val.token))
				throw new IllegalArgumentException("mismatched assignment type: " + mutVal.val.token + " vs " + resVal.token);
			TokenRange.checkValueInRange(mutVal.val.token, resVal.value);
			mutVal.val = new Value(resVal.value, mutVal.val.token);
			return;
		}
		throw new IllegalArgumentException("invalid statement: " + stmt);
	}

	private static String handleSingleStatement(String stmt, boolean endsWithSemicolon) {
		if (endsWithSemicolon) {
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				return null;
			Value resVal = evaluateExpressionValue(decl[2], Collections.emptyMap());
			if (resVal == null)
				return null;
			String token = decl[1];
			if (token == null) {
				token = resVal.token;
			} else if (!resVal.token.equals(token)) {
				throw new IllegalArgumentException("mismatched declaration type: " + token + " vs " + resVal.token);
			}
			TokenRange.checkValueInRange(token, resVal.value);
			return "";
		}
		return evaluateWithParentheses(stmt);
	}

	private static String handleDeclarationsOnly(List<String> parts, Map<String, MutableValue> ctx) {
		for (int i = 0; i < parts.size(); i++) {
			String stmt = parts.get(i);
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				return null;
			Value resVal = evaluateExpressionValue(decl[2], extractValueMap(ctx));
			if (resVal == null)
				return null;
			String token = decl[1];
			boolean isMut = Boolean.parseBoolean(decl[3]);
			if (token == null) {
				token = resVal.token;
			} else if (!resVal.token.equals(token)) {
				throw new IllegalArgumentException("mismatched declaration type: " + token + " vs " + resVal.token);
			}
			if (ctx.containsKey(decl[0]))
				throw new IllegalArgumentException("duplicate declaration: " + decl[0]);
			ctx.put(decl[0], new MutableValue(new Value(resVal.value, token), isMut));
		}
		return "";
	}

	private static String evaluateBinaryExpression(String input) {
		try {
			return evaluateWithParentheses(input);
		} catch (IllegalArgumentException ex) {
			throw ex;
		} catch (Exception ex) {
			return null;
		}
	}

	private static String evaluateWithParentheses(String input) {
		List<String> tokens = Tokenizer.tokenize(input);
		if (tokens == null)
			return null;
		List<String> output = RPN.shuntingYard(tokens);
		if (output == null)
			return null;
		return RPN.evaluateRPN(output, Collections.emptyMap());
	}

	private static String evaluateWithParentheses(String input, Map<String, Value> ctx) {
		List<String> tokens = Tokenizer.tokenize(input);
		if (tokens == null)
			return null;
		List<String> output = RPN.shuntingYard(tokens);
		if (output == null)
			return null;
		return RPN.evaluateRPN(output, ctx == null ? Collections.emptyMap() : ctx);
	}

	private static Value evaluateExpressionValue(String input, Map<String, Value> ctx) {
		List<String> tokens = Tokenizer.tokenize(input);
		if (tokens == null)
			return null;
		List<String> output = RPN.shuntingYard(tokens);
		if (output == null)
			return null;
		return RPN.evaluateRPNValue(output, ctx == null ? Collections.emptyMap() : ctx);
	}

	private static Value evaluateFinalExpression(String last, Map<String, Value> ctx) {
		if (last.matches("^[A-Za-z_][A-Za-z0-9_]*$")) {
			if (!ctx.containsKey(last))
				throw new IllegalArgumentException("unknown identifier: " + last);
			return ctx.get(last);
		}

		String r = evaluateWithParentheses(last, ctx);
		if (r == null)
			throw new IllegalArgumentException("invalid expression in block: " + last);

		Pattern p = Pattern.compile("^([+-]?\\d+)(.*)$");
		Matcher m = p.matcher(last.trim());
		if (m.find()) {
			String rest = m.group(2).trim();
			String tk = extractToken(rest);
			if (tk.isEmpty())
				throw new IllegalArgumentException("final expression in block missing type: " + last);
			TokenRange.checkValueInRange(tk, new BigInteger(r));
			return new Value(new BigInteger(r), tk);
		}

		throw new IllegalArgumentException("unable to determine type of final expression in block: " + last);
	}

	static Value evaluateBlock(String block, Map<String, Value> outerCtx) {
		String inside = block.substring(1, block.length() - 1).trim();
		List<String> parts = splitTopLevelStatements(inside);

		Map<String, Value> ctx = new HashMap<>();
		if (outerCtx != null)
			ctx.putAll(outerCtx);

		if (parts.isEmpty())
			throw new IllegalArgumentException("empty block");

		for (int i = 0; i < parts.size() - 1; i++) {
			String stmt = parts.get(i);
			String[] decl = parseLetDeclaration(stmt);
			if (decl == null)
				throw new IllegalArgumentException("invalid let declaration: " + stmt);
			String name = decl[0];
			String token = decl[1];
			String exprStr = decl[2];
			Value exprVal = evaluateExpressionValue(exprStr, ctx);
			if (exprVal == null)
				throw new IllegalArgumentException("invalid expression in let: " + stmt);
			if (token == null) {
				token = exprVal.token;
			} else if (!exprVal.token.equals(token)) {
				throw new IllegalArgumentException("mismatched declaration type: " + token + " vs " + exprVal.token);
			}
			TokenRange.checkValueInRange(token, exprVal.value);
			if (ctx.containsKey(name))
				throw new IllegalArgumentException("duplicate declaration: " + name);
			ctx.put(name, new Value(exprVal.value, token));
		}

		String last = parts.get(parts.size() - 1);
		if (last.isEmpty())
			throw new IllegalArgumentException("missing final expression in block");

		return evaluateFinalExpression(last, ctx);
	}

	private static List<String> splitTopLevelStatements(String inside) {
		List<String> parts = new java.util.ArrayList<>();
		int depth = 0;
		StringBuilder cur = new StringBuilder();
		for (int i = 0; i < inside.length(); i++) {
			char c = inside.charAt(i);
			if (c == '{' || c == '(') {
				depth++;
			} else if (c == '}' || c == ')') {
				depth--;
			}
			if (c == ';' && depth == 0) {
				parts.add(cur.toString().trim());
				cur.setLength(0);
			} else {
				cur.append(c);
			}
		}
		if (cur.length() > 0) {
			parts.add(cur.toString().trim());
		}
		return parts;
	}

	private static String[] parseLetDeclaration(String stmt) {
		if (!stmt.startsWith("let "))
			return null;

		// Try explicit type with optional mut: let [mut] name : TYPE = expr
		// Accept integer tokens (U/I types) and Bool
		Pattern explicitType = Pattern.compile("let\\s+(mut\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*([UI]\\d+|Bool)\\s*=\\s*(.+)");
		Matcher explicit = explicitType.matcher(stmt);
		if (explicit.find()) {
			boolean isMut = explicit.group(1) != null;
			return new String[] { explicit.group(2), explicit.group(3), explicit.group(4).trim(), isMut ? "true" : "false" };
		}

		// Try inferred type with optional mut: let [mut] name = expr
		Pattern inferredType = Pattern.compile("let\\s+(mut\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.+)");
		Matcher inferred = inferredType.matcher(stmt);
		if (inferred.find()) {
			boolean isMut = inferred.group(1) != null;
			return new String[] { inferred.group(2), null, inferred.group(3).trim(), isMut ? "true" : "false" };
		}

		return null;
	}

	private static String[] parseAssignment(String stmt) {
		// Parse: name = expr
		Pattern assignPattern = Pattern.compile("^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.+)$");
		Matcher m = assignPattern.matcher(stmt);
		if (m.find())
			return new String[] { m.group(1), m.group(2).trim() };
		return null;
	}

	private static boolean hasExpressionOperators(String input) {
		if (input.indexOf('(') >= 0 || input.indexOf(')') >= 0 || input.indexOf('{') >= 0 || input.indexOf('}') >= 0
				|| input.indexOf('+') >= 0 || input.indexOf('*') >= 0)
			return true;
		return Pattern.compile("\\d\\s*[-]\\s*\\d").matcher(input).find();
	}

	private static String extractToken(String suffix) {
		int tokenEnd = 0;
		while (tokenEnd < suffix.length() && Character.isLetterOrDigit(suffix.charAt(tokenEnd))) {
			tokenEnd++;
		}
		return tokenEnd == 0 ? "" : suffix.substring(0, tokenEnd);
	}

	private static String normalizeDigits(String digits) {
		return digits.startsWith("+") ? digits.substring(1) : digits;
	}

	public static void main(String[] args) {
		System.out.println(greet());
	}
}
