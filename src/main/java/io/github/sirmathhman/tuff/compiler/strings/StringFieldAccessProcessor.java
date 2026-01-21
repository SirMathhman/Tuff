package io.github.sirmathhman.tuff.compiler.strings;

import io.github.sirmathhman.tuff.Result;
import java.util.HashMap;

/**
 * Processor for string field access patterns, specifically handling .length
 * access on string variables.
 */
public final class StringFieldAccessProcessor {
	private StringFieldAccessProcessor() {
	}

	/**
	 * Handles string field access by replacing patterns like varName.length with
	 * literal values.
	 *
	 * @param varName
	 *                     the variable name
	 * @param valueExpr
	 *                     the value expression
	 * @param continuation
	 *                     the continuation code
	 * @return the continuation with field accesses substituted
	 */
	public static String handleStringFieldAccess(String varName, String valueExpr, String continuation) {
		if (StringLiteralHandler.isStringLiteral(valueExpr) || !continuation.contains(varName + ".length")) {
			return continuation;
		}
		var stringResult = StringLiteralHandler.handleStringLiteral(valueExpr, new HashMap<>());
		if (stringResult instanceof Result.Ok<?, ?> ok) {
			var strAlloc = (StringLiteralHandler.StringAllocationResult) ok.value();
			return continuation.replace(varName + ".length", String.valueOf(strAlloc.length()));
		}
		return continuation;
	}
}
