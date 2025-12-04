#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>



int32_t token_fn()
 {
  return
   
1  ;
}

int32_t token_let()
 {
  return
   
2  ;
}

int32_t token_mut()
 {
  return
   
3  ;
}

int32_t token_type()
 {
  return
   
4  ;
}

int32_t token_match()
 {
  return
   
5  ;
}

int32_t token_if()
 {
  return
   
6  ;
}

int32_t token_else()
 {
  return
   
7  ;
}

int32_t token_loop()
 {
  return
   
8  ;
}

int32_t token_return()
 {
  return
   
9  ;
}

int32_t token_extern()
 {
  return
   
10  ;
}

int32_t token_true()
 {
  return
   
11  ;
}

int32_t token_false()
 {
  return
   
12  ;
}

int32_t token_void()
 {
  return
   
13  ;
}

int32_t token_plus()
 {
  return
   
20  ;
}

int32_t token_minus()
 {
  return
   
21  ;
}

int32_t token_star()
 {
  return
   
22  ;
}

int32_t token_slash()
 {
  return
   
23  ;
}

int32_t token_percent()
 {
  return
   
24  ;
}

int32_t token_equal()
 {
  return
   
25  ;
}

int32_t token_equal_equal()
 {
  return
   
26  ;
}

int32_t token_not_equal()
 {
  return
   
27  ;
}

int32_t token_less()
 {
  return
   
28  ;
}

int32_t token_greater()
 {
  return
   
29  ;
}

int32_t token_less_equal()
 {
  return
   
30  ;
}

int32_t token_greater_equal()
 {
  return
   
31  ;
}

int32_t token_and()
 {
  return
   
32  ;
}

int32_t token_or()
 {
  return
   
33  ;
}

int32_t token_not()
 {
  return
   
34  ;
}

int32_t token_ampersand()
 {
  return
   
35  ;
}

int32_t token_dot()
 {
  return
   
36  ;
}

int32_t token_left_paren()
 {
  return
   
40  ;
}

int32_t token_right_paren()
 {
  return
   
41  ;
}

int32_t token_left_brace()
 {
  return
   
42  ;
}

int32_t token_right_brace()
 {
  return
   
43  ;
}

int32_t token_left_bracket()
 {
  return
   
44  ;
}

int32_t token_right_bracket()
 {
  return
   
45  ;
}

int32_t token_comma()
 {
  return
   
46  ;
}

int32_t token_colon()
 {
  return
   
47  ;
}

int32_t token_semicolon()
 {
  return
   
48  ;
}

int32_t token_arrow()
 {
  return
   
49  ;
}

int32_t token_pipe()
 {
  return
   
50  ;
}

int32_t token_eof()
 {
  return
   
99  ;
}

int32_t token_unknown()
 {
  return
   
100  ;
}

int32_t token_ident()
 {
  return
   
101  ;
}

int32_t token_number()
 {
  return
   
102  ;
}

int32_t token_string()
 {
  return
   
103  ;
}

bool is_whitespace(int32_t code)
 {
  return
   
((((code == 32) || (code == 9)) || (code == 10)) || (code == 13))  ;
}

bool is_digit(int32_t code)
 {
  return
   
((code >= 48) && (code <= 57))  ;
}

bool is_alpha(int32_t code)
 {
  return
   
(((code >= 97) && (code <= 122)) || ((code >= 65) && (code <= 90)))  ;
}

bool is_alphanumeric(int32_t code)
 {
  return
   
((struct is_alpha) { code } || (struct is_digit) { code })  ;
}

bool is_hex_digit(int32_t code)
 {
  return
   
(((struct is_digit) { code } || ((code >= 97) && (code <= 102))) || ((code >= 65) && (code <= 70)))  ;
}


int32_t keyword_lookup(struct String text)
 {
  return
   
(struct token_ident) {  }  ;
}


struct LexerContext lexer_new()
 {
  return
   
0  ;
}

int32_t tokenize(struct LexerContext context)
 {
  return
   
(struct token_eof) {  }  ;
}

void skip_whitespace_and_comments()
 {
  return
  ;
}

int32_t read_single_char_token(int32_t ch)
 {
  if (
(ch == 43)  ) {
    return
     
(struct token_plus) {  }    ;
  }
  if (
(ch == 45)  ) {
    return
     
(struct token_minus) {  }    ;
  }
  if (
(ch == 42)  ) {
    return
     
(struct token_star) {  }    ;
  }
  if (
(ch == 47)  ) {
    return
     
(struct token_slash) {  }    ;
  }
  if (
(ch == 37)  ) {
    return
     
(struct token_percent) {  }    ;
  }
  if (
(ch == 61)  ) {
    return
     
(struct token_equal) {  }    ;
  }
  if (
(ch == 40)  ) {
    return
     
(struct token_left_paren) {  }    ;
  }
  if (
(ch == 41)  ) {
    return
     
(struct token_right_paren) {  }    ;
  }
  if (
(ch == 123)  ) {
    return
     
(struct token_left_brace) {  }    ;
  }
  if (
(ch == 125)  ) {
    return
     
(struct token_right_brace) {  }    ;
  }
  if (
(ch == 91)  ) {
    return
     
(struct token_left_bracket) {  }    ;
  }
  if (
(ch == 93)  ) {
    return
     
(struct token_right_bracket) {  }    ;
  }
  if (
(ch == 44)  ) {
    return
     
(struct token_comma) {  }    ;
  }
  if (
(ch == 58)  ) {
    return
     
(struct token_colon) {  }    ;
  }
  if (
(ch == 59)  ) {
    return
     
(struct token_semicolon) {  }    ;
  }
  if (
(ch == 46)  ) {
    return
     
(struct token_dot) {  }    ;
  }
  return
   
(struct token_unknown) {  }  ;
}

int32_t read_double_char_token(int32_t ch, int32_t next_ch)
 {
  if (
((ch == 61) && (next_ch == 61))  ) {
    return
     
(struct token_equal_equal) {  }    ;
  }
  if (
((ch == 33) && (next_ch == 61))  ) {
    return
     
(struct token_not_equal) {  }    ;
  }
  if (
((ch == 60) && (next_ch == 61))  ) {
    return
     
(struct token_less_equal) {  }    ;
  }
  if (
((ch == 62) && (next_ch == 61))  ) {
    return
     
(struct token_greater_equal) {  }    ;
  }
  if (
((ch == 45) && (next_ch == 62))  ) {
    return
     
(struct token_arrow) {  }    ;
  }
  if (
((ch == 38) && (next_ch == 38))  ) {
    return
     
(struct token_and) {  }    ;
  }
  if (
((ch == 124) && (next_ch == 124))  ) {
    return
     
(struct token_or) {  }    ;
  }
  return
   
(struct token_unknown) {  }  ;
}

int32_t read_identifier()
 {
  return
   
(struct token_ident) {  }  ;
}

int32_t read_number()
 {
  return
   
(struct token_number) {  }  ;
}

int32_t read_string()
 {
  return
   
(struct token_string) {  }  ;
}

void main()
 {
  return
  ;
}

