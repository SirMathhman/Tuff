package io.github.sirmathhman.tuff.compiler.letbinding;

import java.util.Map;

public record MutableVarContext(Map<String, Integer> variableAddresses, int nextMemAddr) {
}
