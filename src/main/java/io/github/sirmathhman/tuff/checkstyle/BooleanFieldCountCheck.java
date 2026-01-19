package io.github.sirmathhman.tuff.checkstyle;

import com.puppycrawl.tools.checkstyle.api.AbstractCheck;
import com.puppycrawl.tools.checkstyle.api.DetailAST;
import com.puppycrawl.tools.checkstyle.api.TokenTypes;

/**
 * Ensures classes do not declare too many boolean fields.
 */
public final class BooleanFieldCountCheck extends AbstractCheck {
	private static final String MSG_KEY = "boolean.fields.exceeded";

	private int max = 3;

	public void setMax(int max) {
		this.max = max;
	}

	@Override
	public int[] getDefaultTokens() {
		return getAcceptableTokens();
	}

	@Override
	public int[] getAcceptableTokens() {
		return new int[] {
				TokenTypes.CLASS_DEF,
				TokenTypes.INTERFACE_DEF,
				TokenTypes.ENUM_DEF,
				TokenTypes.RECORD_DEF,
		};
	}

	@Override
	public int[] getRequiredTokens() {
		return new int[0];
	}

	@Override
	public void visitToken(DetailAST ast) {
		DetailAST objBlock = ast.findFirstToken(TokenTypes.OBJBLOCK);
		if (objBlock == null) {
			return;
		}

		int booleanFieldCount = 0;

		for (DetailAST child = objBlock.getFirstChild(); child != null; child = child.getNextSibling()) {
			if (child.getType() != TokenTypes.VARIABLE_DEF) {
				continue;
			}

			DetailAST type = child.findFirstToken(TokenTypes.TYPE);
			if (type != null && isBooleanType(type)) {
				booleanFieldCount++;
			}
		}

		if (booleanFieldCount > max) {
			DetailAST ident = ast.findFirstToken(TokenTypes.IDENT);
			int line = ident != null ? ident.getLineNo() : ast.getLineNo();
			log(line, MSG_KEY, booleanFieldCount, max);
		}
	}

	private static boolean isBooleanType(DetailAST typeAst) {
		DetailAST first = typeAst.getFirstChild();
		if (first == null) {
			return false;
		}

		if (first.getType() == TokenTypes.LITERAL_BOOLEAN) {
			return true;
		}

		if (first.getType() == TokenTypes.IDENT) {
			return "Boolean".equals(first.getText());
		}

		return false;
	}
}
