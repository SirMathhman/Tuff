package io.github.sirmathhman.tuff.checkstyle;

import com.puppycrawl.tools.checkstyle.api.AbstractCheck;
import com.puppycrawl.tools.checkstyle.api.DetailAST;
import com.puppycrawl.tools.checkstyle.api.TokenTypes;
import java.util.HashMap;
import java.util.Map;

/**
 * Check to detect Feature Envy code smell.
 *
 * <p>
 * Feature Envy occurs when a method accesses too many members of another
 * object. If a parameter
 * is accessed more than the configured threshold (default 10), it suggests the
 * functionality should
 * be moved into the parameter's class instead.
 *
 * <p>
 * This check counts all dot-accessed properties and method calls on parameters
 * within a method
 * body.
 */
public final class FeatureEnvyCheck extends AbstractCheck {
	private static final String MSG_KEY = "feature.envy.detected";
	private int threshold = 10;

	/**
	 * Set the maximum number of times a parameter can be accessed before triggering
	 * a violation.
	 *
	 * @param threshold the access count threshold
	 */
	public void setThreshold(int threshold) {
		this.threshold = threshold;
	}

	@Override
	public int[] getDefaultTokens() {
		return getAcceptableTokens();
	}

	@Override
	public int[] getAcceptableTokens() {
		return new int[] { TokenTypes.METHOD_DEF, TokenTypes.COMPACT_CTOR_DEF };
	}

	@Override
	public int[] getRequiredTokens() {
		return new int[0];
	}

	@Override
	public void visitToken(DetailAST ast) {
		// Get method parameters
		final Map<String, Integer> paramAccessCount = extractParameters(ast);

		if (paramAccessCount.isEmpty()) {
			return; // No parameters to check
		}

		// Count accesses to each parameter in the method body
		countParameterAccesses(ast, paramAccessCount);

		// Report violations for parameters exceeding threshold
		for (Map.Entry<String, Integer> entry : paramAccessCount.entrySet()) {
			final String paramName = entry.getKey();
			final int accessCount = entry.getValue();

			if (accessCount > threshold) {
				log(ast.getLineNo(), MSG_KEY, paramName, accessCount, threshold);
			}
		}
	}

	/**
	 * Extract parameter names from method definition.
	 *
	 * @param methodDef the method definition AST node
	 * @return map of parameter names to initial count (0)
	 */
	private Map<String, Integer> extractParameters(DetailAST methodDef) {
		final Map<String, Integer> params = new HashMap<>();

		// Find the parameters section
		DetailAST parametersNode = methodDef.findFirstToken(TokenTypes.PARAMETERS);
		if (parametersNode == null) {
			return params;
		}

		// Iterate through parameter definitions
		DetailAST paramDefNode = parametersNode.getFirstChild();
		while (paramDefNode != null) {
			if (paramDefNode.getType() == TokenTypes.PARAMETER_DEF) {
				// Extract parameter name (last child before type)
				DetailAST paramName = paramDefNode.getLastChild();
				if (paramName.getType() == TokenTypes.IDENT) {
					params.put(paramName.getText(), 0);
				}
			}
			paramDefNode = paramDefNode.getNextSibling();
		}

		return params;
	}

	/**
	 * Count parameter accesses in method body by searching for DOT expressions.
	 *
	 * @param methodDef        the method definition AST node
	 * @param paramAccessCount map of parameter names and their access counts
	 */
	private void countParameterAccesses(DetailAST methodDef, Map<String, Integer> paramAccessCount) {
		// Find the method body (SLIST node)
		DetailAST slistNode = methodDef.findFirstToken(TokenTypes.SLIST);
		if (slistNode == null) {
			return;
		}

		// Traverse the method body for DOT expressions
		traverseAndCountAccesses(slistNode, paramAccessCount);
	}

	/**
	 * Recursively traverse AST to count parameter accesses via DOT expressions.
	 *
	 * @param node             the current AST node
	 * @param paramAccessCount map of parameter names and their access counts
	 */
	private void traverseAndCountAccesses(DetailAST node, Map<String, Integer> paramAccessCount) {
		DetailAST child = node.getFirstChild();
		while (child != null) {
			if (child.getType() == TokenTypes.DOT) {
				// DOT node has first child as the object being accessed
				DetailAST objectNode = child.getFirstChild();
				if (objectNode != null && objectNode.getType() == TokenTypes.IDENT) {
					String objectName = objectNode.getText();
					if (paramAccessCount.containsKey(objectName)) {
						paramAccessCount.put(objectName, paramAccessCount.get(objectName) + 1);
					}
				}
			}

			// Recursively process child nodes
			traverseAndCountAccesses(child, paramAccessCount);

			child = child.getNextSibling();
		}
	}
}
