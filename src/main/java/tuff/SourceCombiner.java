package tuff;

final class SourceCombiner {
	private SourceCombiner() {
	}

	static String combine(String mainScriptName, java.util.Map<String, String> sources) {
		if (mainScriptName == null || mainScriptName.isEmpty())
			throw new IllegalArgumentException("mainScriptName is required");
		if (sources == null || !sources.containsKey(mainScriptName))
			throw new IllegalArgumentException("missing main script in sources");

		String mainCode = sources.get(mainScriptName);
		if (mainCode == null)
			throw new IllegalArgumentException("missing main script in sources");

		String parameterized = tryCombineParameterized(mainCode, sources);
		if (parameterized != null) {
			return parameterized;
		}

		String namespaced = tryCombineNamespaced(mainCode, sources);
		if (namespaced != null) {
			return namespaced;
		}

		return combineSimple(mainScriptName, sources, mainCode);
	}

	private static String tryCombineParameterized(String mainCode, java.util.Map<String, String> sources) {
		java.util.regex.Pattern useParameterizedPattern = java.util.regex.Pattern
				.compile(
						"(?s)use\\s+([A-Za-z_]\\w*)\\s*\\{([^}]*)\\}\\s*::\\s*\\{\\s*([A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*)\\s*\\}\\s*;");
		java.util.regex.Matcher useParameterizedMatcher = useParameterizedPattern.matcher(mainCode);
		if (useParameterizedMatcher.find()) {
			useParameterizedMatcher.reset();
			StringBuilder combined = new StringBuilder();
			StringBuilder allInitializations = new StringBuilder();
			java.util.Set<String> processedParams = new java.util.HashSet<>();

			while (useParameterizedMatcher.find()) {
				String sourceKey = useParameterizedMatcher.group(1);
				String paramExpr = useParameterizedMatcher.group(2).trim();
				String names = useParameterizedMatcher.group(3);
				String sourceCode = sources.get(sourceKey);
				if (sourceCode == null)
					throw new IllegalArgumentException("missing source: " + sourceKey);

				String paramValue = App.interpret(paramExpr);

				java.util.regex.Pattern inLetPattern = java.util.regex.Pattern
						.compile("(?s)\\bin\\s+let\\s+([A-Za-z_]\\w*)");
				java.util.regex.Matcher inLetMatcher = inLetPattern.matcher(sourceCode);
				java.util.Set<String> inVarNames = new java.util.HashSet<>();
				while (inLetMatcher.find()) {
					inVarNames.add(inLetMatcher.group(1));
				}

				for (String varName : inVarNames) {
					String key = varName + "_" + paramValue;
					if (!processedParams.contains(key)) {
						allInitializations.append("let ").append(varName).append(" = ").append(paramValue)
								.append(";\n");
						processedParams.add(key);
					}
				}

				String cleanedSource = sourceCode.replaceAll("(?s)\\bin\\s+let\\s+", "let ");

				java.util.Map<String, String> exports = new java.util.HashMap<>();
				String[] parts = cleanedSource.split(";");
				for (String part : parts) {
					String p = part.trim();
					if (!p.startsWith("out "))
						continue;
					String after = p.substring(4).trim();
					java.util.regex.Matcher nameMatcher = java.util.regex.Pattern
							.compile("^(?:let|fn|type|struct)\\s+([A-Za-z_]\\w*)").matcher(after);
					if (nameMatcher.find()) {
						exports.put(nameMatcher.group(1), after + ";\n");
					}
				}

				for (String nm : names.split("\\s*,\\s*")) {
					if (!exports.containsKey(nm))
						throw new IllegalArgumentException("export not found: " + nm + " in " + sourceKey);
					combined.append(exports.get(nm));
				}
			}

			combined.insert(0, allInitializations);

			String cleanedMain = mainCode
					.replaceAll(
							"(?s)use\\s+[A-Za-z_]\\w*\\s*\\{[^}]*\\}\\s*::\\s*\\{\\s*[A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*\\s*\\}\\s*;\\s*",
							"");
			combined.append(cleanedMain);
			return combined.toString();
		}
		return null;
	}

	private static String tryCombineNamespaced(String mainCode, java.util.Map<String, String> sources) {
		java.util.regex.Pattern useNamespacePattern = java.util.regex.Pattern
				.compile("(?s)use\\s+([A-Za-z_]\\w*)\\s*::\\s*\\{\\s*([A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*)\\s*\\}\\s*;");
		java.util.regex.Matcher useNamespaceMatcher = useNamespacePattern.matcher(mainCode);
		if (useNamespaceMatcher.find()) {
			useNamespaceMatcher.reset();
			StringBuilder combined = new StringBuilder();
			while (useNamespaceMatcher.find()) {
				String sourceKey = useNamespaceMatcher.group(1);
				String names = useNamespaceMatcher.group(2);
				String sourceCode = sources.get(sourceKey);
				if (sourceCode == null)
					throw new IllegalArgumentException("missing source: " + sourceKey);
				java.util.Map<String, String> exports = new java.util.HashMap<>();
				String[] parts = sourceCode.split(";");
				for (String part : parts) {
					String p = part.trim();
					if (!p.startsWith("out "))
						continue;
					String after = p.substring(4).trim();
					java.util.regex.Matcher nameMatcher = java.util.regex.Pattern
							.compile("^(?:let|fn|type|struct)\\s+([A-Za-z_]\\w*)").matcher(after);
					if (nameMatcher.find()) {
						exports.put(nameMatcher.group(1), after + ";\n");
					}
				}
				for (String nm : names.split("\\s*,\\s*")) {
					if (!exports.containsKey(nm))
						throw new IllegalArgumentException("export not found: " + nm + " in " + sourceKey);
					combined.append(exports.get(nm));
				}
			}
			String cleanedMain = mainCode.replaceAll(
					"(?s)use\\s+[A-Za-z_]\\w*\\s*::\\s*\\{\\s*[A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*\\s*\\}\\s*;\\s*",
					"");
			combined.append(cleanedMain);
			return combined.toString();
		}
		return null;
	}

	private static String combineSimple(String mainScriptName, java.util.Map<String, String> sources, String mainCode) {
		StringBuilder combined = new StringBuilder();
		for (java.util.Map.Entry<String, String> e : sources.entrySet()) {
			String k = e.getKey();
			if (k == null || k.equals(mainScriptName))
				continue;
			String code = e.getValue();
			if (code != null && !code.isEmpty()) {
				combined.append(code);
				if (!code.endsWith(";") && !code.endsWith("}\n") && !code.endsWith("}"))
					combined.append(";\n");
			}
		}
		combined.append(mainCode);
		return combined.toString();
	}

	static String combine(java.util.Map<String, String> sources) {
		return combine("main", sources);
	}
}
