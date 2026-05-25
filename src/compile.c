#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "compile.h"

const char *compile_tuff_to_c(const char *input)
{
    /* Generate a C program whose body prints the compiled output */
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