package tuff.print;

import org.junit.jupiter.api.Test;
import tuff.ast.SourceSpan;
import tuff.ast.tuff.TuffImportDecl;
import tuff.ast.tuff.TuffModule;
import tuff.ast.tuff.TuffRawDecl;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class TuffPrinterTest {
	@Test
	void printsImportStatementsAndRawDecls() {
		TuffModule module = new TuffModule(
				List.of(
						new TuffImportDecl(List.of("java", "util"), List.of("List", "Map"), SourceSpan.NONE),
						new TuffImportDecl(List.of("root", "nibling", "Cousin"), List.of(), SourceSpan.NONE)),
				List.of(new TuffRawDecl("class fn X() => {}", SourceSpan.NONE)),
				SourceSpan.NONE);

		String out = new TuffPrinter().print(module);
		assertEquals(
				normalize("from java::util use { List, Map };\nfrom root::nibling::Cousin;\nclass fn X() => {}\n"),
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
