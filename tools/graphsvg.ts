// Lays out a nested box graph and renders it to a single SVG.
//
// Graphviz clusters are not obstacles: an edge between two clusters is really
// an edge between nodes inside them, so its spline happily crosses a third
// cluster that sits in the way. Here each box is laid out on its own, then
// takes part in its parent's layout as an ordinary fixed-size node -- and dot
// does route edges around nodes. The resulting drawings are composed by hand.
import { spawnSync } from "node:child_process";

/** A node inside a leaf box. */
export interface LeafNode {
  id: string;
  label: string;
}

/** A box holding functions, drawn as one Graphviz graph of its own. */
export interface LeafBox {
  kind: "leaf";
  id: string;
  label: string;
  nodes: LeafNode[];
  edges: [string, string][];
}

/** A box holding other boxes, laid out with each child as a sized node. */
export interface GroupBox {
  kind: "group";
  id: string;
  label: string;
  children: Box[];
  /** Edges between direct children, by child id. */
  edges: [string, string][];
}

/** A box in the graph: either a leaf (file) or a group (directory). */
export type Box = LeafBox | GroupBox;

/** A finished piece of SVG plus the size of the area it occupies, in points. */
interface Drawing {
  width: number;
  height: number;
  body: string;
}

/** A layout or rendering failure. */
export interface DotError {
  kind: "error";
  message: string;
}

/** The output of a dot layout run: the rendered text, or a failure. */
export type DotOutput = string | DotError;

/** A rendered drawing, or a failure. */
export type DrawingResult = Drawing | DotError;

/**
 * Type guard distinguishing a dot failure from rendered output.
 * @param value {DotOutput} - The value to test.
 * @returns {boolean} True if the value is a failure.
 */
export function isDotError(value: DotOutput): value is DotError {
  return typeof value !== "string";
}

/**
 * Type guard distinguishing a rendering failure from a drawing.
 * @param value {DrawingResult} - The value to test.
 * @returns {boolean} True if the value is a failure.
 */
export function isDrawingError(value: DrawingResult): value is DotError {
  return "kind" in value;
}

/** A placed object in Graphviz JSON. */
interface DotObject {
  _gvid: number;
  name: string;
  pos: string;
}

/** An edge in Graphviz JSON. */
interface DotEdge {
  _draw_: DrawOp[];
  _hdraw_?: DrawOp[];
  tail: number;
  head: number;
}

/** Graphviz JSON, cut down to what placing children and edges needs. */
interface DotJson {
  bb: string;
  objects?: DotObject[];
  edges?: DotEdge[];
}

/** A drawing operation in Graphviz JSON. */
interface DrawOp {
  op: string;
  points?: [number, number][];
}

const BACKGROUND = "#0f172a";
const NODE_FILL = "#1e293b";
const NODE_STROKE = "#475569";
const NODE_TEXT = "#e2e8f0";
const EDGE_COLOR = "#7c8da6";
// Amber marks the way in and the way across: calls that leave a box, and the
// function inside a box that nothing local calls.
const ACCENT = "#f59e0b";
const ACCENT_TEXT = "#fcd34d";
// Violet, not red: a cycle here is usually recursive descent doing its job,
// not a fault to fix.
const CYCLE = "#a78bfa";
const LABEL_COLOR = "#cbd5e1";
// Inter would need installing first: dot sizes every box with the metrics of
// the font it can actually load, so naming one Pango cannot find lays the
// drawing out for the fallback and then labels it in something else.
const FONT = "Arial";
const PAD = { top: 24, side: 10, bottom: 10 };
// Type grows outward: a function, then the file titling it, then the
// directory. Left unset, dot would give the nodes its own default of 14 and
// make the innermost text the largest thing on the page.
const NODE_FONT_SIZE = 12;
const LEAF_STYLE = { color: "#475569", fontSize: 13 };
const GROUP_STYLE = { color: "#64748b", fontSize: 14 };
const MARGIN = 8;

// Every dot source this render produced, in the order it was run, so callers
// can write them out as a debugging artifact.
const sources: string[] = [];

/**
 * Escape a string for use inside a dot quoted string.
 * @param s - The string to escape.
 * @returns The escaped string.
 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Escape a string for use inside XML text.
 * @param s - The string to escape.
 * @returns The escaped string.
 */
function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Run the dot layout engine on a source string.
 * @param source - The dot source to lay out.
 * @param format - The output format.
 * @returns {DotOutput} The rendered output, or a failure.
 */
function runDot(source: string, format: "svg" | "json"): DotOutput {
  sources.push(source);
  const result = spawnSync("dot", [`-T${format}`], {
    input: source,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout) {
    return {
      kind: "error",
      message: `dot -T${format} failed: ${result.stderr ?? result.error}`,
    };
  }
  return result.stdout;
}

// Pull the drawing out of a standalone Graphviz SVG so it can be nested inside
// a larger one: drop the page background, drop the ids that would collide with
// the other fragments, and keep the transform that puts it in a top-left box.
/**
 * Extract the drawing from a standalone Graphviz SVG.
 * @param svg - The SVG document to extract from.
 * @returns {DrawingResult} The extracted drawing, or a failure.
 */
function svgFragment(svg: string): DrawingResult {
  const viewBox = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  const open = /<g id="graph0"[^>]*transform="([^"]*)"[^>]*>/.exec(svg);
  if (!viewBox || !open) {
    return { kind: "error", message: "unrecognized SVG from dot" };
  }
  const inner = svg
    .slice(open.index + open[0].length, svg.lastIndexOf("</g>"))
    .replace(/<polygon fill="(?:white|#ffffff)"[^>]*\/>/, "")
    .replace(/ id="(?:graph|node|edge)\d+"/g, "");
  return {
    width: Number(viewBox[1]),
    height: Number(viewBox[2]),
    body: `<g transform="${open[1]}">${inner}</g>`,
  };
}

// An edge lies on a cycle exactly when its head can find its way back to its
// tail -- a self-call included. One box is one file's functions or one
// directory's children, small enough that a walk per edge costs nothing.
/**
 * Find the edges that lie on a cycle.
 * @param edges - The edges to inspect.
 * @returns The set of cyclic edge keys.
 */
function cyclicEdges(edges: [string, string][]): Set<string> {
  const out = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const seen = out.get(from);
    if (seen) seen.push(to);
    else out.set(from, [to]);
  }
  const cyclic = new Set<string>();
  for (const [from, to] of edges) {
    const visited = new Set<string>();
    const stack = [to];
    while (stack.length) {
      const at = stack.pop()!;
      if (at === from) {
        cyclic.add(edgeKey(from, to));
        break;
      }
      if (visited.has(at)) continue;
      visited.add(at);
      stack.push(...(out.get(at) ?? []));
    }
  }
  return cyclic;
}

/**
 * Build a canonical key for an edge.
 * @param from - The source box id.
 * @param to - The target box id.
 * @returns The edge key.
 */
function edgeKey(from: string, to: string): string {
  return JSON.stringify([from, to]);
}

/**
 * Render a leaf box (a single file's functions) to a drawing.
 * @param box - The leaf box to render.
 * @returns {DrawingResult} The rendered drawing, or a failure.
 */
function renderLeaf(box: LeafBox): DrawingResult {
  // Function names, not the qualified ids, keep the dot source readable and
  // free of the backslashes a Windows path drags in.
  const names = new Map(box.nodes.map((node) => [node.id, node.label]));
  const lines = [
    `digraph "${esc(box.label)}" {`,
    "  graph [nodesep=0.35, ranksep=0.45, splines=ortho];",
    `  node [shape=box, style="rounded,filled", fillcolor="${NODE_FILL}",` +
      ` color="${NODE_STROKE}", fontcolor="${NODE_TEXT}",` +
      ` fontname="${FONT}", fontsize=${NODE_FONT_SIZE}];`,
    `  edge [color="${EDGE_COLOR}"];`,
  ];
  // A function no local call reaches is how other files enter this one, so it
  // gets the accent -- including in a file whose functions call none of each
  // other, where every one of them is an entry.
  const called = new Set(box.edges.map(([, to]) => to));
  for (const node of box.nodes) {
    const attrs = called.has(node.id)
      ? ""
      : ` [color="${ACCENT}", fontcolor="${ACCENT_TEXT}"]`;
    lines.push(`  "${esc(node.label)}"${attrs};`);
  }
  const cyclic = cyclicEdges(box.edges);
  for (const [from, to] of box.edges) {
    const attrs = cyclic.has(edgeKey(from, to)) ? ` [color="${CYCLE}"]` : "";
    lines.push(
      `  "${esc(names.get(from)!)}" -> "${esc(names.get(to)!)}"${attrs};`,
    );
  }
  lines.push("}");
  const dot = runDot(lines.join("\n"), "svg");
  if (isDotError(dot)) return dot;
  return svgFragment(dot);
}

/**
 * Find the points for a draw operation.
 * @param ops - The draw operations to search.
 * @param op - The operation name to find.
 * @returns The points, or an empty array.
 */
function pointsOf(ops: DrawOp[] | undefined, op: string): [number, number][] {
  return ops?.find((entry) => entry.op === op)?.points ?? [];
}

// A Graphviz spline is a start point followed by cubic Bezier triples.
/**
 * Build an SVG path data string from spline points.
 * @param points - The spline points.
 * @param flipY - The y-axis flip function.
 * @returns The path data string.
 */
function pathData(
  points: [number, number][],
  flipY: (y: number) => number,
): string {
  const at = (i: number): string => `${points[i]![0]},${flipY(points[i]![1])}`;
  let d = `M${at(0)}`;
  for (let i = 1; i + 2 < points.length; i += 3) {
    d += ` C${at(i)} ${at(i + 1)} ${at(i + 2)}`;
  }
  return d;
}

/**
 * Build the dot source for a group box.
 * @param box - The group box to render.
 * @param sizes - The child drawings' sizes.
 * @param names - The child box names.
 * @returns The dot source.
 */
function groupDot(
  box: GroupBox,
  sizes: Map<string, Drawing>,
  names: Map<string, string>,
): string {
  const lines = [
    `digraph "${esc(box.label || ".")}" {`,
    "  graph [ranksep=0.6, nodesep=0.5, splines=ortho];",
    '  node [shape=box, fixedsize=true, label=""];',
  ];
  for (const child of box.children) {
    const drawing = sizes.get(child.id)!;
    const w = (drawing.width / 72).toFixed(4);
    const h = (drawing.height / 72).toFixed(4);
    lines.push(`  "${names.get(child.id)}" [width=${w}, height=${h}];`);
  }
  for (const [from, to] of box.edges) {
    lines.push(`  "${names.get(from)}" -> "${names.get(to)}";`);
  }
  lines.push("}");
  return lines.join("\n");
}

// dot returns the edges in its own order, so which logical edge a drawing
// belongs to has to come from its endpoints rather than its position.
/**
 * Draw the edges from a dot JSON layout.
 * @param json - The dot JSON layout.
 * @param flipY - The y-axis flip function.
 * @param colorOf - The function that colors an edge.
 * @returns The SVG parts for the edges.
 */
function drawEdges(
  json: DotJson,
  flipY: (y: number) => number,
  colorOf: (tail: string, head: string) => string,
): string[] {
  const byGvid = new Map(
    (json.objects ?? []).map((o) => [o._gvid, o.name] as const),
  );
  const parts: string[] = [];
  for (const edge of json.edges ?? []) {
    const stroke = colorOf(byGvid.get(edge.tail)!, byGvid.get(edge.head)!);
    const spline = pointsOf(edge._draw_, "b");
    if (spline.length) {
      const d = pathData(spline, flipY);
      parts.push(`<path fill="none" stroke="${stroke}" d="${d}"/>`);
    }
    const arrow = pointsOf(edge._hdraw_, "P");
    if (arrow.length) {
      const pts = arrow.map(([x, y]) => `${x},${flipY(y)}`).join(" ");
      parts.push(
        `<polygon fill="${stroke}" stroke="${stroke}" points="${pts}"/>`,
      );
    }
  }
  return parts;
}

/**
 * Render a group box's content (children and edges) to a drawing.
 * @param box - The group box to render.
 * @returns {DrawingResult} The rendered drawing, or a failure.
 */
function renderGroupContent(box: GroupBox): DrawingResult {
  const sizes = new Map<string, Drawing>();
  for (const child of box.children) {
    const drawing = renderBox(child);
    if (isDrawingError(drawing)) return drawing;
    sizes.set(child.id, drawing);
  }
  // Children are addressed by plain names so an id can be any shape of path.
  const names = new Map(box.children.map((c, i) => [c.id, `box${i}`] as const));
  const dot = runDot(groupDot(box, sizes, names), "json");
  if (isDotError(dot)) return dot;
  const json = JSON.parse(dot) as DotJson;
  const [, , width, height] = json.bb.split(",").map(Number);
  const flipY = (y: number): number => height! - y;

  // Edges first so the children's boxes paint over their endpoints.
  const ids = new Map<string, string>(
    [...names].map(([id, name]) => [name, id] as const),
  );
  const cyclic = cyclicEdges(box.edges);
  const parts = drawEdges(json, flipY, (tail, head) =>
    cyclic.has(edgeKey(ids.get(tail)!, ids.get(head)!)) ? CYCLE : ACCENT,
  );
  for (const child of box.children) {
    const drawing = sizes.get(child.id)!;
    const name = names.get(child.id);
    const object = (json.objects ?? []).find((entry) => entry.name === name)!;
    const [cx, cy] = object.pos.split(",").map(Number);
    const x = (cx! - drawing.width / 2).toFixed(2);
    const y = (flipY(cy!) - drawing.height / 2).toFixed(2);
    parts.push(`<g transform="translate(${x},${y})">${drawing.body}</g>`);
  }
  return { width: width!, height: height!, body: parts.join("\n") };
}

// Wrap a box's contents in its own labeled, rounded border.
/**
 * Wrap a box's contents in its own labeled, rounded border.
 * @param box - The box to decorate.
 * @param inner - The inner drawing.
 * @returns The decorated drawing.
 */
function decorate(box: Box, inner: Drawing): Drawing {
  const style = box.kind === "leaf" ? LEAF_STYLE : GROUP_STYLE;
  const labelWidth = box.label.length * style.fontSize * 0.62 + 2 * PAD.side;
  const width = Math.max(inner.width + 2 * PAD.side, labelWidth);
  const height = inner.height + PAD.top + PAD.bottom;
  const body = [
    `<rect x="0.5" y="0.5" width="${(width - 1).toFixed(2)}" height="${(height - 1).toFixed(2)}"` +
      ` rx="8" fill="none" stroke="${style.color}"/>`,
    `<text x="${(width / 2).toFixed(2)}" y="${PAD.top - 8}" text-anchor="middle"` +
      ` font-family="${FONT}" font-size="${style.fontSize}" fill="${LABEL_COLOR}">` +
      `${escXml(box.label)}</text>`,
    `<g transform="translate(${((width - inner.width) / 2).toFixed(2)},${PAD.top})">`,
    inner.body,
    "</g>",
  ].join("\n");
  return { width, height, body };
}

/**
 * Render a box (leaf or group) to a drawing.
 * @param box - The box to render.
 * @returns {DrawingResult} The rendered drawing, or a failure.
 */
function renderBox(box: Box): DrawingResult {
  const inner = box.kind === "leaf" ? renderLeaf(box) : renderGroupContent(box);
  if (isDrawingError(inner)) return inner;
  return decorate(box, inner);
}

/** The SVG document plus the dot sources used to lay it out. */
export interface GraphResult {
  svg: string;
  sources: string[];
}

/**
 * Render a nested box graph to an SVG document. The returned dot sources are
 * every graph that was laid out along the way, outermost last.
 * @param root - The root group box to render.
 * @returns {GraphResult | DotError} The SVG document and the dot sources used, or a failure.
 */
export function renderGraph(root: GroupBox): GraphResult | DotError {
  sources.length = 0;
  const inner = renderGroupContent(root);
  if (isDrawingError(inner)) return inner;
  const width = inner.width + 2 * MARGIN;
  const height = inner.height + 2 * MARGIN;
  const svg = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
      ` width="${width.toFixed(0)}pt" height="${height.toFixed(0)}pt"` +
      ` viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">`,
    `<rect width="100%" height="100%" fill="${BACKGROUND}"/>`,
    `<g transform="translate(${MARGIN},${MARGIN})">`,
    inner.body,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
  return { svg, sources: [...sources] };
}
