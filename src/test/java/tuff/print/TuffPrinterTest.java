package tuff.print;

import org.junit.jupiter.api.Test;
import tuff.ast.SourceSpan;
import tuff.ast.tuff.TuffModule;
import tuff.ast.tuff.TuffRawDecl;
import tuff.ast.tuff.TuffUseDecl;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class TuffPrinterTest {
	@Test
	void printsUseStatementsAndRawDecls() {
		TuffModule module = new TuffModule(
				List.of(new TuffUseDecl(List.of("java", "util"), List.of("List", "Map"), SourceSpan.NONE)),
				List.of(new TuffRawDecl("class fn X() => {}", SourceSpan.NONE)),
				SourceSpan.NONE);

		String out = new TuffPrinter().print(module);
		assertEquals(
				normalize("from java::util use { List, Map };\nclass fn X() => {}\n"),
				normalize(out));
	}

	private static String normalize(String s) {
		String normalized = s.replace("\r\n", "\n");
		if (!normalized.endsWith("\n")) {
			normalized += "\n";
		}
		return normalized;
	}
}
