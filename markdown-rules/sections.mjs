// Shared helpers for the section rules. A section is a heading together with the
// text that follows it, up to the next heading of any level. Its children are the
// headings directly nested under it (the nearest preceding heading of a lower level).

/**
 * Lists every heading in order, with its line range, its own body range, and its
 * direct subsections.
 *
 * @param tokens - markdown-it tokens for the document.
 * @param lines - the document's lines.
 * @returns the sections in document order.
 */
export function collectSections(tokens, lines) {
  const sections = [];
  for (const token of tokens) {
    if (token.type === "heading_open") {
      sections.push({
        level: Number.parseInt(token.tag.slice(1), 10),
        line: token.map[0],
        bodyStart: token.map[1],
        bodyEnd: lines.length,
        children: [],
      });
    }
  }
  for (let index = 0; index + 1 < sections.length; index++) {
    sections[index].bodyEnd = sections[index + 1].line;
  }
  const open = [];
  for (const section of sections) {
    while (open.length > 0 && open[open.length - 1].level >= section.level) {
      open.pop();
    }
    if (open.length > 0) open[open.length - 1].children.push(section);
    open.push(section);
  }
  return sections;
}

// Characters of the section's own text: the lines after its heading, before the next heading.
/**
 * Counts the characters of a section's own text.
 *
 * @param section - the section whose text is counted.
 * @param lines - the document's lines.
 * @returns the number of characters in the lines of the section's own body.
 */
export function bodyCharacters(section, lines) {
  let total = 0;
  for (let index = section.bodyStart; index < section.bodyEnd; index++) {
    total += (lines[index] ?? "").length;
  }
  return total;
}
