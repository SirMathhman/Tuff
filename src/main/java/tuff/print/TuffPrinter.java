package tuff.print;

import tuff.ast.tuff.TuffDecl;
import tuff.ast.tuff.TuffModule;
import tuff.ast.tuff.TuffRawDecl;
import tuff.ast.tuff.TuffUseDecl;

public final class TuffPrinter {
	public String print(TuffModule module) {
		StringBuilder out = new StringBuilder();
		String nl = System.lineSeparator();

		for (TuffUseDecl use : module.uses()) {
			out.append("from ")
					.append(String.join("::", use.namespace()))
					.append(" use { ")
					.append(String.join(", ", use.names()))
					.append(" };")
					.append(nl);
		}

		for (TuffDecl decl : module.decls()) {
			out.append(printDecl(decl)).append(nl);
		}

		return out.toString();
	}

	private String printDecl(TuffDecl decl) {
		return switch (decl) {
			case TuffRawDecl raw -> raw.text();
		};
	}
}
