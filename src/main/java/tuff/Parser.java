package tuff;

import java.util.HashMap;
import java.util.Map;

public final class Parser {
	private final String s;
	private int i = 0;
	private final int n;

	private Map<String, Operand> locals = new HashMap<>();
	private Map<String, Boolean> mutables = new HashMap<>();
	private Map<String, DeclaredType> declaredTypes = new HashMap<>();
	private Map<String, FunctionDef> functions = new HashMap<>();
	private Map<String, java.util.Map<String, Operand>> modules = new HashMap<>();
	private Map<String, DeclaredType> typeAliases = new HashMap<>();

	private int loopDepth = 0;
	private boolean allowReturn = false;

	Map<String, Operand> getLocals() {
		return locals;
	}

	Operand parseLeadingKeywords() {
		return ParsingHelpers.parseLeadingKeywords(this);
	}

	void parseReturnStatement() {
		ParsingHelpers.parseReturnStatement(this);
	}

	void parseBreakStatement() {
		ParsingHelpers.parseBreakStatement(this);
	}

	java.util.Map<String, Operand> bindFunctionParameters(FunctionDef fd, java.util.List<Operand> args,
			java.util.Map<String, DeclaredType> typeBindings) {
		return ParsingHelpers.bindFunctionParameters(fd, args, typeBindings);
	}

	Operand enforceDeclaredReturn(FunctionDef fd, Operand op, java.util.Map<String, DeclaredType> typeBindings) {
		return ParsingHelpers.enforceDeclaredReturn(fd, op, typeBindings);
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

	Map<String, java.util.Map<String, Operand>> getModules() {
		return modules;
	}

	Map<String, DeclaredType> getTypeAliases() {
		return typeAliases;
	}

	void setFunctions(Map<String, FunctionDef> f) {
		this.functions = f;
	}

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

	Operand parseEquality() {
		return ExpressionParser.parseEquality(this);
	}

	public Operand parseLogicalAnd() {
		return ExpressionParser.parseLogicalAnd(this);
	}

	public Operand parseLogicalOr() {
		return ExpressionParser.parseLogicalOr(this);
	}

	public Operand parseTerm() {
		return ExpressionParser.parseTerm(this);
	}

	public Operand parseFactor() {
		return FactorParser.parse(this);
	}

	Operand parseBooleanLiteral() {
		return LiteralParser.parseBooleanLiteral(this);
	}

	Operand parseNumberToken() {
		return LiteralParser.parseNumberToken(this);
	}

	Operand parseArrayLiteral() {
		return LiteralParser.parseArrayLiteral(this);
	}

	Operand parseIdentifierLookup() {
		return IdentifierResolver.parseIdentifierLookup(this);
	}

	Operand parseAssignmentIfPresent() {
		return IdentifierResolver.parseAssignmentIfPresent(this);
	}

	Operand parseFunctionCallIfPresent() {
		return FunctionCallParser.parseFunctionCallIfPresent(this);
	}

	Operand parseParenthesized() {
		if (i < n && s.charAt(i) == '(') {
			Operand maybeFn = ParenthesizedFunctionParser.parse(this);
			if (maybeFn != null)
				return maybeFn;

			// fallback: regular parenthesized expression
			i++; // consume '('
			Operand inner = parseLogicalOr();
			skipWhitespace();
			if (i >= n || s.charAt(i) != ')')
				throw new IllegalArgumentException("mismatched parentheses");
			i++; // consume ')'
			return inner;
		}
		return null;
	}

	Operand parseStatement() {
		return ParserTopLevel.parseStatement(this);
	}

	Operand parseBlockStart() {
		if (i < n && s.charAt(i) == '{') {
			return new BlockParser(this).parseBlock();
		}
		return null;
	}

	Operand parseIfExpression() {
		IfExpressionParser iep = new IfExpressionParser(this);
		return iep.parseIfExpression();
	}

	Operand parseMatchExpression() {
		MatchExpressionParser mep = new MatchExpressionParser(this);
		return mep.parseMatchExpression();
	}

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

	public Operand parseTopLevelBlock() {
		return ParserTopLevel.parseTopLevelBlock(this);
	}

	void consumeIf() {
		i += 2;
	}

	void consumeMatch() {
		i += 5;
	}

	void consumeChar() {
		i++;
	}

	void consumeKeyword(String keyword) {
		i += keyword.length();
	}

	void consumeArrow() {
		i += 2;
	}

	char peekChar() {
		if (i >= n)
			return '\u0000';
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
