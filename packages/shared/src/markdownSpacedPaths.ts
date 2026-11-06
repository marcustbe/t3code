import type { Image, Link, PhrasingContent, Root, RootContent, Text } from "mdast";

// CommonMark ends a bare destination at a space, leaving `![a](/Voice notes/a.mp3)` as text. Agents
// write host paths like this, so an absolute path left as text may hold spaces and `(2)`-style parens.
const SPACED_PATH_DESTINATION =
  /(!?)\[([^[\]\n]*)\]\(((?:\/|file:\/\/|[A-Za-z]:[\\/])(?:[^\n()"]|\([^\n()]*\))*?)(?:\s+"([^"\n]*)")?\s*\)/g;

function splitText(text: Text): PhrasingContent[] | null {
  const parts: PhrasingContent[] = [];
  let offset = 0;
  for (const match of text.value.matchAll(SPACED_PATH_DESTINATION)) {
    const [whole, bang, label = "", rawUrl = "", title] = match;
    const url = rawUrl.trimEnd();
    // A destination without whitespace already parsed, so a match here is something else.
    if (!/\s/.test(url)) continue;
    if (match.index > offset) parts.push({ type: "text", value: text.value.slice(offset, match.index) });
    const titleProps = title === undefined ? {} : { title };
    parts.push(
      bang
        ? ({ type: "image", url, alt: label, ...titleProps } satisfies Image)
        : ({
            type: "link",
            url,
            ...titleProps,
            children: label ? [{ type: "text", value: label }] : [],
          } satisfies Link),
    );
    offset = match.index + whole.length;
  }
  if (offset === 0) return null;
  if (offset < text.value.length) parts.push({ type: "text", value: text.value.slice(offset) });
  return parts;
}

export function remarkSpacedPathDestinations() {
  return (tree: Root) => {
    const visit = (node: Root | RootContent) => {
      if (!("children" in node) || node.type === "link" || node.type === "linkReference") return;
      const children = node.children as Array<RootContent>;
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]!;
        if (child.type !== "text") {
          visit(child);
          continue;
        }
        if (!child.value.includes("](")) continue;
        const parts = splitText(child);
        if (parts) children.splice(index, 1, ...parts);
      }
    };
    visit(tree);
  };
}
