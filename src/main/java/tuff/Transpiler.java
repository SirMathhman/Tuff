package tuff;

import tuff.parse.java.JavaParser;
import tuff.print.TuffPrinter;
import tuff.transform.JavaToTuffTransformer;

/**
 * Public entrypoint for Java -> Tuff transpilation.
 *
 * For now this delegates to the legacy implementation in {@link Main}.
 * We will replace the internals with a Java AST -> Tuff AST pipeline
 * incrementally.
 */
public final class Transpiler {
	public String transpile(String javaSource) {
		try {
			var unit = new JavaParser().parse(javaSource);
			var module = new JavaToTuffTransformer().transform(unit);
			return new TuffPrinter().print(module);
		} catch (RuntimeException ex) {
			// Keep legacy behavior for constructs the new parser/transformer does not
			// support yet.
			return new Main().compile(javaSource);
		}
	}
}
