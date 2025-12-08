package tuff;

import java.util.HashMap;
import java.util.Map;

public final class Parser {
	private final String s;
	private final int n;
	private int i = 0;

	private Map<String, Operand> locals = new HashMap<>();
	// track mutability for variables in scope
	private Map<String, Boolean> mutables = new HashMap<>();
	// track declared (typed but not-yet-initialized) variables
	private Map<String, DeclaredType> declaredTypes = new HashMap<>();
	private Map<String, FunctionDef> functions = new HashMap<>();

	// tracks how many loops we're currently inside (supports nested loops)
	private int loopDepth = 0;

	Map<String, Operand> getLocals() {
		return locals;
	}

	private Operand parseLeadingKeywords() {
		return ParsingHelpers.parseLeadingKeywords(this);
	}

	private void parseReturnStatement() {
		ParsingHelpers.parseReturnStatement(this);
	}

	private void parseBreakStatement() {
		ParsingHelpers.parseBreakStatement(this);
	}

	private java.util.Map<String, Operand> bindFunctionParameters(FunctionDef fd, java.util.List<Operand> args) {
		return ParsingHelpers.bindFunctionParameters(fd, args);
	}

	private Operand enforceDeclaredReturn(FunctionDef fd, Operand op) {
		return ParsingHelpers.enforceDeclaredReturn(fd, op);
	}

	Map<String, Boolean> getMutables() {
		return mutables;
	}

	Map<String, DeclaredType> getDeclaredTypes() {
		return declaredTypes;
	}

	Map<String, FunctionDef> getFunctions() {
		return functions;
	}

	void setFunctions(Map<String, FunctionDef> f) {
		this.functions = f;
	}

	private boolean allowReturn = false;

	void setAllowReturn(boolean allowReturn) {
		this.allowReturn = allowReturn;
	}

	public Parser(String s) {
		this.s = s;
		this.n = s.length();
	}

	public boolean startsWithLet() {
		skipWhitespace();
		return i < n && s.startsWith("let", i) && (i + 3 == n || !Character.isJavaIdentifierPart(s.charAt(i + 3)));
	}

	public boolean hasNext() {
		skipWhitespace();
		return i < n;
	}

	public void skipWhitespace() {
		while (i < n && Character.isWhitespace(s.charAt(i)))
			i++;
	}

	public Operand parseExpression() {
		return ExpressionParser.parseExpression(this);
	}

	// equality level (==, !=) - binds looser than additive but tighter than
	// logical-and
	Operand parseEquality() {
		return ExpressionParser.parseEquality(this);
	}

	// logical-and level (&&) - binds looser than equality
	public Operand parseLogicalAnd() {
		return ExpressionParser.parseLogicalAnd(this);
	}

	// logical-or level (||)
	public Operand parseLogicalOr() {
		return ExpressionParser.parseLogicalOr(this);
	}

	public Operand parseTerm() {
		return ExpressionParser.parseTerm(this);
	}

	public Operand parseFactor() {
		skipWhitespace();
		// support if-expression: if (cond) expr else expr
		if (i + 1 < n && s.startsWith("if", i) && (i + 2 == n || !Character.isJavaIdentifierPart(s.charAt(i + 2)))) {
			return parseIfExpression();
		}

		// support match-expression: match <expr> { case <pat> => <expr>; ... }
		if (i + 4 < n && s.startsWith("match", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			return parseMatchExpression();
		}

		Operand paren = parseParenthesized();
		if (paren != null)
			return paren;

		Operand block = parseBlockStart();
		if (block != null)
			return block;

		Operand boolLit = parseBooleanLiteral();
		if (boolLit != null)
			return boolLit;

		Operand num = parseNumberToken();
		if (num != null)
			return num;

		Operand fncall = parseFunctionCallIfPresent();
		if (fncall != null)
			return fncall;
		Operand id = parseIdentifierLookup();
		if (id != null)
			return id;

		throw new IllegalArgumentException("invalid token at position " + i);
	}

	Operand parseBooleanLiteral() {
		return LiteralParser.parseBooleanLiteral(this);
	}

	Operand parseNumberToken() {
		return LiteralParser.parseNumberToken(this);
	}

	private Operand parseIdentifierLookup() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		i += name.length();
		if (!locals.containsKey(name))
			throw new IllegalArgumentException("undefined variable: " + name);
		return locals.get(name);
	}

	private Operand parseAssignmentIfPresent() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = i;
		i += name.length();
		skipWhitespace();
		if (i < n) {
			// simple assignment '='
			if (s.charAt(i) == '=') {
				i++; // consume '='
				Operand val = parseLogicalOr();
				new AssignmentUtils(locals, mutables, declaredTypes).assign(name, val);
				return locals.get(name);
			}
			// compound assignment like '+=', '-=', '*=', '/=', '%='
			if (i + 1 < n) {
				char op = s.charAt(i);
				char next = s.charAt(i + 1);
				if ((op == '+' || op == '-' || op == '*' || op == '/' || op == '%') && next == '=') {
					i += 2; // consume operator and '='
					Operand val = parseLogicalOr();
					new AssignmentUtils(locals, mutables, declaredTypes).assignCompound(name, op, val);
					return locals.get(name);
				}
			}
		}
		i = start;
		return null;
	}

	private Operand parseFunctionCallIfPresent() {
		skipWhitespace();
		java.util.regex.Matcher idm = java.util.regex.Pattern.compile("^[A-Za-z_]\\w*").matcher(s.substring(i));
		if (!idm.find())
			return null;
		String name = idm.group();
		int start = i;
		i += name.length();
		skipWhitespace();
		if (i >= n || s.charAt(i) != '(') {
			i = start;
			return null;
		}
		i++; // consume '('
		java.util.List<Operand> args = new java.util.ArrayList<>();
		skipWhitespace();
		if (i < n && s.charAt(i) != ')') {
			while (true) {
				Operand arg = parseLogicalOr();
				args.add(arg);
				skipWhitespace();
				if (i < n && s.charAt(i) == ',') {
					i++; // consume comma
					skipWhitespace();
					continue;
				}
				break;
			}
		}
		skipWhitespace();
		if (i >= n || s.charAt(i) != ')')
			throw new IllegalArgumentException("missing ')' in function call");
		i++; // consume ')'

		// resolve function
		FunctionDef fd = functions.get(name);
		if (fd == null) {
			// not a function, restore and treat as identifier
			i = start;
			return null;
		}

		return callFunction(fd, args);
	}

	private Operand callFunction(FunctionDef fd, java.util.List<Operand> args) {
		if (args.size() != fd.paramNames.size())
			throw new IllegalArgumentException("argument count mismatch in function call");

		java.util.Map<String, Operand> fLocals = bindFunctionParameters(fd, args);

		Parser p2 = new Parser(fd.body.bodySource);
		// provide access to functions for recursion
		p2.setFunctions(new java.util.HashMap<>(this.functions));
		p2.setLocals(new java.util.HashMap<>(fLocals));
		p2.setMutables(new java.util.HashMap<>());
		p2.setDeclaredTypes(new java.util.HashMap<>());
		p2.setAllowReturn(true);

		try {
			Operand res = p2.parseTopLevelBlock();
			if (res == null) {
				res = new Operand(java.math.BigInteger.ZERO, null, null);
			}
			return enforceDeclaredReturn(fd, res);
		} catch (ReturnException re) {
			Operand r = re.value;
			return enforceDeclaredReturn(fd, r);
		}
	}

	private Operand parseParenthesized() {
		if (i < n && s.charAt(i) == '(') {
			i++; // consume '('
			Operand inner = parseExpression();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ')')
				throw new IllegalArgumentException("mismatched parentheses");
			i++; // consume ')'
			return inner;
		}
		return null;
	}

	Operand parseStatement() {
		skipWhitespace();
		int beforeKeyword = i;
		Operand leading = parseLeadingKeywords();
		if (i != beforeKeyword)
			return leading;
		if (s.startsWith("return", i) && (i + 6 == n || !Character.isJavaIdentifierPart(s.charAt(i + 6)))) {
			parseReturnStatement();
		}

		if (s.startsWith("break", i) && (i + 5 == n || !Character.isJavaIdentifierPart(s.charAt(i + 5)))) {
			parseBreakStatement();
		}
		int save = i;
		Operand assign = parseAssignmentIfPresent();
		if (assign != null)
			return assign;
		i = save;
		return parseLogicalOr();
	}

	private Operand parseBlockStart() {
		if (i < n && s.charAt(i) == '{') {
			return new BlockParser(this).parseBlock();
		}
		return null;
	}

	private Operand parseIfExpression() {
		IfExpressionParser iep = new IfExpressionParser(this);
		return iep.parseIfExpression();
	}

	private Operand parseMatchExpression() {
		MatchExpressionParser mep = new MatchExpressionParser(this);
		return mep.parseMatchExpression();
	}

	// while / block iteration and related helpers extracted to helper classes

	// package-private accessors used by helper parsers
	int getIndex() {
		return i;
	}

	void setIndex(int idx) {
		i = idx;
	}

	void setLocals(Map<String, Operand> m) {
		locals = m;
	}

	void setMutables(Map<String, Boolean> m) {
		mutables = m;
	}

	void setDeclaredTypes(Map<String, DeclaredType> m) {
		declaredTypes = m;
	}

	void incLoopDepth() {
		loopDepth++;
	}

	void decLoopDepth() {
		loopDepth--;
	}

	int getLoopDepth() {
		return loopDepth;
	}

	char charAt(int pos) {
		if (pos >= n)
			return '\u0000';
		return s.charAt(pos);
	}

	private Operand parseLetStatement() {
		LetStatementParser lsp = new LetStatementParser(this);
		return lsp.parseLetStatement();
	}

	// parse a top-level sequence of statements (let and expressions) ending at EOF
	public Operand parseTopLevelBlock() {
		Map<String, Operand> prev = locals;
		Map<String, Boolean> prevMut = mutables;
		Map<String, DeclaredType> prevDeclared = declaredTypes;
		Map<String, FunctionDef> prevFuncs = functions;
		locals = new HashMap<>(prev);
		mutables = new HashMap<>(prevMut);
		declaredTypes = new HashMap<>(prevDeclared);
		functions = new HashMap<>(prevFuncs);
		Operand last = null;
		while (true) {
			skipWhitespace();
			if (i >= n)
				break;
			last = parseStatement();
			skipWhitespace();
			if (i < n && s.charAt(i) == ';') {
				i++; // consume ';' and continue
				continue;
			}
			// if not semicolon, loop will either consume more or end
		}
		locals = prev;
		mutables = prevMut;
		functions = prevFuncs;
		return last == null ? null : last;
	}

	// Helper methods for IfExpressionParser and MatchExpressionParser
	void consumeIf() {
		i += 2; // consume 'if'
	}

	void consumeMatch() {
		i += 5; // consume 'match'
	}

	void consumeChar() {
		i++;
	}

	void consumeKeyword(String keyword) {
		i += keyword.length();
	}

	void consumeArrow() {
		i += 2; // consume '=>'
	}

	char peekChar() {
		if (i >= n)
			return '\u0000'; // null character
		return s.charAt(i);
	}

	boolean startsWithKeyword(String keyword) {
		return s.startsWith(keyword, i)
				&& (i + keyword.length() == n || !Character.isJavaIdentifierPart(s.charAt(i + keyword.length())));
	}

	boolean startsWithArrow() {
		return i + 1 < n && s.charAt(i) == '=' && s.charAt(i + 1) == '>';
	}

	String remainingInput() {
		return s.substring(i);
	}

	int getLength() {
		return n;
	}

	String getSubstring(int start, int end) {
		return s.substring(start, end);
	}

	boolean isAllowReturn() {
		return allowReturn;
	}

	Operand parseLetStatementDirect() {
		LetStatementParser lsp = new LetStatementParser(this);
		return lsp.parseLetStatement();
	}

}
