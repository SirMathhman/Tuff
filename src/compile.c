#define _CRT_SECURE_NO_WARNINGS

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "compile.h"

static CompileError compile_error = NoError;

void clear_compile_error(void)
{
    compile_error = NoError;
}

bool has_compile_error(void)
{
    return compile_error != NoError;
}

CompileError get_compile_error(void)
{
    return compile_error;
}

const char *compile_tuff_to_c(const char *input)
{
    clear_compile_error();

    /* ------------------------------------------------------------------
     * Type table: maps signedness + bit width → C type & scanf format
     * ------------------------------------------------------------------ */
    struct TypeInfo
    {
        const char *ctype;
        const char *scanf_fmt;
    };
    const struct TypeInfo types[] = {
        /*  8 */ {"unsigned char", "%hhu"},
        /* 16 */ {"unsigned short", "%hu"},
        /* 32 */ {"unsigned int", "%u"},
        /* 64 */ {"unsigned long long", "%llu"},
    };
    const struct TypeInfo stypes[] = {
        /*  8 */ {"signed char", "%hhd"},
        /* 16 */ {"signed short", "%hd"},
        /* 32 */ {"signed int", "%d"},
        /* 64 */ {"signed long long", "%lld"},
    };
    const int bits_values[] = {8, 16, 32, 64};
    const int num_types = sizeof(bits_values) / sizeof(bits_values[0]);

    /* ------------------------------------------------------------------
     * Scan for read<U{N}>() / read<I{N}>() calls
     * ------------------------------------------------------------------ */
    int read_count = 0;
    int read_bits = 0;
    int read_signed = 0;
    int first_read = 1;

    const char *scan = input;
    while (*scan)
    {
        const char *rp_u = strstr(scan, "read<U");
        const char *rp_i = strstr(scan, "read<I");
        const char *rp = NULL;
        int is_signed = 0;

        if (rp_u && (!rp_i || rp_u < rp_i))
        {
            rp = rp_u;
            is_signed = 0;
        }
        else if (rp_i)
        {
            rp = rp_i;
            is_signed = 1;
        }

        if (rp == NULL)
            break;

        const char *close = strstr(rp + 6, ">()"); /* 6 = len("read<U" or "read<I") */
        if (close == NULL)
            break;

        char bits_str[16];
        size_t bits_len = close - (rp + 6);
        if (bits_len == 0 || bits_len >= sizeof(bits_str))
            break;

        strncpy(bits_str, rp + 6, bits_len);
        bits_str[bits_len] = '\0';
        int bits = atoi(bits_str);

        if (first_read)
        {
            read_bits = bits;
            read_signed = is_signed;
            first_read = 0;
        }
        else if (bits != read_bits || is_signed != read_signed)
        {
            compile_error = UnsupportedBitWidth;
            return NULL;
        }

        read_count++;
        scan = close + 3;
    }

    /* ------------------------------------------------------------------
     * Look up type info
     * ------------------------------------------------------------------ */
    const struct TypeInfo *ti = NULL;
    for (int i = 0; i < num_types; i++)
    {
        if (bits_values[i] == read_bits)
        {
            ti = read_signed ? &stypes[i] : &types[i];
            break;
        }
    }

    if (read_count > 0 && ti == NULL)
    {
        compile_error = UnsupportedBitWidth;
        return NULL;
    }

    /* ------------------------------------------------------------------
     * Let-binding path:  let <name> : <Type> = read<...>(); <expr>
     * ------------------------------------------------------------------ */
    {
        const char *let_pat = "let ";
        const char *colon_pat = " : ";
        const char *eq_pat = " = ";
        const char *semi_pat = ";";

        const char *lp = strstr(input, let_pat);
        if (lp == input)
        {
            const char *name_start = lp + 4;
            const char *colon = strstr(name_start, colon_pat);
            if (colon)
            {
                size_t name_len = colon - name_start;
                char varname[64];
                if (name_len > 0 && name_len < sizeof(varname))
                {
                    strncpy(varname, name_start, name_len);
                    varname[name_len] = '\0';

                    const char *type_start = colon + 3;
                    const char *eq = strstr(type_start, eq_pat);
                    if (eq)
                    {
                        size_t type_len = eq - type_start;
                        char type_str[16];
                        if (type_len > 0 && type_len < sizeof(type_str))
                        {
                            strncpy(type_str, type_start, type_len);
                            type_str[type_len] = '\0';

                            int let_bits = 0, let_signed = 0;
                            if (type_str[0] == 'U' || type_str[0] == 'I')
                            {
                                let_signed = (type_str[0] == 'I');
                                let_bits = atoi(type_str + 1);
                            }

                            const struct TypeInfo *let_ti = NULL;
                            for (int i = 0; i < num_types; i++)
                                if (bits_values[i] == let_bits)
                                {
                                    let_ti = let_signed ? &stypes[i] : &types[i];
                                    break;
                                }

                            if (let_ti)
                            {
                                const char *read_u = strstr(eq + 3, "read<U");
                                const char *read_i = strstr(eq + 3, "read<I");
                                const char *read_call = NULL;
                                if (read_u && (!read_i || read_u < read_i))
                                    read_call = read_u;
                                else
                                    read_call = read_i;

                                if (read_call)
                                {
                                    const char *close = strstr(read_call + 6, ">()");
                                    if (close)
                                    {
                                        const char *sc = strstr(close + 3, semi_pat);
                                        if (sc)
                                        {
                                            const char *body = sc + 1;
                                            while (*body == ' ')
                                                body++;

                                            char code[4096];
                                            int pos = 0;
                                            pos += snprintf(code + pos, sizeof(code) - pos,
                                                            "#include <stdio.h>\n"
                                                            "int main(void)\n"
                                                            "{\n");
                                            pos += snprintf(code + pos, sizeof(code) - pos,
                                                            "    %s %s;\n"
                                                            "    if (scanf(\"%s\", &%s) != 1)\n"
                                                            "        return 1;\n",
                                                            let_ti->ctype, varname,
                                                            let_ti->scanf_fmt, varname);
                                            pos += snprintf(code + pos, sizeof(code) - pos,
                                                            "    return (int)(%s);\n"
                                                            "}\n",
                                                            body);

                                            char *result = malloc(pos + 1);
                                            if (result)
                                                memcpy(result, code, pos + 1);
                                            return result;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /* ------------------------------------------------------------------
     * Single-read path
     * ------------------------------------------------------------------ */
    if (read_count == 1)
    {
        const char *code_prefix =
            "#include <stdio.h>\n"
            "int main(void)\n"
            "{\n"
            "    ";
        const char *code_mid_read =
            " val;\n"
            "    if (scanf(\"";
        const char *code_suffix =
            "\", &val) != 1)\n"
            "        return 1;\n"
            "    return val;\n"
            "}\n";

        size_t len = strlen(code_prefix) + strlen(ti->ctype) + strlen(code_mid_read) + strlen(ti->scanf_fmt) + strlen(code_suffix) + 1;
        char *result = malloc(len);
        if (result == NULL)
            return NULL;
        snprintf(result, len, "%s%s%s%s%s",
                 code_prefix, ti->ctype, code_mid_read, ti->scanf_fmt, code_suffix);
        return result;
    }

    /* ------------------------------------------------------------------
     * Multi-read path  (read_count >= 2)
     * ------------------------------------------------------------------ */
    if (read_count >= 2)
    {
        /* Build expression with read calls replaced by variable names */
        char expr[1024];
        char *ep = expr;
        const char *src = input;
        int var_idx = 0;

        while (*src)
        {
            const char *rp_u = strstr(src, "read<U");
            const char *rp_i = strstr(src, "read<I");
            const char *rp = NULL;
            if (rp_u && (!rp_i || rp_u < rp_i))
                rp = rp_u;
            else
                rp = rp_i;

            if (rp == NULL || strstr(rp, ">()") == NULL)
            {
                size_t remain = strlen(src);
                if ((ep - expr) + remain >= (int)sizeof(expr))
                    break;
                strcpy(ep, src);
                ep += remain;
                break;
            }

            size_t before = rp - src;
            if ((ep - expr) + before >= (int)sizeof(expr))
                break;
            strncpy(ep, src, before);
            ep += before;

            int n = snprintf(ep, sizeof(expr) - (ep - expr), "val_%d", var_idx);
            if (n < 0)
                break;
            ep += n;
            var_idx++;

            const char *close = strstr(rp + 6, ">()");
            src = close + 3;
        }
        *ep = '\0';

        /* Generate code */
        char code[4096];
        int pos = 0;

        pos += snprintf(code + pos, sizeof(code) - pos,
                        "#include <stdio.h>\n"
                        "#include <stdint.h>\n"
                        "int main(void)\n"
                        "{\n");

        for (int i = 0; i < read_count; i++)
        {
            pos += snprintf(code + pos, sizeof(code) - pos,
                            "    %s val_%d;\n"
                            "    if (scanf(\"%s\", &val_%d) != 1)\n"
                            "        return 1;\n",
                            ti->ctype, i, ti->scanf_fmt, i);
        }

        pos += snprintf(code + pos, sizeof(code) - pos,
                        "    return (int)(%s);\n"
                        "}\n",
                        expr);

        char *result = malloc(pos + 1);
        if (result == NULL)
            return NULL;
        memcpy(result, code, pos + 1);
        return result;
    }

    /* ------------------------------------------------------------------
     * Default: emit program that prints the input string
     * ------------------------------------------------------------------ */
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