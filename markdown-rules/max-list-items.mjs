// Reports bullet lists (`-`, `*`, `+`) with more than MAX_ITEMS items.
// Items of a nested list count toward that nested list only. Ordered lists are
// not checked.

const MAX_ITEMS = 10;

export default {
  names: ["max-list-items"],
  description: `Bullet lists must have at most ${MAX_ITEMS} items`,
  tags: ["ul", "lists"],
  parser: "markdownit",
  function: (params, onError) => {
    const openLists = [];
    const { parsers } = params;
    const { markdownit } = parsers;
    for (const token of markdownit.tokens) {
      if (token.type === "bullet_list_open") {
        const { map } = token;
        openLists.push({ start: map[0], items: 0 });
      } else if (token.type === "list_item_open") {
        const list = openLists[openLists.length - 1];
        if (list) list.items++;
      } else if (token.type === "bullet_list_close") {
        const list = openLists.pop();
        if (list && list.items > MAX_ITEMS) {
          onError({
            lineNumber: list.start + 1,
            detail: `The list has ${list.items} items; the maximum is ${MAX_ITEMS}.`,
          });
        }
      }
    }
  },
};
