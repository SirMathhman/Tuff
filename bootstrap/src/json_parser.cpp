#include "json_parser.h"
#include <sstream>
#include <cctype>

namespace json
{

	class Parser
	{
	private:
		std::string text;
		size_t pos = 0;

		char peek() const
		{
			return pos < text.size() ? text[pos] : '\0';
		}

		char advance()
		{
			return pos < text.size() ? text[pos++] : '\0';
		}

		void skipWhitespace()
		{
			while (pos < text.size() && std::isspace(text[pos]))
			{
				pos++;
			}
		}

		std::string parseString()
		{
			advance(); // skip opening quote
			std::string result;
			while (peek() != '"' && peek() != '\0')
			{
				if (peek() == '\\')
				{
					advance();
					char c = advance();
					switch (c)
					{
					case 'n':
						result += '\n';
						break;
					case 't':
						result += '\t';
						break;
					case '\\':
						result += '\\';
						break;
					case '"':
						result += '"';
						break;
					default:
						result += c;
					}
				}
				else
				{
					result += advance();
				}
			}
			advance(); // skip closing quote
			return result;
		}

		std::shared_ptr<Value> parseValue()
		{
			skipWhitespace();
			char c = peek();

			if (c == '"')
			{
				return Value::makeString(parseString());
			}
			else if (c == '[')
			{
				return parseArray();
			}
			else if (c == '{')
			{
				return parseObject();
			}
			else if (c == 'n')
			{
				// null
				advance();
				advance();
				advance();
				advance();
				return std::make_shared<Value>();
			}
			return std::make_shared<Value>();
		}

		std::shared_ptr<Value> parseArray()
		{
			auto arr = Value::makeArray();
			advance(); // skip '['
			skipWhitespace();

			if (peek() == ']')
			{
				advance();
				return arr;
			}

			while (true)
			{
				arr->arrayValue.push_back(parseValue());
				skipWhitespace();

				if (peek() == ',')
				{
					advance();
					skipWhitespace();
				}
				else if (peek() == ']')
				{
					advance();
					break;
				}
				else
				{
					break;
				}
			}

			return arr;
		}

		std::shared_ptr<Value> parseObject()
		{
			auto obj = Value::makeObject();
			advance(); // skip '{'
			skipWhitespace();

			if (peek() == '}')
			{
				advance();
				return obj;
			}

			while (true)
			{
				skipWhitespace();
				if (peek() != '"')
					break;

				std::string key = parseString();
				skipWhitespace();

				if (peek() == ':')
				{
					advance();
					skipWhitespace();
					obj->objectValue[key] = parseValue();
				}

				skipWhitespace();

				if (peek() == ',')
				{
					advance();
					skipWhitespace();
				}
				else if (peek() == '}')
				{
					advance();
					break;
				}
				else
				{
					break;
				}
			}

			return obj;
		}

	public:
		Parser(const std::string &jsonText) : text(jsonText) {}

		std::shared_ptr<Value> parse()
		{
			return parseValue();
		}
	};

	std::shared_ptr<Value> parse(const std::string &json)
	{
		Parser parser(json);
		return parser.parse();
	}

} // namespace json
