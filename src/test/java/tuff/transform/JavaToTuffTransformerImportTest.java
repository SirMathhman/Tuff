package tuff.transform;

import org.junit.jupiter.api.Test;
import tuff.ast.tuff.TuffImportDecl;
import tuff.parse.java.JavaParser;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

public class JavaToTuffTransformerImportTest {
	@Test
	void lowersNonStaticImportAsDefaultModuleImport() {
		String src = "import root.nibling.Cousin;\n" +
				"class X { int x = 0; int f() { return 0; } }\n";

		var unit = new JavaParser().parse(src);
		var module = new JavaToTuffTransformer().transform(unit);

		assertEquals(1, module.imports().size());
		TuffImportDecl imp = assertInstanceOf(TuffImportDecl.class, module.imports().getFirst());
		assertEquals(List.of("root", "nibling", "Cousin"), imp.modulePath());
		assertEquals(List.of(), imp.names());
	}

	@Test
	void lowersStaticMemberImportAsUseImport() {
		String src = "import static root.nibling.Cousin.getSomeValue;\n" +
				"class X { int x = 0; int f() { return 0; } }\n";

		var unit = new JavaParser().parse(src);
		var module = new JavaToTuffTransformer().transform(unit);

		assertEquals(1, module.imports().size());
		TuffImportDecl imp = assertInstanceOf(TuffImportDecl.class, module.imports().getFirst());
		assertEquals(List.of("root", "nibling", "Cousin"), imp.modulePath());
		assertEquals(List.of("getSomeValue"), imp.names());
	}
}
