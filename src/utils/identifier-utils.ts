export function isValidIdentifier(s: string): boolean {
  if (s.length === 0) return false;
  const first = s.charCodeAt(0);
  if (
    !(
      (first >= 65 && first <= 90) ||
      (first >= 97 && first <= 122) ||
      first === 95
    )
  ) {
    return false; // not A-Z, a-z, or _
  }
  for (let i = 1; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (
      !(
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122) ||
        (code >= 48 && code <= 57) ||
        code === 95
      )
    ) {
      return false; // not A-Z, a-z, 0-9, or _
    }
  }
  return true;
}
