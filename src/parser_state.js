// Shared mutable parser state (tokens buffer + position cursor).
let _tokens, _pos;

export default {
  get tokens() {
    return _tokens;
  },
  set tokens(v) {
    _tokens = v;
  },
  get pos() {
    return _pos;
  },
  set pos(v) {
    _pos = v;
  },
};
