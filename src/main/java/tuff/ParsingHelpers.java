package tuff;

import java.util.HashMap;
import java.util.Map;

/**
 * Static helper methods for parsing operations.
 * Extracted from Parser.java to reduce file complexity.
 */
public final class ParsingHelpers {

	private ParsingHelpers() {
		// utility class
	}

	/**
	 * Parse leading keywords (let, fn, while) and return result or null if no
	 * keyword matched.
	 */
	static Operand parseLeadingKeywords(Parser parser) {
		parser.skipWhitespace();
		if (parser.startsWithKeyword("let")) {
			return parser.parseLetStatementDirect();
		}
		if (parser.startsWithKeyword("fn")) {
			new FunctionDefinitionParser(parser).parseFunctionDefinition();
			return null;
		}
		if (parser.startsWithKeyword("while")) {
			new WhileStatementParser(parser).parseWhileStatement();
			return null;
		}
		return null;
	}

	/**
	 * Parse a return statement and throw ReturnException.
	 */
	static void parseReturnStatement(Parser parser) {
		if (!parser.isAllowReturn())
			throw new IllegalArgumentException("return outside function");
		parser.consumeKeyword("return");
		parser.skipWhitespace();
		Operand ret = parser.parseLogicalOr();
		throw new ReturnException(ret);
	}

	/**
	 * Parse a break statement and throw BreakException.
	 */
	static void parseBreakStatement(Parser parser) {
		if (parser.getLoopDepth() == 0)
			throw new IllegalArgumentException("break outside of loop");
		parser.consumeKeyword("break");
		throw new BreakException();
	}

	/**
	 * Bind function parameters to local values with type validation.
	 */
	static Map<String, Operand> bindFunctionParameters(FunctionDef fd, java.util.List<Operand> args) {
		Map<String, Operand> fLocals = new HashMap<>();
		for (int idx = 0; idx < args.size(); idx++) {
			Operand a = args.get(idx);
			DeclaredType pdt = fd.paramTypes.get(idx);
			if (pdt != null && pdt.isBool) {
				if (a.isBoolean == null)
					throw new IllegalArgumentException("typed Bool assignment requires boolean operand");
				fLocals.put(fd.paramNames.get(idx), new Operand(a.value, true));
			} else if (pdt != null && pdt.unsignedOrSigned != null && pdt.width != null) {
				if (a.isBoolean != null)
					throw new IllegalArgumentException("typed numeric assignment requires numeric operand");
				App.validateRange(a.value.toString(), pdt.unsignedOrSigned, pdt.width);
				fLocals.put(fd.paramNames.get(idx),
						new Operand(a.value, pdt.unsignedOrSigned, pdt.width));
			} else {
				fLocals.put(fd.paramNames.get(idx), a);
			}
		}
		return fLocals;
	}

	/**
	 * Validate and enforce declared return type.
	 */
	static Operand enforceDeclaredReturn(FunctionDef fd, Operand op) {
		DeclaredType declared = fd.body.returnType;
		if (declared == null)
			return op;
		if (declared.isBool) {
			if (op.isBoolean == null)
				throw new IllegalArgumentException("typed Bool return requires boolean operand");
			return op;
		}
		if (declared.unsignedOrSigned != null && declared.width != null) {
			if (op.isBoolean != null)
				throw new IllegalArgumentException("typed numeric return requires numeric operand");
			App.validateRange(op.value.toString(), declared.unsignedOrSigned, declared.width);
			return new Operand(op.value, declared.unsignedOrSigned, declared.width);
		}
		return op;
	}
}
