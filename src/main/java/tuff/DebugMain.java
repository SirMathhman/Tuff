package tuff;

import java.nio.file.Files;
import java.nio.file.Path;

public class DebugMain {
	public static void main(String[] args) throws Exception {
		if (args.length < 1) {
			System.err.println("Usage: DebugMain <file>");
			System.exit(1);
		}
		String content = Files.readString(Path.of(args[0]));
		Parser p = new Parser(content);
		try {
			p.parseTopLevelBlock();
			System.out.println("parsed OK");
		} catch (Exception ex) {
			System.out.println("EXCEPTION: " + ex.getMessage());
			System.out.println("index=" + p.getIndex());
			int pos = p.getIndex();
			int start = Math.max(0, pos - 10);
			int end = Math.min(content.length(), pos + 20);
			String ctx = content.substring(start, end).replace("\n", "\\n").replace("\r", "\\r");
			System.out.println("context snippet: '" + ctx + "'");
			ex.printStackTrace();
		}
	}
}
