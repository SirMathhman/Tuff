#pragma once
#include <string>
#include <vector>
#include <map>
#include <memory>

// Simple JSON parser for build configuration
namespace json
{

	struct Value
	{
		enum class Type
		{
			String,
			Array,
			Object,
			Null
		};

		Type type;
		std::string stringValue;
		std::vector<std::shared_ptr<Value>> arrayValue;
		std::map<std::string, std::shared_ptr<Value>> objectValue;

		Value() : type(Type::Null) {}

		static std::shared_ptr<Value> makeString(const std::string &s)
		{
			auto v = std::make_shared<Value>();
			v->type = Type::String;
			v->stringValue = s;
			return v;
		}

		static std::shared_ptr<Value> makeArray()
		{
			auto v = std::make_shared<Value>();
			v->type = Type::Array;
			return v;
		}

		static std::shared_ptr<Value> makeObject()
		{
			auto v = std::make_shared<Value>();
			v->type = Type::Object;
			return v;
		}
	};

	// Parse JSON string into Value tree
	std::shared_ptr<Value> parse(const std::string &json);

} // namespace json
