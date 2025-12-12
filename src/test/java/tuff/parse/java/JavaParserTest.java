package tuff.parse.java;

import org.junit.jupiter.api.Test;
import tuff.ast.java.JavaBinaryExpr;
import tuff.ast.java.JavaClassDecl;
import tuff.ast.java.JavaCompilationUnit;
import tuff.ast.java.JavaFieldDecl;
import tuff.ast.java.JavaIdentType;
import tuff.ast.java.JavaMethodDecl;
import tuff.ast.java.JavaNumberExpr;
import tuff.ast.java.JavaReturnStmt;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

public class JavaParserTest {
	@Test
	void parsesGoldenSample() throws Exception {
		String input = Files.readString(Path.of("src", "test", "resources", "golden", "Sample.java"));

		JavaCompilationUnit unit = new JavaParser().parse(input);

		assertEquals(1, unit.imports().size());
		assertEquals("java.util.List", unit.imports().getFirst().qualifiedName());

		assertEquals(1, unit.types().size());
		JavaClassDecl clazz = assertInstanceOf(JavaClassDecl.class, unit.types().getFirst());
		assertEquals("Demo", clazz.name());
		assertEquals(2, clazz.members().size());

		JavaFieldDecl field = assertInstanceOf(JavaFieldDecl.class, clazz.members().getFirst());
		assertEquals(new JavaIdentType("int", field.type().span()), field.type());
		assertEquals("x", field.name());
		JavaNumberExpr one = assertInstanceOf(JavaNumberExpr.class, field.init());
		assertEquals("1", one.text());

		JavaMethodDecl method = assertInstanceOf(JavaMethodDecl.class, clazz.members().get(1));
		assertEquals("add", method.name());
		assertEquals(2, method.params().size());
		assertEquals("a", method.params().getFirst().name());
		assertEquals("b", method.params().get(1).name());

		JavaReturnStmt ret = assertInstanceOf(JavaReturnStmt.class, method.body().stmts().getFirst());
		JavaBinaryExpr sum = assertInstanceOf(JavaBinaryExpr.class, ret.value());
		assertEquals("+", sum.op());
	}
}
