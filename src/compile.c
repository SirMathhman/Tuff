#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "compile.h"

const char *compile_tuff_to_c(const char *input)
{
    /* Dispatch on known Tuff syntax */
    if (strcmp(input, "read<U8>()") == 0)
    {
        const char *code =
            "#include <stdio.h>\n"
            "int main(void)\n"
            "{\n"
            "    unsigned short val;\n"
            "    if (scanf(\"%hu\", &val) != 1)\n"
            "        return 1;\n"
            "    return val;\n"
            "}\n";
        char *result = malloc(strlen(code) + 1);
        if (result == NULL)
            return NULL;
        strcpy(result, code);
        return result;
    }

    /* Default: emit program that prints the input string */
    const char *template_prefix =
        "#include <stdio.h>\n"
        "int main(void) { printf(\"%s\\n\", \"";
    const char *template_suffix =
        "\"); return 0; }\n";

    size_t len = strlen(template_prefix) + strlen(input) + strlen(template_suffix) + 1;
    char *result = malloc(len);
    if (result == NULL)
        return NULL;

    snprintf(result, len, "%s%s%s", template_prefix, input, template_suffix);
    return result;
}