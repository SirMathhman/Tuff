package tuff.print;

import tuff.ast.tuff.TuffDecl;
import tuff.ast.tuff.TuffImportDecl;
import tuff.ast.tuff.TuffModule;
import tuff.ast.tuff.TuffRawDecl;

public final class TuffPrinter {
	public String print(TuffModule module) {
		StringBuilder out = new StringBuilder();
		String nl = System.lineSeparator();

		for (TuffImportDecl imp : module.imports()) {
			out.append("from ")
					.append(String.join("::", imp.modulePath()));
			if (imp.isDefaultImport()) {
				out.append(";").append(nl);
				continue;
			}
			out.append(" use { ")
					.append(String.join(", ", imp.names()))
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
