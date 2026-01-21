package io.github.sirmathhman.tuff;

import io.github.sirmathhman.tuff.compiler.WhileLoopHandler;
import io.github.sirmathhman.tuff.vm.Instruction;

import java.util.List;

final class AppParsingUtils {
	private AppParsingUtils() {
	}

	static Result<Void, CompileError> handleTopLevelWhileLoop(String stmt, List<Instruction> instructions) {
		int condEnd = -1;
		int depth = 1;
		for (int i = 7; i < stmt.length() && depth > 0; i++) {
			if (stmt.charAt(i) == '(') {
				depth++;
			} else if (stmt.charAt(i) == ')') {
				depth--;
			}
			if (depth == 0) {
				condEnd = i;
				break;
			}
		}
		if (condEnd == -1) {
			return Result.err(new CompileError("Malformed while loop: missing closing paren"));
		}

		String remaining = stmt.substring(condEnd + 1).trim();
		return WhileLoopHandler.handleWhileLoop(stmt, remaining, instructions, new java.util.HashMap<>());
	}

	static int findAssignmentEqualsAtDepthZero(String stmt) {
		int depth = 0;
		for (int i = 4; i < stmt.length(); i++) { // Start after "let "
			char c = stmt.charAt(i);
			if (c == '(') {
				depth++;
			} else if (c == ')') {
				depth--;
			}
			if (depth == 0 && c == '=' && i + 1 < stmt.length() && stmt.charAt(i + 1) != '>') {
				if (i == 0 || stmt.charAt(i - 1) != '=') {
					return i;
				}
			}
		}
		return -1;
	}
}
