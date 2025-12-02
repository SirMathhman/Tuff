#include "codegen_cpp.h"
#include <set>

std::string CodeGeneratorCPP::escapeCppKeyword(const std::string &name)
{
	// Special builtin mappings
	if (name == "__c_free")
	{
		return "free";
	}
	
	// C++ keywords that conflict with Tuff variable names
	static const std::set<std::string> cppKeywords = {
			"alignas", "alignof", "and", "and_eq", "asm", "auto",
			"bitand", "bitor", "bool", "break", "case", "catch",
			"char", "char8_t", "char16_t", "char32_t", "class", "compl",
			"concept", "const", "consteval", "constexpr", "constinit", "const_cast",
			"continue", "co_await", "co_return", "co_yield", "decltype", "default",
			"delete", "do", "double", "dynamic_cast", "else", "enum",
			"explicit", "export", "extern", "false", "float", "for",
			"friend", "goto", "if", "inline", "int", "long",
			"mutable", "namespace", "new", "noexcept", "not", "not_eq",
			"nullptr", "operator", "option", "or", "or_eq", "private",
			"protected", "public", "register", "reinterpret_cast", "requires", "result",
			"return", "short", "signed", "sizeof", "static", "static_assert",
			"static_cast", "struct", "switch", "template", "this", "thread_local",
			"throw", "true", "try", "typedef", "typeid", "typename",
			"union", "unsigned", "using", "virtual", "void", "volatile",
			"wchar_t", "while", "xor", "xor_eq"};

	if (cppKeywords.find(name) != cppKeywords.end())
	{
		return name + "_";
	}
	return name;
}
